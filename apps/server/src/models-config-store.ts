import { createHash, randomUUID } from "node:crypto";
import type { FileHandle } from "node:fs/promises";
import { chmod, mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import type { Api } from "@oh-my-pi/pi-ai/types";
import {
	ModelsConfigSchema,
	type ModelsConfig,
	type ProviderAuthMode,
	type ProviderDiscovery,
} from "@oh-my-pi/pi-coding-agent/config/models-config-schema";
import {
	type ProviderValidationModel,
	validateProviderConfiguration,
} from "@oh-my-pi/pi-coding-agent/config/models-config";
import { getAgentDir } from "@oh-my-pi/pi-utils";
import type {
	ProviderCredentialMetadata,
	ProviderCredentialOperation,
	ProviderValidationIssue,
	RedactedProviderDefinition,
} from "@omp-deck/protocol";
import {
	MODEL_PROVIDER_LOCK_STALE_MS,
	MODEL_PROVIDER_MANAGED_ENV_PREFIX,
	MODEL_PROVIDER_SECRET_SENTINEL,
	validateModelProviderId,
} from "./model-provider-compat.ts";
import {
	getProvidersMap,
	ModelConfigDocumentError,
	parseModelsDocument,
	redactProviderDefinition,
} from "./models-config-store-helpers.ts";
import { readTextIfPresent } from "./fs-utils.ts";
import {
	isMap,
	isScalar,
	isSeq,
	type Document,
	type Node,
	type YAMLMap,
	type YAMLSeq,
} from "yaml";

const ENV_REFERENCE_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const LOCK_RETRY_MS = 20;
const LOCK_TIMEOUT_MS = 2_000;
const managedProcessKeys = new Set<string>();
const mutationTails = new Map<string, Promise<void>>();

export interface ModelsConfigPaths {
	agentDir: string;
	models: string;
	env: string;
	lock: string;
}

export interface StoredProviderRecord {
	id: string;
	definition: RedactedProviderDefinition;
	credential: ProviderCredentialMetadata;
}

export interface ModelsConfigSnapshot {
	revision: string;
	paths: Pick<ModelsConfigPaths, "models" | "env">;
	providers: StoredProviderRecord[];
	validationIssues: ProviderValidationIssue[];
}

export interface ProviderWriteOperation {
	id: string;
	definition: RedactedProviderDefinition;
	credential?: ProviderCredentialOperation;
	/** Patch (default) preserves untouched fields; merge uses deletion semantics inside object patches; replace rebuilds the whole node. */
	mode?: "patch" | "merge" | "replace";
}

export interface ModelsConfigCommitInput {
	revision: string;
	puts?: ProviderWriteOperation[];
	deletes?: string[];
}

export interface ModelsConfigTransactionReceipt {
	before: { models: string; env: string; revision: string };
	after: { models: string; env: string; revision: string };
	managedKeys: string[];
}

export interface ModelsConfigCommitResult {
	snapshot: ModelsConfigSnapshot;
	receipt: ModelsConfigTransactionReceipt;
}

export interface ResolvedProviderSecrets {
	apiKey?: string;
	headers: Record<string, string>;
	commandCredentialUnavailable: boolean;
	knownSecrets: string[];
}

export class ModelsRevisionConflictError extends Error {
	constructor(readonly revision: string) {
		super("models.yml or agent .env changed; reload before saving");
		this.name = "ModelsRevisionConflictError";
	}
}

export class ModelsConfigStoreError extends Error {
	constructor(message: string, readonly issues: ProviderValidationIssue[] = [], options?: ErrorOptions) {
		super(message, options);
		this.name = "ModelsConfigStoreError";
	}
}

export function resolveModelsConfigPaths(agentDir = getAgentDir()): ModelsConfigPaths {
	const models = join(agentDir, "models.yml");
	return { agentDir, models, env: join(agentDir, ".env"), lock: `${models}.lock` };
}

export function modelsRevision(modelsSource: string, envSource: string): string {
	return createHash("sha256")
		.update(String(Buffer.byteLength(modelsSource)))
		.update(":")
		.update(modelsSource)
		.update(String(Buffer.byteLength(envSource)))
		.update(":")
		.update(envSource)
		.digest("hex");
}

export function managedProviderEnvName(providerId: string, suffix?: number): string {
	const encoded = Buffer.from(providerId, "utf8").toString("hex").toUpperCase();
	return `${MODEL_PROVIDER_MANAGED_ENV_PREFIX}${encoded}_API_KEY${suffix && suffix > 1 ? `_${suffix}` : ""}`;
}

export class ModelsConfigStore {
	readonly paths: ModelsConfigPaths;

	constructor(options: { agentDir?: string; modelsPath?: string } = {}) {
		if (options.modelsPath) {
			const models = options.modelsPath;
			const agentDir = dirname(models);
			this.paths = { agentDir, models, env: join(agentDir, ".env"), lock: `${models}.lock` };
		} else {
			this.paths = resolveModelsConfigPaths(options.agentDir);
		}
	}

	async snapshot(): Promise<ModelsConfigSnapshot> {
		const state = await this.#readState();
		return snapshotFromState(this.paths, state.models, state.env);
	}

	async commit(input: ModelsConfigCommitInput): Promise<ModelsConfigCommitResult> {
		return this.#exclusive(async () => {
			const before = await this.#readState();
			const currentRevision = modelsRevision(before.models, before.env);
			if (input.revision !== currentRevision) throw new ModelsRevisionConflictError(currentRevision);

			const document = parseModelsDocument(before.models);
			const providersMap = getProvidersMap(document) ?? createProvidersMap(document);
			let nextEnv = before.env;
			const managedKeys = new Set<string>();

			const deleteIds = new Set((input.deletes ?? []).map(validateModelProviderId));
			for (const id of deleteIds) {
				const existing = providersMap.get(id, true);
				if (!isMap(existing)) throw new ModelsConfigStoreError(`Provider not found: ${id}`);
				const oldApiKey = scalarString(existing.get("apiKey", true));
				if (oldApiKey && isManagedReference(oldApiKey, id, nextEnv)) {
					nextEnv = updateEnvSource(nextEnv, new Map([[oldApiKey, null]]));
					managedKeys.add(oldApiKey);
				}
				providersMap.delete(id);
			}

			const seenPuts = new Set<string>();
			for (const operation of input.puts ?? []) {
				const id = validateModelProviderId(operation.id);
				if (seenPuts.has(id) || deleteIds.has(id)) {
					throw new ModelsConfigStoreError(`Provider ${id} appears more than once in one transaction`);
				}
				seenPuts.add(id);
				if (Object.hasOwn(operation.definition, "apiKey")) {
					throw new ModelsConfigStoreError("apiKey is write-only and cannot be included in a provider definition");
				}

				const existing = providersMap.get(id, true);
				const oldProvider = isMap(existing) ? existing : undefined;
				const oldApiKeyNode = oldProvider?.get("apiKey", true) as Node | undefined;
				const mode = operation.mode ?? "patch";
				let provider: YAMLMap;
				if (mode === "replace") {
					provider = createBlockMap(document);
					mergeMapInPlace(document, provider, operation.definition, { deleteMissing: true, inHeaders: false });
					if (oldApiKeyNode && operation.credential?.action !== "set" && operation.credential?.action !== "remove") {
						provider.set("apiKey", oldApiKeyNode);
					}
				} else if (mode === "merge") {
					provider = oldProvider ?? createBlockMap(document);
					if (!isMap(existing)) provider.flow = false;
					mergeMapInPlace(document, provider, operation.definition, {
						deleteMissing: true,
						inHeaders: false,
					});
				} else {
					provider = oldProvider ?? createBlockMap(document);
					if (!isMap(existing)) provider.flow = false;
					applyPatchInPlace(document, provider, operation.definition);
				}

				const credential = operation.credential ?? { action: "preserve" as const };
				if (credential.action === "set") {
					const value = credential.value.trim();
					if (!value) throw new ModelsConfigStoreError("API key cannot be empty");
					const oldReference = scalarString(oldApiKeyNode);
					const reference = chooseManagedEnvName(id, nextEnv, providersMap, oldReference);
					if (oldReference && oldReference !== reference && isManagedReference(oldReference, id, nextEnv)) {
						nextEnv = updateEnvSource(nextEnv, new Map([[oldReference, null]]));
						managedKeys.add(oldReference);
					}
					nextEnv = updateEnvSource(nextEnv, new Map([[reference, value]]));
					managedKeys.add(reference);
					provider.set("apiKey", reference);
				} else if (credential.action === "remove") {
					const oldReference = scalarString(oldApiKeyNode);
					provider.delete("apiKey");
					if (oldReference && isManagedReference(oldReference, id, nextEnv)) {
						nextEnv = updateEnvSource(nextEnv, new Map([[oldReference, null]]));
						managedKeys.add(oldReference);
					}
				}

				if (!isMap(existing) || mode === "replace") providersMap.set(id, provider);
			}

			const nextModels = document.toString();
			assertValidModelsDocument(document);
			await this.#writePair(before, { models: nextModels, env: nextEnv });
			applyManagedEnvironment(before.env, nextEnv, managedKeys);

			const afterRevision = modelsRevision(nextModels, nextEnv);
			return {
				snapshot: snapshotFromState(this.paths, nextModels, nextEnv),
				receipt: {
					before: { ...before, revision: currentRevision },
					after: { models: nextModels, env: nextEnv, revision: afterRevision },
					managedKeys: [...managedKeys],
				},
			};
		});
	}

	async rollback(receipt: ModelsConfigTransactionReceipt): Promise<ModelsConfigSnapshot> {
		return this.#exclusive(async () => {
			const current = await this.#readState();
			if (current.models !== receipt.after.models || current.env !== receipt.after.env) {
				throw new ModelsRevisionConflictError(modelsRevision(current.models, current.env));
			}
			await this.#writePair(current, receipt.before);
			applyManagedEnvironment(receipt.after.env, receipt.before.env, new Set(receipt.managedKeys));
			return snapshotFromState(this.paths, receipt.before.models, receipt.before.env);
		});
	}

	async resolveProviderSecrets(providerId: string, modelId?: string): Promise<ResolvedProviderSecrets> {
		const state = await this.#readState();
		const document = parseModelsDocument(state.models);
		const provider = getProvidersMap(document)?.get(providerId, true);
		if (!isMap(provider)) throw new ModelsConfigStoreError(`Provider not found: ${providerId}`);
		const env = parseEnvSource(state.env).values;
		const knownSecrets = new Set<string>();
		let commandCredentialUnavailable = false;

		const apiNode = provider.get("apiKey", true) as Node | undefined;
		let apiKey: string | undefined;
		if (isCommandValue(apiNode)) {
			commandCredentialUnavailable = true;
		} else {
			apiKey = resolveConfigString(apiNode, env);
			if (apiKey) knownSecrets.add(apiKey);
		}

		const headers: Record<string, string> = {};
		const applyHeaders = (node: unknown): void => {
			if (!isMap(node)) return;
			for (const pair of node.items) {
				const name = scalarString(pair.key);
				if (!name) continue;
				if (isCommandValue(pair.value as Node | undefined)) {
					commandCredentialUnavailable = true;
					delete headers[name];
					continue;
				}
				const value = resolveConfigString(pair.value as Node | undefined, env);
				if (value !== undefined) {
					headers[name] = value;
					knownSecrets.add(value);
				}
			}
		};
		applyHeaders(provider.get("headers", true));
		if (modelId) {
			const models = provider.get("models", true);
			if (isSeq(models)) {
				const model = models.items.find((item) => isMap(item) && item.get("id") === modelId);
				if (isMap(model)) applyHeaders(model.get("headers", true));
			}
		}

		return { ...(apiKey ? { apiKey } : {}), headers, commandCredentialUnavailable, knownSecrets: [...knownSecrets] };
	}

	async rawProviderDefinition(providerId: string): Promise<Record<string, unknown> | undefined> {
		const state = await this.#readState();
		const provider = getProvidersMap(parseModelsDocument(state.models))?.get(providerId, true);
		return isMap(provider) ? (provider.toJSON() as Record<string, unknown>) : undefined;
	}

	async #readState(): Promise<{ models: string; env: string }> {
		const [models, env] = await Promise.all([readTextIfPresent(this.paths.models), readTextIfPresent(this.paths.env)]);
		return { models, env };
	}

	async #writePair(
		before: { models: string; env: string },
		after: { models: string; env: string },
	): Promise<void> {
		const current = await this.#readState();
		if (current.models !== before.models || current.env !== before.env) {
			throw new ModelsRevisionConflictError(modelsRevision(current.models, current.env));
		}

		const envChanged = before.env !== after.env;
		const modelsChanged = before.models !== after.models;
		let wroteEnv = false;
		try {
			if (envChanged) {
				await atomicWrite(this.paths.env, after.env, 0o600);
				wroteEnv = true;
			}
			if (modelsChanged) {
				const nowModels = await readFile(this.paths.models, "utf8").catch(() => before.models);
				const nowEnv = await readFile(this.paths.env, "utf8").catch(() => after.env);
				if (nowModels !== before.models || nowEnv !== after.env) {
					throw new ModelsRevisionConflictError(modelsRevision(nowModels, nowEnv));
				}
				await atomicWrite(this.paths.models, after.models, await targetMode(this.paths.models, 0o600));
			}
		} catch (error) {
			if (wroteEnv && (await readFile(this.paths.env, "utf8").catch(() => "")) === after.env) {
				await atomicWrite(this.paths.env, before.env, 0o600).catch(() => undefined);
			}
			throw error;
		}
	}

	#exclusive<T>(operation: () => Promise<T>): Promise<T> {
		const previous = mutationTails.get(this.paths.models) ?? Promise.resolve();
		const result = previous.then(
			() => this.#withFileLock(operation),
			() => this.#withFileLock(operation),
		);
		mutationTails.set(
			this.paths.models,
			result.then(
				() => undefined,
				() => undefined,
			),
		);
		return result;
	}

	async #withFileLock<T>(operation: () => Promise<T>): Promise<T> {
		await mkdir(dirname(this.paths.lock), { recursive: true });
		const deadline = Date.now() + LOCK_TIMEOUT_MS;
		let handle: FileHandle;
		while (true) {
			try {
				handle = await open(this.paths.lock, "wx", 0o600);
				try {
					await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: Date.now() }), "utf8");
					await handle.sync();
				} catch (error) {
					await handle.close().catch(() => undefined);
					await unlink(this.paths.lock).catch(() => undefined);
					throw error;
				}
				break;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
				if (await removeStaleLock(this.paths.lock)) continue;
				if (Date.now() >= deadline) {
					const state = await this.#readState();
					throw new ModelsRevisionConflictError(modelsRevision(state.models, state.env));
				}
				await delay(LOCK_RETRY_MS);
			}
		}
		try {
			return await operation();
		} finally {
			await handle.close().catch(() => undefined);
			await unlink(this.paths.lock).catch(() => undefined);
		}
	}
}

function createProvidersMap(document: Document): YAMLMap {
	const contents = document.contents;
	if (!isMap(contents)) {
		throw new ModelsConfigStoreError("Invalid models.yml: top-level value must be an object");
	}
	const map = createBlockMap(document);
	contents.set("providers", map);
	return map;
}

function createBlockMap(document: Document): YAMLMap {
	const created = document.createNode({}) as YAMLMap;
	created.flow = false;
	return created;
}

function snapshotFromState(paths: ModelsConfigPaths, modelsSource: string, envSource: string): ModelsConfigSnapshot {
	const document = parseModelsDocument(modelsSource);
	const env = parseEnvSource(envSource).values;
	const providers = getProvidersMap(document);
	const records: StoredProviderRecord[] = [];
	if (providers) {
		for (const pair of providers.items) {
			const id = scalarString(pair.key);
			if (!id || !isMap(pair.value)) continue;
			const definition = redactProviderDefinition(pair.value.toJSON()) as RedactedProviderDefinition;
			const credential = credentialMetadata(pair.value, id, envSource, env);
			records.push({ id, definition, credential });
		}
	}
	return {
		revision: modelsRevision(modelsSource, envSource),
		paths: { models: paths.models, env: paths.env },
		providers: records,
		validationIssues: validateModelsDocument(document),
	};
}

function credentialMetadata(provider: YAMLMap, id: string, envSource: string, env: Map<string, string>): ProviderCredentialMetadata {
	const node = provider.get("apiKey", true) as Node | undefined;
	if (node === undefined || node === null) {
		return { configured: provider.get("auth") === "none", source: "none", count: 0, managed: false };
	}
	if (isCommandValue(node)) return { configured: true, source: "command", count: 1, managed: false };
	const value = scalarString(node);
	if (!value) return { configured: false, source: "none", count: 0, managed: false };
	if (ENV_REFERENCE_RE.test(value)) {
		const managed = isManagedReference(value, id, envSource);
		return {
			configured: env.has(value) || process.env[value] !== undefined || managed,
			source: managed ? "managed-env" : "external-env",
			count: 1,
			managed,
		};
	}
	return { configured: true, source: "literal", count: 1, managed: false };
}

function validateModelsDocument(document: Document): ProviderValidationIssue[] {
	const raw = document.toJSON() as unknown;
	const checked = ModelsConfigSchema(raw);
	if (Array.isArray(checked)) {
		return checked.map((issue: { path?: unknown[]; problem?: string }) => ({
			path: Array.isArray(issue.path) ? issue.path.map(String).join(".") || "root" : "root",
			message: issue.problem ?? "invalid value",
		}));
	}

	const config = checked as ModelsConfig;
	const issues: ProviderValidationIssue[] = [];
	for (const [providerId, provider] of Object.entries(config.providers ?? {})) {
		const seen = new Set<string>();
		for (const model of provider.models ?? []) {
			if (seen.has(model.id)) {
				issues.push({ path: `providers.${providerId}.models`, message: `duplicate model ID: ${model.id}` });
			}
			seen.add(model.id);
		}
		try {
			validateProviderConfiguration(
				providerId,
				{
					baseUrl: provider.baseUrl,
					headers: provider.headers,
					apiKey: provider.apiKey,
					api: provider.api as Api | undefined,
					auth: (provider.auth ?? "apiKey") as ProviderAuthMode,
					discovery: provider.discovery as ProviderDiscovery | undefined,
					compat: provider.compat,
					remoteCompaction: provider.remoteCompaction,
					disableStrictTools: provider.disableStrictTools,
					modelOverrides: provider.modelOverrides,
					models: (provider.models ?? []) as ProviderValidationModel[],
				},
				"models-config",
			);
		} catch (error) {
			issues.push({
				path: `providers.${providerId}`,
				message: error instanceof Error ? error.message.replace(/[^\x20-\x7E]+/g, " ") : "invalid provider",
			});
		}
	}
	return issues;
}

function assertValidModelsDocument(document: Document): void {
	const issues = validateModelsDocument(document);
	if (issues.length > 0) throw new ModelsConfigStoreError("Provider configuration is invalid", issues);
}

function applyPatchInPlace(document: Document, target: YAMLMap, input: Record<string, unknown>): void {
	for (const [key, value] of Object.entries(input)) {
		if (key === "apiKey") throw new ModelsConfigStoreError("apiKey is write-only");
		if (value === MODEL_PROVIDER_SECRET_SENTINEL) {
			const existing = target.get(key, true);
			if (existing === undefined) {
				throw new ModelsConfigStoreError(`Secret sentinel references missing field: ${key}`);
			}
			continue;
		}
		const existing = target.get(key, true) as Node | undefined;
		if (isPlainObject(value)) {
			const map = isMap(existing) ? existing : createBlockMap(document);
			applyPatchInPlace(document, map, value);
			if (!isMap(existing)) target.set(key, map);
			continue;
		}
		if (Array.isArray(value)) {
			const sequence = isSeq(existing) ? existing : (document.createNode([]) as YAMLSeq);
			mergeSequenceInPlace(document, sequence, value);
			if (!isSeq(existing)) target.set(key, sequence);
			continue;
		}
		if (deepEqual(nodeJson(existing), value)) continue;
		target.set(key, document.createNode(value));
	}
}

function mergeMapInPlace(
	document: Document,
	target: YAMLMap,
	input: Record<string, unknown>,
	options: { deleteMissing: boolean; inHeaders: boolean },
): void {
	if (options.deleteMissing) {
		for (const pair of [...target.items]) {
			const key = scalarString(pair.key);
			if (!key || key === "apiKey") continue;
			if (!Object.hasOwn(input, key)) target.delete(key);
		}
	}

	for (const [key, value] of Object.entries(input)) {
		if (key === "apiKey") throw new ModelsConfigStoreError("apiKey is write-only");
		if (value === MODEL_PROVIDER_SECRET_SENTINEL) {
			if (!options.inHeaders || (target.get(key, true) as Node | undefined) === undefined) {
				throw new ModelsConfigStoreError(`Secret sentinel is not valid at ${key}`);
			}
			continue;
		}
		const existing = target.get(key, true) as Node | undefined;
		if (isPlainObject(value)) {
			const map = isMap(existing) ? existing : createBlockMap(document);
			mergeMapInPlace(document, map, value, {
				deleteMissing: true,
				inHeaders: key.toLowerCase() === "headers",
			});
			if (!isMap(existing)) target.set(key, map);
			continue;
		}
		if (Array.isArray(value)) {
			const sequence = isSeq(existing) ? existing : (document.createNode([]) as YAMLSeq);
			mergeSequenceInPlace(document, sequence, value);
			if (!isSeq(existing)) target.set(key, sequence);
			continue;
		}
		if (deepEqual(nodeJson(existing), value)) continue;
		target.set(key, document.createNode(value));
	}
}

function mergeSequenceInPlace(document: Document, target: YAMLSeq, values: unknown[]): void {
	const byId = new Map<string, YAMLMap>();
	for (const item of target.items) {
		if (!isMap(item)) continue;
		const id = item.get("id");
		if (typeof id === "string" && !byId.has(id)) byId.set(id, item);
	}
	const used = new Set<Node>();
	const merged = values.map((value, index) => {
		const id = isPlainObject(value) && typeof value.id === "string" ? value.id : undefined;
		const keyed = id ? byId.get(id) : undefined;
		const positional = target.items[index] as Node | undefined;
		const existing = keyed && !used.has(keyed) ? keyed : !id && positional && !used.has(positional) ? positional : undefined;
		if (isMap(existing) && isPlainObject(value)) {
			used.add(existing);
			mergeMapInPlace(document, existing, value, { deleteMissing: true, inHeaders: false });
			return existing;
		}
		if (isSeq(existing) && Array.isArray(value)) {
			used.add(existing);
			mergeSequenceInPlace(document, existing, value);
			return existing;
		}
		if (existing && deepEqual(nodeJson(existing), value)) {
			used.add(existing);
			return existing;
		}
		if (isPlainObject(value)) {
			const created = createBlockMap(document);
			mergeMapInPlace(document, created, value, { deleteMissing: true, inHeaders: false });
			return created;
		}
		if (Array.isArray(value)) {
			const created = document.createNode([]) as YAMLSeq;
			mergeSequenceInPlace(document, created, value);
			return created;
		}
		if (value === MODEL_PROVIDER_SECRET_SENTINEL) throw new ModelsConfigStoreError("Secret sentinel is not valid here");
		return document.createNode(value);
	});
	target.items.splice(0, target.items.length, ...merged);
}

function chooseManagedEnvName(id: string, envSource: string, providers: YAMLMap, oldReference?: string): string {
	const parsed = parseEnvSource(envSource).values;
	const references = new Set<string>();
	for (const pair of providers.items) {
		if (!isMap(pair.value)) continue;
		const reference = scalarString(pair.value.get("apiKey", true));
		if (reference && reference !== oldReference) references.add(reference);
	}
	for (let suffix = 1; suffix < 10_000; suffix += 1) {
		const candidate = managedProviderEnvName(id, suffix);
		if (candidate === oldReference && isManagedReference(candidate, id, envSource)) return candidate;
		if (references.has(candidate) || parsed.has(candidate) || (process.env[candidate] !== undefined && !managedProcessKeys.has(candidate))) {
			continue;
		}
		return candidate;
	}
	throw new ModelsConfigStoreError(`Could not allocate a managed environment variable for ${id}`);
}

function isManagedReference(reference: string, providerId: string, envSource: string): boolean {
	if (!reference.startsWith(MODEL_PROVIDER_MANAGED_ENV_PREFIX)) return false;
	const base = managedProviderEnvName(providerId);
	if (reference !== base && !reference.startsWith(`${base}_`)) return false;
	return parseEnvSource(envSource).values.has(reference);
}

function parseEnvSource(source: string): { values: Map<string, string> } {
	const values = new Map<string, string>();
	for (const line of source.split(/\r?\n/)) {
		const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
		if (!match) continue;
		values.set(match[1]!, parseEnvValue(match[2] ?? ""));
	}
	return { values };
}

function parseEnvValue(raw: string): string {
	const value = raw.trim();
	const double = /^"((?:\\.|[^"])*)"\s*(?:#.*)?$/.exec(value);
	if (double) {
		return double[1]!.replace(/\\([\\nrt"])/g, (_match, escaped: string) => {
			if (escaped === "n") return "\n";
			if (escaped === "r") return "\r";
			if (escaped === "t") return "\t";
			return escaped;
		});
	}
	const single = /^'([^']*)'\s*(?:#.*)?$/.exec(value);
	if (single) return single[1]!;
	return value.replace(/\s+#.*$/, "").trim();
}

function updateEnvSource(source: string, updates: Map<string, string | null>): string {
	const lines = source ? source.replace(/\r\n/g, "\n").split("\n") : [];
	if (source.endsWith("\n")) lines.pop();
	const remaining = new Map(updates);
	const next: string[] = [];
	for (const line of lines) {
		const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
		if (!match || !remaining.has(match[1]!)) {
			next.push(line);
			continue;
		}
		const key = match[1]!;
		const value = remaining.get(key);
		remaining.delete(key);
		if (value !== null && value !== undefined) next.push(`${key}=${quoteEnvValue(value)}`);
	}
	const additions: string[] = [];
	for (const [key, value] of remaining) {
		if (value === null) continue;
		additions.push(`${key}=${quoteEnvValue(value)}`);
	}
	if (additions.length > 0) {
		if (next.length > 0 && next.at(-1) !== "") next.push("");
		if (!next.some((line) => line === "# omp-deck managed")) next.push("# omp-deck managed");
		for (const entry of additions) next.push(entry);
	}
	return next.length > 0 ? `${next.join("\n")}\n` : "";
}

function quoteEnvValue(value: string): string {
	return `"${value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll("\r", "\\r").replaceAll('"', '\\"')}"`;
}

function applyManagedEnvironment(beforeSource: string, afterSource: string, keys: ReadonlySet<string>): void {
	const before = parseEnvSource(beforeSource).values;
	const after = parseEnvSource(afterSource).values;
	for (const key of keys) {
		const oldValue = before.get(key);
		const newValue = after.get(key);
		if (newValue === undefined) {
			if (managedProcessKeys.has(key) || process.env[key] === oldValue) delete process.env[key];
			managedProcessKeys.delete(key);
			continue;
		}
		if (process.env[key] === undefined || managedProcessKeys.has(key) || process.env[key] === oldValue) {
			process.env[key] = newValue;
			managedProcessKeys.add(key);
		}
	}
}

function resolveConfigString(node: Node | undefined, env: Map<string, string>): string | undefined {
	const value = scalarString(node);
	if (!value || value.startsWith("!")) return undefined;
	if (ENV_REFERENCE_RE.test(value)) return process.env[value] ?? env.get(value);
	return value;
}

function isCommandValue(node: Node | undefined): boolean {
	if (!node) return false;
	if (isScalar(node) && node.tag === "!command") return true;
	return scalarString(node)?.startsWith("!") === true;
}

function scalarString(node: unknown): string | undefined {
	if (typeof node === "string") return node;
	if (isScalar(node) && typeof node.value === "string") return node.value;
	return undefined;
}

function nodeJson(node: Node | undefined): unknown {
	return node === undefined ? undefined : node.toJSON();
}

function deepEqual(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

async function targetMode(path: string, fallback: number): Promise<number> {
	try {
		return (await stat(path)).mode & 0o777;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
		throw error;
	}
}

async function atomicWrite(path: string, content: string, mode: number): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
	let handle: FileHandle | undefined;
	try {
		handle = await open(temporary, "wx", mode);
		await handle.writeFile(content, "utf8");
		await handle.sync();
		await handle.close();
		handle = undefined;
		if (process.platform !== "win32") await chmod(temporary, mode);
		await rename(temporary, path);
		await syncDirectory(dirname(path));
	} catch (error) {
		await handle?.close().catch(() => undefined);
		await unlink(temporary).catch(() => undefined);
		throw error;
	}
}

async function syncDirectory(path: string): Promise<void> {
	if (process.platform === "win32") return;
	let handle: FileHandle | undefined;
	try {
		handle = await open(path, "r");
		await handle.sync();
	} catch {
		// Some filesystems do not permit directory fsync; file fsync still applies.
	} finally {
		await handle?.close().catch(() => undefined);
	}
}

async function removeStaleLock(path: string): Promise<boolean> {
	try {
		const first = await stat(path);
		if (Date.now() - first.mtimeMs <= MODEL_PROVIDER_LOCK_STALE_MS) return false;
		const current = await stat(path);
		if (first.dev !== current.dev || first.ino !== current.ino || first.mtimeMs !== current.mtimeMs) return false;
		await unlink(path);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
		throw error;
	}
}

function delay(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export { ModelConfigDocumentError };