import type {
	ModelProviderApi,
	ModelProviderAuthMode,
	ModelProviderCompatibility,
	ModelProviderDiscoveryType,
	ModelThinkingEffort,
	ModelThinkingMode,
} from "@omp-deck/protocol";

export const MODEL_PROVIDER_APIS = [
	"openai-completions",
	"openai-responses",
	"openai-codex-responses",
	"azure-openai-responses",
	"anthropic-messages",
	"google-generative-ai",
	"google-gemini-cli",
	"google-vertex",
] as const satisfies readonly ModelProviderApi[];

export const MODEL_PROVIDER_DISCOVERY_TYPES = [
	"ollama",
	"llama.cpp",
	"lm-studio",
	"openai-models-list",
	"proxy",
	"litellm",
] as const satisfies readonly ModelProviderDiscoveryType[];

export const MODEL_PROVIDER_AUTH_MODES = ["apiKey", "none", "oauth"] as const satisfies readonly ModelProviderAuthMode[];
export const MODEL_THINKING_MODES = [
	"effort",
	"budget",
	"google-level",
	"anthropic-adaptive",
	"anthropic-budget-effort",
] as const satisfies readonly ModelThinkingMode[];
export const MODEL_THINKING_EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max"] as const satisfies readonly ModelThinkingEffort[];

/** Browser-only placeholder. It must never be persisted or treated as a credential. */
export const MODEL_PROVIDER_SECRET_SENTINEL = "__OMP_DECK_SECRET__";
export const MODEL_PROVIDER_REQUEST_TIMEOUT_MS = 8_000;
export const MODEL_PROVIDER_RESPONSE_LIMIT_BYTES = 1024 * 1024;
export const MODEL_PROVIDER_ERROR_DETAIL_LIMIT = 512;
export const MODEL_PROVIDER_LOCK_STALE_MS = 30_000;
export const MODEL_PROVIDER_MANAGED_ENV_PREFIX = "OMP_DECK_PROVIDER_";

const PROVIDER_ID_RE = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;

export function isModelProviderApi(value: unknown): value is ModelProviderApi {
	return typeof value === "string" && (MODEL_PROVIDER_APIS as readonly string[]).includes(value);
}

export function isModelProviderDiscoveryType(value: unknown): value is ModelProviderDiscoveryType {
	return typeof value === "string" && (MODEL_PROVIDER_DISCOVERY_TYPES as readonly string[]).includes(value);
}

export function validateModelProviderId(value: unknown): string {
	if (typeof value !== "string") throw new Error("provider ID must be a string");
	const id = value.trim();
	if (!PROVIDER_ID_RE.test(id)) {
		throw new Error("provider ID must be 1-64 lowercase letters, numbers, dots, underscores, or hyphens");
	}
	return id;
}

export function modelProviderCompatibility(): ModelProviderCompatibility {
	return {
		apis: [...MODEL_PROVIDER_APIS],
		discoveryTypes: [...MODEL_PROVIDER_DISCOVERY_TYPES],
		authModes: [...MODEL_PROVIDER_AUTH_MODES],
		thinkingModes: [...MODEL_THINKING_MODES],
		thinkingEfforts: [...MODEL_THINKING_EFFORTS],
		secretSentinel: MODEL_PROVIDER_SECRET_SENTINEL,
	};
}
