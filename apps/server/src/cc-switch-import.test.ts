import { describe, expect, test } from "bun:test";

import { generateExtensionSource } from "./cc-switch-import";

describe("generateExtensionSource", () => {
	test("emits pre-fetched models as static model list", () => {
		const source = generateExtensionSource({
			providerId: "ccswitch-my-provider",
			displayName: "My Provider",
			apiType: "openai-completions",
			baseUrl: "https://api.example.test/v1/",
			apiKey: undefined,
			model: "ignored-static-model",
			models: [
				{ id: "gpt-4", name: "gpt-4" },
				{ id: "gpt-3.5-turbo", name: "gpt-3.5-turbo" },
			],
		});

		// No runtime fetch — models are baked in.
		expect(source).not.toContain("fetchDynamicModels");
		expect(source).toContain("models: [");
		expect(source).toContain('id: "gpt-4"');
		expect(source).toContain('id: "gpt-3.5-turbo"');
		// Static single-model fallback is not used when models are provided.
		expect(source).not.toContain("ignored-static-model");
	});

	test("falls back to single static model when no pre-fetched list", () => {
		const source = generateExtensionSource({
			providerId: "ccswitch-anthropic-provider",
			displayName: "Anthropic Provider",
			apiType: "anthropic-messages",
			baseUrl: "https://api.example.test",
			apiKey: "ANTHROPIC_API_KEY",
			model: "claude-test",
		});

		expect(source).not.toContain("fetchDynamicModels");
		expect(source).toContain("models: [");
		expect(source).toContain('id: "claude-test"');
	});

	test("falls back to single model when models array is empty", () => {
		const source = generateExtensionSource({
			providerId: "ccswitch-empty",
			displayName: "Empty Provider",
			apiType: "openai-completions",
			baseUrl: "https://api.example.test/v1/",
			model: "fallback-model",
			models: [],
		});

		expect(source).toContain('id: "fallback-model"');
		expect(source).not.toContain("fetchDynamicModels");
	});
});
