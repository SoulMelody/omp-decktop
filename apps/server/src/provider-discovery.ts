import { ModelRegistry } from "@oh-my-pi/pi-coding-agent";
import type {
	DiscoveredModel,
	DiscoverModelsRequest,
	DiscoverModelsResponse,
	ModelProviderApi,
	ModelProviderCompatibility,
	ProviderAttemptOutcome,
	ProviderDraft,
	ProviderDiscoverySource,
	ProviderNetworkAttempt,
	RedactedModelDefinition,
} from "@omp-deck/protocol";

import { ModelsConfigStore, ModelsConfigStoreError } from "./models-config-store.ts";

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 1024 * 1024;

type Fetch = typeof fetch;

interface DiscoveryInputResolved {
	baseUrl: string;
	api?: ModelProviderApi;
	apiKey?: string;
	authHeader?: boolean | string;
	headers?: Record<string, string>;
	discoveryType?: string;
	providerId?: string;
	configuredModels?: RedactedModelDefinition[];
	commandCredentialUnavailable?: boolean;
}

export interface DiscoveryServiceOptions {
	registry?: ModelRegistry;
	store?: ModelsConfigStore;
	compatibility: ModelProviderCompatibility;
	fetchImpl?: Fetch;
}

export class ProviderDiscoveryService {
	constructor(private readonly options: DiscoveryServiceOptions) {}

	async discover(request: DiscoverModelsRequest): Promise<DiscoverModelsResponse> {
		const resolved = await this.#resolveInput(request);
		if (resolved.commandCredentialUnavailable) {
			return {
				source: "configured",
				models: [],
				attempts: [],
				warnings: ["Authentication credentials resolve via a command; discovery is skipped."],
			};
		}
		const fetchImpl = this.options.fetchImpl ?? fetch;
		const attempts: ProviderNetworkAttempt[] = [];
		const targets = this.#targets(resolved);
		for (const target of targets) {
			for (const headers of this.#headerVariants(resolved)) {
				try {
					const response = await fetchWithTimeout(fetchImpl, target.url, headers, REQUEST_TIMEOUT_MS);
					if (!response.ok) {
						attempts.push(this.#attempt(target.url, "http-error", { status: response.status, detail: `HTTP ${response.status}` }));
						continue;
					}
					let parsed: unknown;
					try {
						parsed = JSON.parse(response.text);
					} catch {
						attempts.push(this.#attempt(target.url, "incompatible", { status: response.status, detail: "Response was not JSON" }));
						continue;
					}
					const entries = this.#parseEntries(parsed, target.format);
					if (!entries) {
						attempts.push(this.#attempt(target.url, "incompatible", { status: response.status, detail: "Response lacked a compatible model array" }));
						continue;
					}
					if (entries.length === 0) {
						attempts.push(this.#attempt(target.url, "empty", { status: response.status, detail: "Compatible catalog was empty" }));
						continue;
					}
					const enriched = this.#enrich(entries, resolved, request.forceRefresh ?? false);
					attempts.push(this.#attempt(target.url, "success", { status: response.status, detail: `Discovered ${enriched.length} models`, modelCount: enriched.length }));
					return { source: "remote", models: enriched, attempts, warnings: [] };
				} catch (error) {
					const outcome = this.#outcomeFromError(error);
					attempts.push(this.#attempt(target.url, outcome, { detail: this.#safeMessage(error, resolved) }));
				}
			}
		}

		if (request.providerId && this.options.registry) {
			const registryModels = this.#registryFallback(request.providerId);
			if (registryModels.length > 0) {
				return {
					source: "omp-registry",
					models: registryModels,
					attempts,
					warnings: [`Remote discovery failed (${attempts.length} attempts); returning the OMP registry catalog as fallback.`],
				};
			}
		}

		const configured = (resolved.configuredModels ?? []).map(toDiscoveredModel);
		if (configured.length > 0) {
			return {
				source: "configured",
				models: configured,
				attempts,
				warnings: [`Remote discovery failed (${attempts.length} attempts); returning existing models.yml as fallback.`],
			};
		}
		return {
			source: "none",
			models: [],
			attempts,
			warnings: [`No compatible catalog found (${attempts.length} attempts).`],
		};
	}

	async #resolveInput(request: DiscoverModelsRequest): Promise<DiscoveryInputResolved> {
		const knownSecrets = new Set<string>();
		if (request.providerId && this.options.store) {
			const secrets = await this.options.store.resolveProviderSecrets(request.providerId);
			secrets.knownSecrets.forEach((secret) => knownSecrets.add(secret));
			const definition = await this.options.store.rawProviderDefinition(request.providerId);
			const resolved: DiscoveryInputResolved = {
				baseUrl: extractBaseUrl(definition) ?? "",
				api: extractApi(definition),
				apiKey: secrets.apiKey,
				headers: secrets.headers,
				authHeader: definition?.authHeader as boolean | string | undefined,
				discoveryType: typeof definition?.discovery === "object" && definition.discovery !== null
					? (definition.discovery as { type?: string }).type
					: undefined,
				providerId: request.providerId,
				configuredModels: Array.isArray(definition?.models) ? (definition.models as RedactedModelDefinition[]) : undefined,
				commandCredentialUnavailable: secrets.commandCredentialUnavailable,
			};
			return resolved;
		}
		if (request.draft) {
			return this.#resolveFromDraft(request.draft);
		}
		throw new ModelsConfigStoreError("Discovery requires either providerId or draft");
	}

	#resolveFromDraft(draft: ProviderDraft): DiscoveryInputResolved {
		const definition = draft.definition ?? {};
		const headers = redactHeaders(definition.headers ?? {});
		return {
			baseUrl: extractBaseUrl(definition) ?? "",
			api: extractApi(definition),
			apiKey: draft.apiKey,
			headers,
			authHeader: definition.authHeader as boolean | string | undefined,
			discoveryType: typeof definition.discovery === "object" && definition.discovery !== null
				? (definition.discovery as { type?: string }).type
				: undefined,
			configuredModels: Array.isArray(definition.models) ? (definition.models as RedactedModelDefinition[]) : undefined,
		};
	}

	#registryFallback(providerId: string): DiscoveredModel[] {
		const registry = this.options.registry;
		if (!registry) return [];
		const cached = registry.getAll().filter((model) => model.provider === providerId);
		if (cached.length === 0) return [];
		return cached.map((model) => ({
			id: model.id,
			name: model.name,
			metadata: {
				...(model.contextWindow !== null ? { contextWindow: model.contextWindow } : {}),
				...(model.reasoning !== undefined ? { reasoning: model.reasoning } : {}),
				...(model.input ? { input: model.input } : {}),
				...(model.supportsTools !== undefined ? { supportsTools: model.supportsTools } : {}),
			},
			provenance: { id: "registry" },
		}));
	}

	#enrich(
		entries: Array<Record<string, unknown>>,
		resolved: DiscoveryInputResolved,
		forceRefresh: boolean,
	): DiscoveredModel[] {
		const registryModels = resolved.providerId && this.options.registry
			? this.options.registry.getAll().filter((model) => model.provider === resolved.providerId)
			: [];
		const registryById = new Map(registryModels.map((model) => [model.id, model]));
		const configuredById = new Map((resolved.configuredModels ?? []).map((model) => [model.id, model]));
		const seen = new Set<string>();
		const out: DiscoveredModel[] = [];
		for (const entry of entries) {
			const id = stringField(entry.id, entry.name, entry.model);
			if (!id || seen.has(id)) continue;
			seen.add(id);
			const registryMatch = registryById.get(id);
			const configuredMatch = configuredById.get(id);
			const provenance: DiscoveredModel["provenance"] = { id: "remote" };
			const metadata: Partial<RedactedModelDefinition> = {
				id,
				name: stringField(entry.name, entry.display_name, entry.title) ?? id,
			};
			if (typeof entry.context_window === "number") metadata.contextWindow = entry.context_window;
			else if (typeof entry.contextWindow === "number") metadata.contextWindow = entry.contextWindow;
			else if (registryMatch?.contextWindow) metadata.contextWindow = registryMatch.contextWindow;
			if (metadata.contextWindow) provenance.contextWindow = registryMatch ? "registry" : "remote";
			if (typeof entry.max_tokens === "number") metadata.maxTokens = entry.max_tokens;
			else if (registryMatch?.maxTokens) metadata.maxTokens = registryMatch.maxTokens;
			if (metadata.maxTokens) provenance.maxTokens = registryMatch ? "registry" : "remote";
			if (typeof entry.reasoning === "boolean") metadata.reasoning = entry.reasoning;
			else if (registryMatch?.reasoning !== undefined) metadata.reasoning = registryMatch.reasoning;
			if (Array.isArray(entry.input)) metadata.input = entry.input.filter((m): m is "text" | "image" => m === "text" || m === "image");
			if (typeof entry.supports_tools === "boolean") metadata.supportsTools = entry.supports_tools;
			if (configuredMatch?.id === id && configuredMatch?.contextWindow) {
				metadata.contextWindow = configuredMatch.contextWindow;
				provenance.contextWindow = "configured";
			}
			out.push({
				id,
				name: metadata.name,
				metadata: stripMetadataSecrets(metadata),
				provenance,
			});
			if (forceRefresh && resolved.providerId && this.options.registry) {
				void this.options.registry.refreshProvider(resolved.providerId, "online").catch(() => undefined);
			}
		}
		return out;
	}

	#targets(resolved: DiscoveryInputResolved): Array<{ url: string; format: "openai" | "ollama" | "litellm" }> {
		const baseUrl = resolved.baseUrl.trim();
		if (!baseUrl) throw new ModelsConfigStoreError("Base URL is required for discovery");
		const parsed = new URL(baseUrl);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			throw new ModelsConfigStoreError("Base URL must use HTTP or HTTPS");
		}
		const origin = parsed.origin;
		const normalized = new URL(parsed.pathname.replace(/\/+$/, "") || "/", origin);
		normalized.search = "";
		normalized.hash = "";
		const type = resolved.discoveryType?.trim().toLowerCase();
		if (type === "ollama") {
			const root = new URL(normalized);
			root.pathname = root.pathname.replace(/\/v1$/i, "") || "/";
			return [{ url: `${root.origin}${root.pathname.replace(/\/+$/, "")}/api/tags`, format: "ollama" }];
		}
		if (type === "litellm") {
			const root = new URL(normalized);
			root.pathname = root.pathname.replace(/\/v1$/i, "") || "/";
			const base = root.pathname.replace(/\/+$/, "");
			return uniqueTargets([
				{ url: `${root.origin}${base}/model_group/info`, format: "litellm" },
				{ url: `${root.origin}${base}/v2/model/info`, format: "litellm" },
				{ url: `${root.origin}${base}/model/info`, format: "litellm" },
				{ url: `${root.origin}${base}/v1/model/info`, format: "litellm" },
			]);
		}
		const path = normalized.pathname;
		const candidates: Array<{ url: string; format: "openai" | "ollama" | "litellm" }> = [];
		candidates.push({ url: `${origin}${path}/models`, format: "openai" });
		if (/\/(?:messages|responses|chat\/completions)$/i.test(path)) {
			const trimmed = path.replace(/\/(?:messages|responses|chat\/completions)$/i, "");
			candidates.push({ url: `${origin}${trimmed}/models`, format: "openai" });
		}
		if (/\/(?:anthropic|coding)$/i.test(path)) {
			const trimmed = path.replace(/\/(?:anthropic|coding)$/i, "");
			candidates.push({ url: `${origin}${trimmed}/models`, format: "openai" });
		}
		candidates.push({ url: `${origin}/v1/models`, format: "openai" });
		candidates.push({ url: `${origin}/models`, format: "openai" });
		return uniqueTargets(candidates);
	}

	#headerVariants(resolved: DiscoveryInputResolved): Headers[] {
		const headers = new Headers({ Accept: "application/json" });
		const key = usableKey(resolved.apiKey);
		if (key) {
			const explicitName = typeof resolved.authHeader === "string" ? resolved.authHeader.trim() : "";
			const headerName = explicitName
				|| (resolved.authHeader === true || resolved.api !== "anthropic-messages"
					? "Authorization"
					: "x-api-key");
			headers.set(headerName, headerName.toLowerCase() === "authorization" ? `Bearer ${key}` : key);
		}
		for (const [name, value] of Object.entries(resolved.headers ?? {})) {
			if (typeof value === "string" && !value.trimStart().startsWith("!")) headers.set(name, value);
		}
		const variants = [headers];
		if (!key) return variants;
		const hasCredentialHeader = Object.keys(resolved.headers ?? {}).some((name) =>
			["authorization", "x-api-key", "api-key"].includes(name.toLowerCase()),
		);
		if (hasCredentialHeader) return variants;
		const alternate = new Headers(headers);
		if (headers.has("authorization")) {
			alternate.delete("authorization");
			alternate.set("x-api-key", key);
		} else {
			alternate.delete("x-api-key");
			alternate.set("authorization", `Bearer ${key}`);
		}
		variants.push(alternate);
		return variants;
	}

	#parseEntries(payload: unknown, format: "openai" | "ollama" | "litellm"): Array<Record<string, unknown>> | null {
		if (Array.isArray(payload)) return payload.filter(isRecord) as Array<Record<string, unknown>>;
		if (!isRecord(payload)) return null;
		if (Array.isArray(payload.data)) return payload.data.filter(isRecord) as Array<Record<string, unknown>>;
		if (Array.isArray(payload.models)) return payload.models.filter(isRecord) as Array<Record<string, unknown>>;
		if (format === "litellm" && Array.isArray(payload.model_groups)) {
			return (payload.model_groups as Array<Record<string, unknown>>).flatMap((group) => {
				const models = Array.isArray(group.model_info) ? (group.model_info as Array<Record<string, unknown>>) : [];
				return models.length > 0 ? models : [group];
			});
		}
		return null;
	}

	#attempt(
		url: string,
		outcome: ProviderAttemptOutcome,
		extra: { status?: number; detail?: string; modelCount?: number; latencyMs?: number } = {},
	): ProviderNetworkAttempt {
		const base: ProviderNetworkAttempt = { url, outcome, ...extra };
		return base;
	}

	#outcomeFromError(error: unknown): ProviderAttemptOutcome {
		if (error instanceof Error) {
			if (/timeout|timed out|aborted/i.test(error.message)) return "timeout";
			if (/exceeded .* limit/i.test(error.message)) return "too-large";
		}
		return "network-error";
	}

	#safeMessage(error: unknown, resolved: DiscoveryInputResolved): string {
		const raw = error instanceof Error ? error.message : "Network error";
		return sanitizeDetail(raw, secretsFromResolved(resolved));
	}
}

function secretsFromResolved(resolved: DiscoveryInputResolved): string[] {
	const out: string[] = [];
	if (resolved.apiKey) out.push(resolved.apiKey);
	for (const value of Object.values(resolved.headers ?? {})) {
		if (typeof value === "string") out.push(value);
	}
	return out;
}

function usableKey(value: string | undefined): string | undefined {
	const key = value?.trim();
	return key && !key.startsWith("!") ? key : undefined;
}

function uniqueTargets<T extends { url: string }>(targets: T[]): T[] {
	const seen = new Set<string>();
	return targets.filter((target) => {
		if (seen.has(target.url)) return false;
		seen.add(target.url);
		return true;
	});
}

function extractBaseUrl(definition: Record<string, unknown> | undefined): string | undefined {
	const value = typeof definition?.baseUrl === "string" ? definition.baseUrl.trim() : "";
	return value.length > 0 ? value : undefined;
}

function extractApi(definition: Record<string, unknown> | undefined): ModelProviderApi | undefined {
	const value = definition?.api;
	return typeof value === "string" ? (value as ModelProviderApi) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(...values: unknown[]): string | undefined {
	for (const value of values) {
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return undefined;
}

function toDiscoveredModel(model: RedactedModelDefinition): DiscoveredModel {
	const metadata: Partial<RedactedModelDefinition> = {
		id: model.id,
		name: model.name,
	};
	if (typeof model.contextWindow === "number") metadata.contextWindow = model.contextWindow;
	if (typeof model.maxTokens === "number") metadata.maxTokens = model.maxTokens;
	if (typeof model.reasoning === "boolean") metadata.reasoning = model.reasoning;
	if (model.input) metadata.input = model.input;
	if (typeof model.supportsTools === "boolean") metadata.supportsTools = model.supportsTools;
	return { id: model.id, name: model.name, metadata: stripMetadataSecrets(metadata), provenance: { id: "configured" } };
}

function stripMetadataSecrets(metadata: Partial<RedactedModelDefinition>): Partial<RedactedModelDefinition> {
	const next = { ...metadata };
	delete next.headers;
	return next;
}

function redactHeaders(headers: Record<string, unknown>): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [name, value] of Object.entries(headers)) {
		if (typeof value === "string") out[name] = value;
	}
	return out;
}

export async function fetchWithTimeout(
	fetchImpl: Fetch,
	url: string,
	headers: Headers,
	timeoutMs: number,
): Promise<{ ok: boolean; status: number; text: string }> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetchImpl(url, { method: "GET", headers, signal: controller.signal });
		const text = await readLimitedText(response, MAX_RESPONSE_BYTES);
		return { ok: response.ok, status: response.status, text };
	} finally {
		clearTimeout(timer);
	}
}

async function readLimitedText(response: Response, limit: number): Promise<string> {
	const declared = Number(response.headers.get("content-length"));
	if (Number.isFinite(declared) && declared > limit) {
		await response.body?.cancel();
		throw new Error("Response exceeded the 1 MiB limit");
	}
	if (!response.body) return "";
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > limit) {
				await reader.cancel();
				throw new Error("Response exceeded the 1 MiB limit");
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(bytes);
}

export function sanitizeDetail(detail: string, secrets: readonly string[]): string {
	let safe = detail.replace(/[\r\n\t]+/g, " ");
	for (const secret of secrets) {
		if (!secret) continue;
		safe = safe.split(secret).join("[redacted]");
	}
	return safe.length > 512 ? `${safe.slice(0, 511)}…` : safe;
}

export function discoverySourceLabel(source: ProviderDiscoverySource): string {
	switch (source) {
		case "remote":
			return "Remote catalog";
		case "omp-registry":
			return "OMP registry fallback";
		case "configured":
			return "models.yml fallback";
		default:
			return "No catalog";
	}
}