import { describe, expect, mock, spyOn, test } from "bun:test";
import { modelInfoFromSdk } from "./sdk-helpers";
import type { SdkModel } from "./sdk-helpers";

/**
 * Minimal fake model registry — we only need hasConfiguredAuth and isUsingOAuth
 * to return false so the test focuses on label normalization.
 */
function fakeRegistry(): any {
	return {
		hasConfiguredAuth: () => false,
		isUsingOAuth: () => false,
	};
}

describe("modelInfoFromSdk", () => {
	test("label: model.name is a plain string → used as-is", () => {
		const model: SdkModel = {
			id: "claude-fable-5",
			name: "Claude Fable 5",
			provider: "anthropic",
		};
		const info = modelInfoFromSdk(model, fakeRegistry(), undefined);
		expect(info.label).toBe("Claude Fable 5");
	});

	test("label: model.name is undefined → falls back to model.id", () => {
		const model: SdkModel = {
			id: "claude-fable-5",
			provider: "anthropic",
		};
		const info = modelInfoFromSdk(model, fakeRegistry(), undefined);
		expect(info.label).toBe("claude-fable-5");
	});

	test("label: model.name is an object {label,description} → coerced to string via label field", () => {
		// Simulates the SDK returning a name shaped as { label, description }
		// for certain provider models. This is the root cause of the React
		// "Objects are not valid as a React child" error in ModelRolesSection.
		const model: SdkModel = {
			id: "gpt-5.5",
			name: { label: "GPT-5.5", description: "Latest OpenAI GPT model" } as unknown as string,
			provider: "openai",
		};
		const info = modelInfoFromSdk(model, fakeRegistry(), undefined);
		// Must be a plain string, not an object.
		expect(typeof info.label).toBe("string");
		expect(info.label).toBe("GPT-5.5");
	});

	test("label: model.name is an object without label → falls back to model.id", () => {
		const model: SdkModel = {
			id: "some-model",
			name: { description: "no label key" } as unknown as string,
			provider: "test",
		};
		const info = modelInfoFromSdk(model, fakeRegistry(), undefined);
		expect(typeof info.label).toBe("string");
		expect(info.label).toBe("some-model");
	});
});
