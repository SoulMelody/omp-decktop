import type { ModelProviderApi } from "@omp-deck/protocol";

/**
 * cc-switch `meta.apiFormat` → installed SDK `api` enum map.
 */
export const MODELS_API_FORMAT_MAP: Record<string, ModelProviderApi> = {
	openai_chat: "openai-completions",
	openai_responses: "openai-responses",
	anthropic: "anthropic-messages",
	gemini: "google-generative-ai",
	vertex: "google-vertex",
	codex: "openai-codex-responses",
	azure: "azure-openai-responses",
	gemini_cli: "google-gemini-cli",
};

/** API format values recognised by cc-switch. */
export const CC_SWITCH_API_FORMATS = Object.keys(MODELS_API_FORMAT_MAP) as Array<keyof typeof MODELS_API_FORMAT_MAP>;

export interface ModelsConfigSchemaAlias {
	(config: unknown): unknown;
}

export const modelsConfigSchema = ((config: unknown): unknown => {
	const validate = (c: unknown): unknown => c;
	return validate(config);
}) as ModelsConfigSchemaAlias;
