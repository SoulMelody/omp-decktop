import type {
	ModelProviderApi,
	ProbeProviderRequest,
	ProbeProviderResponse,
	ProviderDiagnosticCheck,
	ProviderDiagnosticCheckId,
	ProviderDiagnosticStatus,
	ProviderDraft,
	ProviderNetworkAttempt,
} from "@omp-deck/protocol";

import { ModelsConfigStore, ModelsConfigStoreError } from "./models-config-store.ts";
import {
	fetchWithTimeout,
	sanitizeDetail,
} from "./provider-discovery.ts";

const PROBE_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const COMMAND_CREDENTIAL_DETAIL = "Command-resolved credentials were not executed by this manager.";

type Fetch = typeof fetch;

interface ProbeInputResolved {
	baseUrl: string;
	api?: ModelProviderApi;
	apiKey?: string;
	headers?: Record<string, string>;
	authHeader?: boolean | string;
	discoveryType?: string;
	commandCredentialUnavailable: boolean;
	inferenceModel?: string;
	inferenceEnabled: boolean;
	inferenceApi?: ModelProviderApi | "auto";
}

export interface ProbeOptions {
	store: ModelsConfigStore;
	fetchImpl?: Fetch;
}

export class ProviderProbeService {
	constructor(private readonly options: ProbeOptions) {}

	async probe(request: ProbeProviderRequest): Promise<ProbeProviderResponse> {
		const resolved = await this.#resolveInput(request);
		const checks: ProviderDiagnosticCheck[] = [];
		const attempts: ProviderNetworkAttempt[] = [];
		const secrets = secretsFromResolved(resolved);
		if (!resolved.baseUrl) {
			checks.push({
				id: "endpoint",
				status: "fail",
				detail: "Base URL is required to run diagnostics.",
			});
			return this.#finish(checks, attempts);
		}
		const fetchImpl = this.options.fetchImpl ?? fetch;

		const targets = this.#targets(resolved);
		let lastDiscovery: { response: { ok: boolean; status: number; text: string }; url: string } | undefined;
		let endpointFailure: ProviderDiagnosticCheck | undefined;
		for (const target of targets) {
			try {
				const headers = this.#headersForDiscovery(resolved);
				const response = await fetchWithTimeout(fetchImpl, target.url, headers, PROBE_TIMEOUT_MS);
				lastDiscovery = { response, url: target.url };
				attempts.push({ url: target.url, outcome: response.ok ? "success" : "http-error", status: response.status });
				if (response.ok || isAuthFailure(response.status)) break;
			} catch (error) {
				const outcome = outcomeFromError(error);
				attempts.push({ url: target.url, outcome, detail: sanitizeDetail(errorMessage(error), secrets) });
				endpointFailure = {
					id: "endpoint",
					status: "fail",
					detail: sanitizeDetail(errorMessage(error), secrets),
				};
			}
		}
		if (!lastDiscovery) {
			checks.push(endpointFailure ?? { id: "endpoint", status: "fail", detail: "No model discovery endpoint was available." });
			checks.push(skipCheck("authentication", "Endpoint could not be reached"));
			checks.push(skipCheck("discovery", "Endpoint could not be reached"));
			checks.push(skipCheck("inference", "Endpoint could not be reached"));
			return this.#finish(checks, attempts);
		}

		checks.push({
			id: "endpoint",
			status: "pass",
			detail: `Endpoint responded with HTTP ${lastDiscovery.response.status}.`,
		});

		if (isAuthFailure(lastDiscovery.response.status)) {
			const status: ProviderDiagnosticStatus = resolved.commandCredentialUnavailable ? "skip" : "fail";
			const detail = resolved.commandCredentialUnavailable
				? COMMAND_CREDENTIAL_DETAIL
				: `Credentials were rejected with HTTP ${lastDiscovery.response.status}.`;
			checks.push({ id: "authentication", status, detail });
			checks.push(skipCheck("discovery", status === "skip" ? detail : "Authentication failed"));
			checks.push(skipCheck("inference", status === "skip" ? detail : "Authentication failed"));
			return this.#finish(checks, attempts);
		}

		if (!lastDiscovery.response.ok) {
			checks.push({
				id: "authentication",
				status: "skip",
				detail: `Authentication could not be determined from HTTP ${lastDiscovery.response.status}.`,
			});
			checks.push({
				id: "discovery",
				status: "fail",
				detail: sanitizeDetail(`Model discovery returned HTTP ${lastDiscovery.response.status}.`, secrets),
			});
		} else {
			checks.push({
				id: "authentication",
				status: "pass",
				detail: resolved.apiKey ? "Credentials were not rejected." : "Endpoint did not require credentials.",
			});
			try {
				const entries = parseEntries(lastDiscovery.response.text);
				checks.push({
					id: "discovery",
					status: "pass",
					detail: `Discovered ${entries.length} model${entries.length === 1 ? "" : "s"}.`,
				});
			} catch (error) {
				checks.push({
					id: "discovery",
					status: "fail",
					detail: sanitizeDetail(errorMessage(error), secrets),
				});
			}
		}

		if (!resolved.inferenceEnabled) {
			checks.push(skipCheck("inference", "Inference probe is disabled"));
			return this.#finish(checks, attempts);
		}
		if (!resolved.inferenceModel) {
			checks.push(skipCheck("inference", "No model was selected."));
			return this.#finish(checks, attempts);
		}
		const apis: ModelProviderApi[] = resolved.inferenceApi && resolved.inferenceApi !== "auto"
			? [resolved.inferenceApi]
			: ["openai-completions", "openai-responses", "anthropic-messages"];
		let pass: ProviderDiagnosticCheck | undefined;
		let lastInference: { url: string; status: number } | undefined;
		for (const api of apis) {
			const url = inferenceUrl(resolved.baseUrl, api);
			const body = inferenceBody(api, resolved.inferenceModel);
			try {
				const response = await fetchWithTimeout(
					fetchImpl,
					url,
					this.#headersForInference(resolved, api),
					PROBE_TIMEOUT_MS,
				);
				attempts.push({ url, outcome: response.ok ? "success" : "http-error", status: response.status });
				lastInference = { url, status: response.status };
				if (response.ok) {
					pass = {
						id: "inference",
						status: "pass",
						detail: `Minimal ${api} request succeeded.`,
						adapter: api,
					};
					break;
				}
			} catch (error) {
				attempts.push({ url, outcome: outcomeFromError(error), detail: sanitizeDetail(errorMessage(error), secrets) });
			}
		}
		if (pass) {
			checks.push(pass);
			return this.#finish(checks, attempts);
		}
		if (lastInference && isAuthFailure(lastInference.status)) {
			const authIndex = checks.findIndex((check) => check.id === "authentication");
			if (authIndex >= 0) {
				checks[authIndex] = {
					id: "authentication",
					status: resolved.commandCredentialUnavailable ? "skip" : "fail",
					detail: resolved.commandCredentialUnavailable
						? COMMAND_CREDENTIAL_DETAIL
						: `Credentials were rejected with HTTP ${lastInference.status}.`,
				};
			}
		}
		checks.push({
			id: "inference",
			status: "fail",
			detail: `No compatible inference adapter succeeded (last HTTP ${lastInference?.status ?? "n/a"}).`,
			adapter: resolved.inferenceApi ?? "auto",
		});
		return this.#finish(checks, attempts);
	}

	async #resolveInput(request: ProbeProviderRequest): Promise<ProbeInputResolved> {
		if (request.providerId) {
			const secrets = await this.options.store.resolveProviderSecrets(request.providerId);
			const definition = await this.options.store.rawProviderDefinition(request.providerId);
			return {
				baseUrl: typeof definition?.baseUrl === "string" ? definition.baseUrl : "",
				api: (definition?.api as ModelProviderApi | undefined) ?? undefined,
				apiKey: secrets.apiKey,
				headers: secrets.headers,
				authHeader: definition?.authHeader as boolean | string | undefined,
				discoveryType: typeof definition?.discovery === "object" && definition.discovery !== null
					? (definition.discovery as { type?: string }).type
					: undefined,
				commandCredentialUnavailable: secrets.commandCredentialUnavailable,
				inferenceEnabled: request.inference?.enabled ?? false,
				inferenceModel: request.inference?.modelId,
				inferenceApi: request.inference?.api,
			};
		}
		if (request.draft) return this.#resolveFromDraft(request.draft, request);
		throw new ModelsConfigStoreError("Probe requires either providerId or draft");
	}

	#resolveFromDraft(draft: ProviderDraft, request: ProbeProviderRequest): ProbeInputResolved {
		const definition = draft.definition ?? {};
		const headers: Record<string, string> = {};
		for (const [name, value] of Object.entries(definition.headers ?? {})) {
			if (typeof value === "string") headers[name] = value;
		}
		return {
			baseUrl: typeof definition.baseUrl === "string" ? definition.baseUrl : "",
			api: definition.api as ModelProviderApi | undefined,
			apiKey: draft.apiKey,
			headers,
			authHeader: definition.authHeader as boolean | string | undefined,
			discoveryType: typeof definition.discovery === "object" && definition.discovery !== null
				? (definition.discovery as { type?: string }).type
				: undefined,
			commandCredentialUnavailable: false,
			inferenceEnabled: request.inference?.enabled ?? false,
			inferenceModel: request.inference?.modelId,
			inferenceApi: request.inference?.api,
		};
	}

	#targets(resolved: ProbeInputResolved): Array<{ url: string }> {
		const base = resolved.baseUrl.replace(/\/+$/, "");
		const candidates: Array<{ url: string }> = [];
		const path = new URL(resolved.baseUrl).pathname.replace(/\/+$/, "") || "/";
		candidates.push({ url: `${base.replace(/\/+$/, "")}/models` });
		if (/\/(?:messages|responses|chat\/completions)$/i.test(path)) {
			const trimmed = path.replace(/\/(?:messages|responses|chat\/completions)$/i, "");
			const origin = new URL(resolved.baseUrl).origin;
			candidates.push({ url: `${origin}${trimmed}/models` });
		}
		return candidates;
	}

	#headersForDiscovery(resolved: ProbeInputResolved): Headers {
		return this.#headers(resolved, resolved.api);
	}

	#headersForInference(resolved: ProbeInputResolved, api: ModelProviderApi): Headers {
		return this.#headers(resolved, api);
	}

	#headers(resolved: ProbeInputResolved, api: ModelProviderApi | undefined): Headers {
		const headers = new Headers({ Accept: "application/json", "Content-Type": "application/json" });
		if (resolved.apiKey && api) {
			const explicitName = typeof resolved.authHeader === "string" ? resolved.authHeader.trim() : "";
			const headerName = explicitName
				|| (resolved.authHeader === true
					? "Authorization"
					: api === "anthropic-messages"
						? "x-api-key"
						: "Authorization");
			headers.set(headerName, headerName.toLowerCase() === "authorization" ? `Bearer ${resolved.apiKey}` : resolved.apiKey);
		}
		if (api === "anthropic-messages") {
			headers.set("anthropic-version", "2023-06-01");
		}
		for (const [name, value] of Object.entries(resolved.headers ?? {})) {
			if (typeof value === "string" && !value.trimStart().startsWith("!")) headers.set(name, value);
		}
		return headers;
	}

	#finish(checks: ProviderDiagnosticCheck[], attempts: ProviderNetworkAttempt[]): ProbeProviderResponse {
		return { checks, attempts, runAt: new Date().toISOString() };
	}
}

function secretsFromResolved(resolved: ProbeInputResolved): string[] {
	const out: string[] = [];
	if (resolved.apiKey) out.push(resolved.apiKey);
	for (const value of Object.values(resolved.headers ?? {})) {
		if (typeof value === "string") out.push(value);
	}
	return out;
}

function isAuthFailure(status: number): boolean {
	return status === 401 || status === 403;
}

function parseEntries(text: string): Array<unknown> {
	const parsed: unknown = JSON.parse(text);
	if (Array.isArray(parsed)) return parsed;
	if (parsed && typeof parsed === "object") {
		const candidate = (parsed as Record<string, unknown>).data ?? (parsed as Record<string, unknown>).models;
		if (Array.isArray(candidate)) return candidate;
	}
	throw new Error("Response did not contain a compatible model array");
}

function inferenceUrl(baseUrl: string, api: ModelProviderApi): string {
	const trimmed = baseUrl.replace(/\/+$/, "");
	if (api === "openai-completions") return `${trimmed}/chat/completions`;
	if (api === "openai-responses") return `${trimmed}/responses`;
	if (api === "anthropic-messages") return `${trimmed}/messages`;
	return trimmed;
}

function inferenceBody(api: ModelProviderApi, model: string): Record<string, unknown> {
	if (api === "openai-responses") {
		return { model, input: "Reply with OK.", max_output_tokens: 1, stream: false };
	}
	if (api === "anthropic-messages") {
		return { model, max_tokens: 1, messages: [{ role: "user", content: "Reply with OK." }], stream: false };
	}
	return { model, messages: [{ role: "user", content: "Reply with OK." }], max_tokens: 1, stream: false };
}

function skipCheck(id: ProviderDiagnosticCheckId, detail: string): ProviderDiagnosticCheck {
	return { id, status: "skip", detail };
}

function outcomeFromError(error: unknown): ProviderNetworkAttempt["outcome"] {
	if (error instanceof Error) {
		if (/timed out|timeout|aborted/i.test(error.message)) return "timeout";
		if (/exceeded .* limit/i.test(error.message)) return "too-large";
	}
	return "network-error";
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "Network request failed";
}