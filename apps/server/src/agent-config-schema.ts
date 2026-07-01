/** Settable omp SDK config.yml keys surfaced in the deck's LSP settings. */
export type AgentConfigValue = boolean | string;

type FieldType =
	| { kind: "boolean" }
	| { kind: "string" }
	| { kind: "enum"; options: readonly string[] };

export const AGENT_CONFIG_SCHEMA: Record<string, FieldType> = {
	"lsp.enabled": { kind: "boolean" },
	"lsp.lazy": { kind: "boolean" },
	"lsp.formatOnWrite": { kind: "boolean" },
	"lsp.diagnosticsOnWrite": { kind: "boolean" },
	"lsp.diagnosticsOnEdit": { kind: "boolean" },
	"lsp.diagnosticsDeduplicate": { kind: "boolean" },
};

export const AGENT_CONFIG_KEYS = Object.keys(AGENT_CONFIG_SCHEMA);

/** Returns an error string when invalid, or undefined when the (key, value) pair is acceptable. */
export function validateAgentConfigUpdate(key: string, value: unknown): string | undefined {
	const field = AGENT_CONFIG_SCHEMA[key];
	if (!field) return `unknown agent-config key: ${key}`;
	if (field.kind === "boolean") {
		if (typeof value !== "boolean") return `${key}: expected boolean`;
		return undefined;
	}
	if (field.kind === "string") {
		if (typeof value !== "string") return `${key}: expected string`;
		return undefined;
	}
	if (typeof value !== "string" || !field.options.includes(value)) {
		return `${key}: expected one of ${field.options.join(", ")}`;
	}
	return undefined;
}
