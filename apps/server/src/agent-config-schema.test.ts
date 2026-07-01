import { describe, expect, it } from "bun:test";
import { AGENT_CONFIG_KEYS, validateAgentConfigUpdate } from "./agent-config-schema.ts";

describe("agent-config-schema", () => {
	it("exposes only LSP keys", () => {
		expect(AGENT_CONFIG_KEYS).toContain("lsp.enabled");
		expect(AGENT_CONFIG_KEYS).toContain("lsp.lazy");
		expect(AGENT_CONFIG_KEYS).toContain("lsp.diagnosticsDeduplicate");
		// Eval / kernel settings are intentionally NOT exposed — see python-repl docs.
		expect(AGENT_CONFIG_KEYS).not.toContain("eval.py");
		expect(AGENT_CONFIG_KEYS).not.toContain("python.interpreter");
	});

	it("accepts a valid boolean key", () => {
		expect(validateAgentConfigUpdate("lsp.enabled", true)).toBeUndefined();
	});

	it("rejects an unknown key", () => {
		expect(validateAgentConfigUpdate("lsp.bogus", true)).toMatch(/unknown/i);
	});

	it("rejects a wrong-typed value", () => {
		expect(validateAgentConfigUpdate("lsp.enabled", "yes")).toMatch(/boolean/i);
	});

	it("rejects previously-eval keys", () => {
		expect(validateAgentConfigUpdate("eval.py", true)).toMatch(/unknown/i);
		expect(validateAgentConfigUpdate("python.kernelMode", "session")).toMatch(/unknown/i);
	});
});
