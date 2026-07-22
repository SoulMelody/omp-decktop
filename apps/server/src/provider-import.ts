import { Database } from "bun:sqlite";
import { mkdir, stat, rename, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { join } from "node:path";

import {
	CommitProviderImportRequest,
	MigrateLegacyProviderRequest,
	ModelProviderApi,
	PreviewProviderImportRequest,
	type PreviewProviderImportResponse,
	type CommitProviderImportResponse,
	ProviderCredentialOperation,
	ProviderImportCollisionAction,
	ProviderImportMapping,
	RollbackLegacyProviderRequest,
	type LegacyProviderMutationResponse,
	type ModelProviderCompatibility,
	type ProviderImportCandidate,
	type ProviderImportPreviewEntry,
	type RedactedProviderDefinition,
	type ScanProviderImportsResponse,
} from "@omp-deck/protocol";

import { MODELS_API_FORMAT_MAP } from "./cc-switch-mapping.ts";
import { ModelsConfigStore, ModelsConfigStoreError } from "./models-config-store.ts";

interface CcSwitchRow {
	id: string;
	app_type: string;
	name: string;
	settings_config: string | null;
	website_url: string | null;
	category: string | null;
	is_current: number | null;
	provider_type: string | null;
	meta: string | null;
}

interface ParsedSettings {
	env: Record<string, string>;
	auth?: Record<string, string>;
	config?: string;
}

export interface ProviderImportServiceOptions {
	store: ModelsConfigStore;
	dbPath?: string;
	agentDir?: string;
}

export class ProviderImportService {
	readonly #dbPath: string;
	readonly #store: ModelsConfigStore;
	readonly #agentDir: string;

	constructor(opts: ProviderImportServiceOptions) {
		this.#dbPath = opts.dbPath ?? resolveCcSwitchDbPath();
		this.#agentDir = opts.agentDir ?? opts.store["paths"].agentDir;
		this.#store = opts.store;
	}

	async scan(): Promise<ScanProviderImportsResponse> {
		try {
			const s = await stat(this.#dbPath);
			if (!s.isFile()) throw new Error("not a regular file");
		} catch (error) {
			return {
				dbPath: this.#dbPath,
				accessible: false,
				candidates: [],
				error: error instanceof Error ? error.message : "cc-switch database not found",
			};
		}
		const candidates: ProviderImportCandidate[] = [];
		const db = new Database(this.#dbPath, { readonly: true });
		try {
			const rows = db
				.query(
					`SELECT id, app_type, name, settings_config, website_url,
                            category, is_current, provider_type, meta
                     FROM providers ORDER BY sort_index, name`,
				)
				.all() as CcSwitchRow[];
			for (const row of rows) candidates.push(toCandidate(row));
		} catch (error) {
			return {
				dbPath: this.#dbPath,
				accessible: false,
				candidates: [],
				error: sanitizeSqlError(error),
			};
		} finally {
			db.close();
		}
		const fingerprint = await this.fingerprint();
		return {
			dbPath: this.#dbPath,
			accessible: true,
			fingerprint,
			candidates,
		};
	}

	/** Source-only utility used by commit() to re-read a single row's raw credential. */
	async #readSourceCredential(sourceKey: string): Promise<string | undefined> {
		const [id, appType] = sourceKey.split("::");
		if (!id || !appType) return undefined;
		const db = new Database(this.#dbPath, { readonly: true });
		try {
			const row = db
				.query(`SELECT settings_config, meta FROM providers WHERE id = ? AND app_type = ?`)
				.get(id, appType) as { settings_config: string | null; meta: string | null } | undefined;
			if (!row) return undefined;
			const settings = parseSettings(row.settings_config);
			return extractApiKey(settings.env, settings.auth);
		} finally {
			db.close();
		}
	}

	async fingerprint(): Promise<string> {
		const hash = createHash("sha256");
		hash.update(this.#dbPath);
		try {
			const s = await stat(this.#dbPath);
			hash.update(`${s.size}:${s.mtimeMs}`);
		} catch {
			hash.update("missing");
		}
		return hash.digest("hex").slice(0, 16);
	}

	async preview(request: PreviewProviderImportRequest): Promise<PreviewProviderImportResponse> {
		const snapshot = await this.#store.snapshot();
		const entries: ProviderImportPreviewEntry[] = [];
		const seen = new Set<string>();
		const warnings: string[] = [];
		for (const mapping of request.mappings) {
			if (seen.has(mapping.targetId)) {
				throw new ModelsConfigStoreError(
					`Duplicate target ID "${mapping.targetId}" within batch`,
					[{ path: `mappings[?].targetId=${mapping.targetId}`, message: "Duplicate" }],
				);
			}
			seen.add(mapping.targetId);
			const existing = snapshot.providers.find((provider) => provider.id === mapping.targetId);
			const action: ProviderImportCollisionAction = existing ? mapping.collisionAction : "new";
			if (existing && mapping.collisionAction === "replace" && !mapping.confirmReplace) {
				throw new ModelsConfigStoreError(
					`Replace collision for "${mapping.targetId}" requires explicit confirmation`,
					[{ path: `mappings[?].targetId=${mapping.targetId}`, message: "Replace not confirmed" }],
				);
			}
			const definition: RedactedProviderDefinition = {
				baseUrl: mapping.baseUrl,
				api: mapping.api,
				headers: {},
			};
			entries.push({
				sourceKey: mapping.sourceKey,
				targetId: mapping.targetId,
				action,
				definition,
				credentialConfigured: mapping.migrateCredential,
				...(mapping.migrateCredential
					? { managedCredentialReference: `[deck-managed:${mapping.targetId.toUpperCase().replace(/[^A-Z0-9_]+/g, "_")}]` }
					: {}),
				changes: existing ? [mapping.collisionAction] : ["create"],
				warnings: [],
			});
		}
		return {
			revision: snapshot.revision,
			sourceFingerprint: request.sourceFingerprint,
			previewToken: createPreviewToken(entries),
			paths: snapshot.paths,
			entries,
			warnings,
		};
	}

	async commit(request: CommitProviderImportRequest): Promise<CommitProviderImportResponse> {
		const scan = await this.scan();
		if (scan.fingerprint !== request.sourceFingerprint) {
			throw new ModelsConfigStoreError(
				"Source fingerprint changed after preview — re-scan required before commit.",
				[{ path: "sourceFingerprint", message: "Source changed" }],
			);
		}
		const candidateByKey = new Map(scan.candidates.map((candidate) => [candidate.sourceKey, candidate]));
		const existing = await this.#store.snapshot();
		const puts: Array<{ id: string; definition: Record<string, unknown>; credential?: ProviderCredentialOperation }> = [];
		const credentials: ProviderCredentialOperation[] = [];
		for (const entry of request.mappings) {
			const candidate = candidateByKey.get(entry.sourceKey);
			if (!candidate) {
				throw new ModelsConfigStoreError(
					`Source key ${entry.sourceKey} not found in current scan`,
					[{ path: `mappings[?].sourceKey=${entry.sourceKey}`, message: "Unknown source" }],
				);
			}
			const collides = existing.providers.find((provider) => provider.id === entry.targetId);
			if (collides && entry.collisionAction === "skip") continue;
			if (collides && entry.collisionAction === "replace" && !entry.confirmReplace) {
				throw new ModelsConfigStoreError(
					`Replace collision for "${entry.targetId}" requires explicit confirmation`,
					[{ path: `mappings[?].targetId=${entry.targetId}`, message: "Replace not confirmed" }],
				);
			}
			const definition = buildDefinitionFromCandidate(candidate, entry);
			let apiKey: string | undefined;
			if (entry.migrateCredential) {
				apiKey = await this.#readSourceCredential(entry.sourceKey);
				if (!apiKey) {
					throw new ModelsConfigStoreError(
						`Source credential for ${entry.targetId} is not usable; skipping credential migration.`,
						[{ path: `mappings[?].targetId=${entry.targetId}`, message: "Source credential unusable" }],
					);
				}
			}
			const credential = entry.migrateCredential && apiKey
				? ({ action: "set", value: apiKey } as ProviderCredentialOperation)
				: undefined;
			puts.push({ id: entry.targetId, definition, ...(credential ? { credential } : {}) });
			if (credential) credentials.push(credential);
		}
		if (puts.length === 0) {
			throw new ModelsConfigStoreError("Import batch contains nothing to commit.");
		}
		const result = await this.#store.commit({
			revision: request.revision,
			puts,
		});
		const inventory = await this.#inventoryRecords();
		const existingIds = new Set(existing.providers.map((p) => p.id));
		const results = inventory.records
			.filter((p) => puts.some((put) => put.id === p.id))
			.map((p) => ({
				sourceKey: request.mappings.find((m) => m.targetId === p.id)?.sourceKey ?? "",
				targetId: p.id,
				status: existingIds.has(p.id) && puts.some((put) => put.id === p.id && put.definition)
					? ("replaced" as const)
					: existingIds.has(p.id)
						? ("merged" as const)
						: ("imported" as const),
			}));
		return {
			revision: result.snapshot.revision,
			paths: inventory.paths,
			providers: inventory.records,
			addable: inventory.addable,
			compatibility: inventory.compatibility,
			results,
		};
		void credentials;
	}

	async migrate(request: MigrateLegacyProviderRequest): Promise<LegacyProviderMutationResponse> {
		const extDir = join(this.#agentDir, "extensions", request.extensionPath);
		const backupTarget = join(this.#agentDir, "disabled-extensions", request.extensionPath);
		try {
			const extStat = await stat(extDir);
			if (!extStat.isDirectory()) throw new Error("legacy extension path is not a directory");
		} catch {
			throw new ModelsConfigStoreError(
				`Legacy extension not found at ${extDir}`,
				[{ path: `extensionPath=${request.extensionPath}`, message: "Not found" }],
			);
		}
		if (!request.mapping) {
			throw new ModelsConfigStoreError(
				`Migration for ${request.extensionPath} requires explicit mapping`,
				[{ path: `extensionPath=${request.extensionPath}`, message: "Mapping required" }],
			);
		}
		const scan = await this.scan();
		const response = await this.commit({
			revision: request.revision,
			sourceFingerprint: scan.fingerprint ?? "",
			previewToken: "",
			mappings: [request.mapping],
		});
		await this.#retireLegacyExtension(extDir, backupTarget);
		return {
			...response,
			providerId: request.extensionPath,
			extensionPath: extDir,
			backupPath: backupTarget,
		};
	}

	async rollback(request: RollbackLegacyProviderRequest): Promise<LegacyProviderMutationResponse> {
		const target = join(this.#agentDir, "extensions", request.providerId);
		const backup = request.backupPath;
		try {
			await stat(backup);
		} catch {
			throw new ModelsConfigStoreError(
				`Backup not found at ${backup}`,
				[{ path: `backupPath=${backup}`, message: "Missing backup" }],
			);
		}
		const targetBaseId = request.providerId;
		const snapshot = await this.#store.snapshot();
		const hadNative = snapshot.providers.find((provider) => provider.id === targetBaseId);
		let deletedRevision = request.revision;
		if (hadNative) {
			const deleted = await this.#store.commit({
				revision: request.revision,
				deletes: [targetBaseId],
			});
			deletedRevision = deleted.snapshot.revision;
		}
		await mkdir(target, { recursive: true });
		try {
			await rename(backup, target);
		} catch (error) {
			throw new ModelsConfigStoreError(
				`Unable to restore backup: ${error instanceof Error ? error.message : "unknown"}`,
			);
		}
		const inventory = await this.#inventoryRecords();
		return {
			revision: deletedRevision,
			paths: inventory.paths,
			providers: inventory.records,
			addable: inventory.addable,
			compatibility: inventory.compatibility,
			providerId: request.providerId,
			extensionPath: target,
			backupPath: backup,
		};
	}

	async #retireLegacyExtension(extDir: string, backupTarget: string): Promise<void> {
		await mkdir(parentDir(backupTarget), { recursive: true });
		await rename(extDir, backupTarget);
	}

	async #inventoryRecords(): Promise<{
		revision: string;
		paths: { models: string; env: string };
		addable: Awaited<ReturnType<typeof import("./model-provider-inventory.ts")["buildInventory"]>>["addable"];
		records: Awaited<ReturnType<typeof import("./model-provider-inventory.ts")["buildInventory"]>>["providers"];
		compatibility: ModelProviderCompatibility;
	}> {
		const { buildInventory, providerInventoryContext } = await import("./model-provider-inventory.ts");
		const { modelProviderCompatibility } = await import("./model-provider-compat.ts");
		const ctx = providerInventoryContext();
		const inventory = await buildInventory({ store: this.#store, ctx });
		const compatibility = modelProviderCompatibility();
		return {
			revision: inventory.revision,
			paths: { models: ctx.modelsPath, env: ctx.envPath },
			records: inventory.providers,
			addable: inventory.addable,
			compatibility,
		};
	}
}

function parentDir(path: string): string {
	const idx = path.lastIndexOf("/");
	return idx > 0 ? path.slice(0, idx) : ".";
}

function resolveCcSwitchDbPath(): string {
	const override = process.env.CC_SWITCH_DB_PATH?.trim();
	if (override) return override;
	return join(homedir(), ".cc-switch", "cc-switch.db");
}

function sanitizeSqlError(error: unknown): string {
	const raw = error instanceof Error ? error.message : String(error);
	return raw.split("\n")[0]!.slice(0, 240);
}

function toCandidate(row: CcSwitchRow): ProviderImportCandidate {
	const settings = parseSettings(row.settings_config);
	const parsedMeta = safeJson<unknown>(row.meta);
	const meta = isRecord(parsedMeta) ? parsedMeta : {};
	const apiFormat = typeof meta.apiFormat === "string" ? meta.apiFormat : undefined;
	const baseUrl = extractBaseUrl(settings.env, settings.config);
	const apiKey = extractApiKey(settings.env, settings.auth);
	const status: ProviderImportCandidate["status"] = !apiFormat
		? "manual-mapping"
		: MODELS_API_FORMAT_MAP[apiFormat]
			? "ready"
			: "manual-mapping";
	const suggestedApi = MODELS_API_FORMAT_MAP[apiFormat ?? ""] as ModelProviderApi | undefined;
	const warning = apiFormat && !suggestedApi
		? `cc-switch apiFormat "${apiFormat}" is not supported by the installed SDK; pick a compatible api manually.`
		: undefined;
	return {
		sourceKey: `${row.id}::${row.app_type}`,
		id: row.id,
		appType: row.app_type,
		name: row.name,
		...(baseUrl ? { baseUrl } : {}),
		...(apiFormat ? { apiFormat } : {}),
		...(suggestedApi ? { suggestedApi } : {}),
		...(row.category ? { category: row.category } : {}),
		isCurrent: !!row.is_current,
		modelHint: extractModel(settings.env, meta, settings.config),
		credentialConfigured: !!apiKey,
		status,
		...(warning ? { warning } : {}),
	};
}

function safeJson<T>(raw: string | null | undefined): T | undefined {
	if (!raw) return undefined;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return undefined;
	}
}

function parseSettings(raw: string | null | undefined): ParsedSettings {
	const parsed = safeJson<unknown>(raw);
	if (!isRecord(parsed)) return { env: {} };
	const env = stringRecord(parsed.env);
	const auth = stringRecord(parsed.auth);
	return {
		env,
		...(Object.keys(auth).length > 0 ? { auth } : {}),
		...(typeof parsed.config === "string" ? { config: parsed.config } : {}),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringRecord(value: unknown): Record<string, string> {
	if (!isRecord(value)) return {};
	return Object.fromEntries(
		Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
	);
}

function extractBaseUrl(env: Record<string, string>, configIni?: string): string | undefined {
	for (const value of Object.values(env)) {
		const url = typeof value === "string" ? value.trim() : "";
		if (/^https?:\/\//i.test(url)) return url;
	}
	if (configIni) {
		const match = configIni.match(/^\s*base_url\s*=\s*"([^"]+)"/m);
		if (match?.[1]) return match[1];
	}
	return undefined;
}

function extractApiKey(
	env: Record<string, string>,
	auth?: Record<string, string>,
): string | undefined {
	return (
		env.ANTHROPIC_AUTH_TOKEN ||
		env.ANTHROPIC_API_KEY ||
		env.OPENAI_API_KEY ||
		env.API_KEY ||
		(auth &&
			(auth.ANTHROPIC_AUTH_TOKEN || auth.ANTHROPIC_API_KEY || auth.OPENAI_API_KEY || auth.API_KEY))
	);
}

function extractModel(
	env: Record<string, string>,
	meta: Record<string, unknown>,
	configIni?: string,
): string | undefined {
	const envModel = env.ANTHROPIC_MODEL || env.OPENAI_MODEL || env.MODEL;
	if (envModel) return stripAnnotations(envModel);
	if (typeof meta.model === "string") return stripAnnotations(meta.model);
	if (configIni) {
		const match = configIni.match(/^\s*model\s*=\s*"([^"]+)"/m);
		if (match?.[1]) return stripAnnotations(match[1]);
	}
	return undefined;
}

function stripAnnotations(raw: string): string | undefined {
	const cleaned = raw.replace(/\[.*?\]$/, "").trim();
	return cleaned.length > 0 ? cleaned : undefined;
}

function buildDefinitionFromCandidate(
	candidate: ProviderImportCandidate,
	mapping: ProviderImportMapping,
): Record<string, unknown> {
	const def: Record<string, unknown> = {};
	if (mapping.baseUrl ?? candidate.baseUrl) def.baseUrl = mapping.baseUrl ?? candidate.baseUrl;
	def.api = mapping.api ?? candidate.suggestedApi;
	def.authHeader = true;
	if (candidate.modelHint) {
		def.models = [
			{
				id: candidate.modelHint,
				name: candidate.modelHint,
				input: ["text"],
				contextWindow: 128_000,
				maxTokens: 8_192,
			},
		];
	}
	return def;
}

function createPreviewToken(entries: ProviderImportPreviewEntry[]): string {
	const hash = createHash("sha256");
	for (const entry of entries) {
		hash.update(entry.sourceKey);
		hash.update(entry.targetId);
		hash.update(entry.action);
		hash.update(entry.credentialConfigured ? "1" : "0");
	}
	return hash.digest("hex").slice(0, 16);
}

void readdir;