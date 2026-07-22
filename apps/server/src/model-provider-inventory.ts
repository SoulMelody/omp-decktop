import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import type { OAuthProviderInfo } from "@oh-my-pi/pi-ai";
import type { ModelRegistry } from "@oh-my-pi/pi-coding-agent";
import type {
	LegacyProviderMetadata,
	ModelProviderOption,
	ModelProviderRecord,
	ProviderCatalogMode,
	ProviderDiscoveryStateWire,
	ProviderHealth,
	ProviderSourceLayer,
} from "@omp-deck/protocol";

import {
	getOAuthProviders as getBuiltinOAuthProviders,
} from "@oh-my-pi/pi-ai/oauth";
import { getAgentDir } from "@oh-my-pi/pi-utils";

import { ModelsConfigStore } from "./models-config-store.ts";

const LEGACY_GENERATOR_MARKER = "omp-deck cc-switch import";
const LEGACY_DIR_RE = /^ccswitch-(.+)$/;

const PROVIDER_LABELS: Record<string, string> = {
	anthropic: "Anthropic",
	openai: "OpenAI",
	"openai-codex": "OpenAI Codex",
	google: "Google",
	ollama: "Ollama",
	"github-copilot": "GitHub Copilot",
	cursor: "Cursor",
	perplexity: "Perplexity",
	gemini: "Gemini",
	xai: "xAI",
	deepseek: "DeepSeek",
	zhipu: "Zhipu AI",
};

export interface ProviderInventoryContext {
	agentDir: string;
	modelsPath: string;
	envPath: string;
	extensionsRoot: string;
	disabledExtensionsRoot: string;
}

export function providerInventoryContext(agentDir: string = getAgentDir()): ProviderInventoryContext {
	return {
		agentDir,
		modelsPath: join(agentDir, "models.yml"),
		envPath: join(agentDir, ".env"),
		extensionsRoot: join(agentDir, "extensions"),
		disabledExtensionsRoot: join(agentDir, "disabled-extensions"),
	};
}

export interface InventoryAggregation {
	revision: string;
	providers: ModelProviderRecord[];
	addable: ModelProviderOption[];
	configError?: string;
}

export interface InventoryOptions {
	store: ModelsConfigStore;
	ctx: ProviderInventoryContext;
	registry?: ModelRegistry;
}

export async function buildInventory({ store, ctx, registry }: InventoryOptions): Promise<InventoryAggregation> {
	const snapshot = await store.snapshot();
	const oauthRecords = await loadOAuthRecords(registry);
	const registryRecords = loadRegistryRecords(registry);
	const legacyRecords = await loadLegacyRecords(ctx);
	const merged = new Map<string, ModelProviderRecord>();
	for (const record of snapshot.providers) {
		merged.set(record.id, nativeRecordFromSnapshot(record));
	}
	for (const record of registryRecords) addOrMerge(merged, record);
	for (const record of oauthRecords) addOrMerge(merged, record);
	for (const record of legacyRecords) addOrMerge(merged, record);

	for (const record of merged.values()) {
		record.label = PROVIDER_LABELS[record.id] ?? record.id;
		record.health = deriveHealth(record);
	}

	return {
		revision: snapshot.revision,
		providers: [...merged.values()],
		addable: buildAddableOptions(merged, registry),
		...(snapshot.validationIssues.length > 0
			? { configError: snapshot.validationIssues.map((issue) => `${issue.path}: ${issue.message}`).join("; ") }
			: {}),
	};
}

function nativeRecordFromSnapshot(record: {
	id: string;
	definition: Record<string, unknown>;
	credential: ModelProviderRecord["credential"];
}): ModelProviderRecord {
	const layers: ProviderSourceLayer[] = ["models-config"];
	const definition = record.definition as ModelProviderRecord["definition"];
	const catalog = catalogSummary(definition);
	const runtime: ModelProviderRecord["runtime"] = { availableModelCount: 0 };
	return {
		id: record.id,
		label: record.id,
		layers,
		editable: true,
		definition,
		credential: record.credential,
		catalog,
		runtime,
		health: "ready",
	};
}

function loadRegistryRecords(registry: ModelRegistry | undefined): ModelProviderRecord[] {
	if (!registry) return [];
	const seen = new Set<string>();
	const records: ModelProviderRecord[] = [];
	for (const model of registry.getAvailable()) {
		if (seen.has(model.provider)) continue;
		seen.add(model.provider);
		const discovery = registry.getProviderDiscoveryState(model.provider);
		records.push({
			id: model.provider,
			label: model.provider,
			layers: ["implicit"],
			editable: false,
			credential: {
				configured: registry.authStorage.hasAuth(model.provider),
				source: "none",
				count: 0,
				managed: false,
			},
			catalog: { mode: "builtin", modelCount: 0 },
			runtime: {
				availableModelCount: registry.getAvailable().filter((m) => m.provider === model.provider).length,
				...(discovery ? { discovery: discoveryStateFromRegistry(discovery) } : {}),
			},
			health: "ready",
		});
	}
	return records;
}

async function loadOAuthRecords(registry: ModelRegistry | undefined): Promise<ModelProviderRecord[]> {
	let providers: OAuthProviderInfo[];
	try {
		providers = await getBuiltinOAuthProviders();
	} catch {
		providers = getOAuthProvidersFallback();
	}
	return providers.map((info) => {
		const id = String(info.id);
		const hasAuth = registry?.authStorage.hasAuth(id) ?? false;
		return {
			id,
			label: info.name ?? PROVIDER_LABELS[id] ?? id,
			layers: ["oauth"] as ProviderSourceLayer[],
			editable: false,
			credential: {
				configured: hasAuth,
				source: hasAuth ? "oauth" : "none",
				count: hasAuth ? 1 : 0,
				managed: false,
			},
			catalog: { mode: "builtin" as ProviderCatalogMode, modelCount: 0 },
			runtime: {
				availableModelCount: registry?.getAvailable().filter((m) => m.provider === id).length ?? 0,
			},
			health: hasAuth ? "ready" : "needs-auth",
		};
	});
}

function getOAuthProvidersFallback(): OAuthProviderInfo[] {
	try {
		return getBuiltinOAuthProviders();
	} catch {
		return [];
	}
}

function loadLegacyRecords(ctx: ProviderInventoryContext): Promise<ModelProviderRecord[]> {
	return scanLegacyRoot(ctx.extensionsRoot, "active").then((active) =>
		scanLegacyRoot(ctx.disabledExtensionsRoot, "disabled-backup").then((disabled) => {
			const records: ModelProviderRecord[] = [];
			for (const [path, status] of [...active, ...disabled]) {
				const match = LEGACY_DIR_RE.exec(path.split(/[\\/]/).pop() ?? "");
				if (!match) continue;
				const id = `ccswitch-${match[1]}`;
				const legacy: LegacyProviderMetadata = {
					extensionPath: path,
					providerId: id,
					automaticMigration: status === "active",
					status,
				};
				records.push({
					id,
					label: id,
					layers: ["extension"] as ProviderSourceLayer[],
					editable: false,
					credential: { configured: true, source: "external-env", count: 1, managed: false },
					catalog: { mode: "pinned" as ProviderCatalogMode, modelCount: 0 },
					runtime: { availableModelCount: 0 },
					health: "legacy" as ProviderHealth,
					legacy,
				});
			}
			return records;
		}),
	);
}

async function scanLegacyRoot(root: string, status: "active" | "disabled-backup"): Promise<Array<[string, "active" | "disabled-backup"]>> {
	if (!existsSync(root)) return [];
	let names: string[];
	try {
		names = await readdir(root);
	} catch {
		return [];
	}
	const out: Array<[string, "active" | "disabled-backup"]> = [];
	for (const name of names) {
		if (!LEGACY_DIR_RE.test(name)) continue;
		const dir = join(root, name);
		const indexPath = join(dir, "index.ts");
		try {
			const stats = await stat(indexPath);
			if (!stats.isFile()) continue;
		} catch {
			continue;
		}
		if (!(await isGeneratedByDeck(indexPath))) continue;
		out.push([dir, status]);
	}
	return out;
}

async function isGeneratedByDeck(indexPath: string): Promise<boolean> {
	try {
		const source = await readFile(indexPath, "utf8");
		return source.includes(LEGACY_GENERATOR_MARKER);
	} catch {
		return false;
	}
}

function catalogSummary(definition: ModelProviderRecord["definition"]): ModelProviderRecord["catalog"] {
	const models = Array.isArray(definition?.models) ? definition.models.length : 0;
	const hasDiscovery = typeof definition?.discovery === "object" && definition.discovery !== null;
	const hasModels = models > 0;
	const mode: ProviderCatalogMode = hasDiscovery && hasModels
		? "hybrid"
		: hasDiscovery
			? "dynamic"
			: hasModels
				? "pinned"
				: "builtin";
	return { mode, modelCount: models };
}

function deriveHealth(record: ModelProviderRecord): ProviderHealth {
	if (record.configError) return "config-error";
	if (!record.credential.configured && record.layers.includes("models-config")) {
		return "needs-auth";
	}
	if (record.layers.includes("extension")) return "legacy";
	if (record.runtime.discovery?.status === "unauthenticated") return "needs-auth";
	if (record.runtime.discovery?.status === "unavailable") return "discovery-warning";
	return "ready";
}

function discoveryStateFromRegistry(state: {
	status: string;
	optional: boolean;
	stale: boolean;
	fetchedAt?: number;
	models: string[];
	error?: string;
}): ProviderDiscoveryStateWire {
	return {
		status: state.status as ProviderDiscoveryStateWire["status"],
		optional: state.optional,
		stale: state.stale,
		modelIds: state.models,
		...(state.fetchedAt ? { fetchedAt: state.fetchedAt } : {}),
		...(state.error ? { error: state.error } : {}),
	};
}

function addOrMerge(map: Map<string, ModelProviderRecord>, record: ModelProviderRecord): void {
	const existing = map.get(record.id);
	if (!existing) {
		map.set(record.id, record);
		return;
	}
	const layers = uniqueOrdered([...existing.layers, ...record.layers]);
	const definition = existing.definition ?? record.definition;
	const credential = existing.credential.configured
		? existing.credential
		: record.credential.configured
			? record.credential
			: existing.credential;
	const runtime: ModelProviderRecord["runtime"] = {
		availableModelCount: Math.max(existing.runtime.availableModelCount, record.runtime.availableModelCount),
		discovery: existing.runtime.discovery ?? record.runtime.discovery,
	};
	const legacy = existing.legacy ?? record.legacy;
	map.set(record.id, { ...existing, layers, definition, credential, runtime, legacy });
}

function uniqueOrdered<T>(items: T[]): T[] {
	const seen = new Set<T>();
	const out: T[] = [];
	for (const item of items) {
		if (seen.has(item)) continue;
		seen.add(item);
		out.push(item);
	}
	return out;
}

function buildAddableOptions(
	usedIds: Map<string, ModelProviderRecord>,
	registry: ModelRegistry | undefined,
): ModelProviderOption[] {
	const bundled: string[] = [];
	try {
		for (const provider of getBuiltinOAuthProviders()) {
			const id = String(provider.id);
			if (id) bundled.push(id);
		}
	} catch {
		// bundled catalog unavailable — skip.
	}
	const out: ModelProviderOption[] = [];
	for (const id of bundled) {
		if (usedIds.has(id)) continue;
		out.push({ id, label: PROVIDER_LABELS[id] ?? id, kind: "oauth" });
	}
	if (registry) {
		for (const model of registry.getAvailable()) {
			if (usedIds.has(model.provider)) continue;
			if (bundled.includes(model.provider)) continue;
			out.push({ id: model.provider, label: PROVIDER_LABELS[model.provider] ?? model.provider, kind: "oauth" });
		}
	}
	out.push({ id: "custom", label: "Custom endpoint…", kind: "custom" });
	return out;
}