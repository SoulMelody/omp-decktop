import { describe, expect, it } from "bun:test";
import { AGENT_CONFIG_KEYS, validateAgentConfigUpdate } from "./agent-config-schema.ts";

describe("agent-config-schema", () => {
	it("exposes lsp + eval keys", () => {
		expect(AGENT_CONFIG_KEYS).toContain("lsp.enabled");
		expect(AGENT_CONFIG_KEYS).toContain("python.kernelMode");
		expect(AGENT_CONFIG_KEYS).toContain("python.interpreter");
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

	it("enforces python.kernelMode enum", () => {
		expect(validateAgentConfigUpdate("python.kernelMode", "session")).toBeUndefined();
		expect(validateAgentConfigUpdate("python.kernelMode", "weird")).toMatch(/session|per-call/);
	});

	it("accepts string interpreter path", () => {
		expect(validateAgentConfigUpdate("python.interpreter", "/usr/bin/python3")).toBeUndefined();
		expect(validateAgentConfigUpdate("python.interpreter", 5)).toMatch(/string/i);
	});
});
