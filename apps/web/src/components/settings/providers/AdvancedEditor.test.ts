import { describe, expect, test } from "bun:test";
import type { ModelProviderRecord, RedactedProviderDefinition } from "@omp-deck/protocol";

// Re-importing via internal module is sufficient since the file is colocated.
// The helpers (`parseAdvanced` / `buildAdvancedDefinition`) are not exported;
// we exercise them indirectly through rendered behaviour in the React tests,
// and here we re-affirm the schema mappings we rely on (transport, authHeader,
// disableStrictTools, headers).
describe("AdvancedEditor schema assumptions", () => {
	test("redacted provider definition supports the advanced fields", () => {
		const def: RedactedProviderDefinition = {
			baseUrl: "https://api.example.test/v1",
			api: "openai-completions",
			transport: "pi-native",
			authHeader: true,
			disableStrictTools: true,
			compat: { supportsTools: true },
			remoteCompaction: { model: "compacter" },
			headers: { "X-Client": "omp-deck" },
		};
		const provider: ModelProviderRecord = {
			id: "test",
			label: "test",
			layers: ["models-config"],
			editable: true,
			definition: def,
			credential: { configured: true, source: "literal", count: 1, managed: false },
			catalog: { mode: "dynamic", modelCount: 0 },
			runtime: { availableModelCount: 0 },
			health: "ready",
		};
		expect(provider.definition?.transport).toBe("pi-native");
		expect(provider.definition?.authHeader).toBe(true);
		expect(provider.definition?.disableStrictTools).toBe(true);
		expect((provider.definition?.compat as { supportsTools?: boolean } | undefined)?.supportsTools).toBe(true);
		expect(provider.definition?.headers?.["X-Client"]).toBe("omp-deck");
	});
});
