import { describe, expect, test } from "bun:test";
import type { ModelProviderRecord } from "@omp-deck/protocol";

import {
	buildServerDefinition,
	credentialOperationFor,
	detectCredentialMode,
	emptyConnectionState,
	type ConnectionEditorState,
} from "./ConnectionEditor";

function makeProvider(overrides: Partial<ModelProviderRecord> & { id: string }): ModelProviderRecord {
	const def = (overrides.definition ?? {}) as ModelProviderRecord["definition"];
	return {
		id: overrides.id,
		label: overrides.label ?? overrides.id,
		layers: overrides.layers ?? ["models-config"],
		editable: overrides.editable ?? true,
		definition: def,
		credential: overrides.credential ?? {
			configured: false,
			source: "none",
			count: 0,
			managed: false,
		},
		catalog: overrides.catalog ?? { mode: "dynamic", modelCount: 0 },
		runtime: overrides.runtime ?? { availableModelCount: 0 },
		health: overrides.health ?? "ready",
		legacy: overrides.legacy,
		configError: overrides.configError,
	};
}

function makeState(overrides: Partial<ConnectionEditorState> = {}): ConnectionEditorState {
	return {
		baseUrl: "https://api.alpha.test/v1",
		api: "openai-completions",
		authMode: "apiKey",
		discoveryType: "openai-models-list",
		authHeaderEnabled: true,
		keyless: false,
		customHeaders: [],
		...overrides,
	};
}

describe("ConnectionEditor helpers", () => {
	test("emptyConnectionState seeds from the provider definition", () => {
		const provider = makeProvider({
			id: "alpha",
			definition: {
				baseUrl: "https://api.alpha.test/v1",
				api: "openai-completions",
				discovery: { type: "openai-models-list" },
				authHeader: true,
				headers: { "X-Client": "omp-deck", "X-Internal": "__OMP_DECK_SECRET__" },
			} as ModelProviderRecord["definition"],
			credential: { configured: true, source: "managed-env", count: 1, managed: true },
		});
		const state = emptyConnectionState(provider, "__OMP_DECK_SECRET__");
		expect(state.baseUrl).toBe("https://api.alpha.test/v1");
		expect(state.api).toBe("openai-completions");
		expect(state.discoveryType).toBe("openai-models-list");
		expect(state.authHeaderEnabled).toBe(true);
		expect(state.customHeaders).toEqual([
			{ name: "X-Client", value: "omp-deck" },
			{ name: "X-Internal", value: "__OMP_DECK_SECRET__" },
		]);
	});

	test("emptyConnectionState returns to default options when the provider has none", () => {
		const provider = makeProvider({ id: "blank" });
		const state = emptyConnectionState(provider, "__OMP_DECK_SECRET__");
		expect(state.baseUrl).toBe("");
		expect(state.api).toBe("openai-completions");
		expect(state.discoveryType).toBe("");
		expect(state.authHeaderEnabled).toBe(false);
	});

	test("credentialOperationFor maps modes to server action types", () => {
		expect(credentialOperationFor("preserve", "", false)).toEqual({ action: "preserve" });
		expect(credentialOperationFor("set", "sk-new", false)).toEqual({ action: "set", value: "sk-new" });
		expect(credentialOperationFor("remove", "", true)).toEqual({ action: "remove" });
		expect(credentialOperationFor("remove", "", false)).toEqual({ action: "preserve" });
	});

	test("detectCredentialMode switches to set only on credential-tagged validation", () => {
		expect(detectCredentialMode(undefined)).toBe("preserve");
		expect(
			detectCredentialMode({
				code: "validation",
				message: "missing apiKey",
				issues: [{ path: "providers.alpha", message: "provider missing credentials" }],
			}),
		).toBe("set");
		expect(
			detectCredentialMode({
				code: "revision-conflict",
				message: "stale",
			}),
		).toBe("preserve");
	});

	test("buildServerDefinition round-trips provided fields and clears ghost credentials", () => {
		const state = makeState({ api: "anthropic-messages", customHeaders: [{ name: "X-A", value: "client-a" }] });
		const definition = buildServerDefinition(state, {
			baseUrl: "https://old.example/",
			api: "openai-completions",
			headers: { "X-Stale": "1" },
		} as ModelProviderRecord["definition"]);
		expect(definition.baseUrl).toBe("https://api.alpha.test/v1");
		expect(definition.api).toBe("anthropic-messages");
		expect(definition.headers).toEqual({ "X-A": "client-a" });
	});

	test("buildServerDefinition drops undefined headers", () => {
		const state = makeState({ customHeaders: [] });
		const definition = buildServerDefinition(state, {
			baseUrl: "https://api.alpha.test/v1",
			api: "openai-completions",
			headers: { "X-Stale": "1" },
		} as ModelProviderRecord["definition"]);
		expect(definition.headers).toEqual({});
	});
});
