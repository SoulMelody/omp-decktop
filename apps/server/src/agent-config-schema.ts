/** Settable omp SDK config.yml keys surfaced in the deck's LSP/Eval settings. */
export type AgentConfigValue = boolean | string;

type FieldType =
	| { kind: "boolean" }
	| { kind: "string" }
	| { kind: "enum"; options: readonly string[] };

export const AGENT_CONFIG_SCHEMA: Record<string, FieldType> = {
	// LSP
	"lsp.enabled": { kind: "boolean" },
	"lsp.lazy": { kind: "boolean" },
	"lsp.formatOnWrite": { kind: "boolean" },
	"lsp.diagnosticsOnWrite": { kind: "boolean" },
	"lsp.diagnosticsOnEdit": { kind: "boolean" },
	"lsp.diagnosticsDeduplicate": { kind: "boolean" },
	// Eval / kernels
	"eval.py": { kind: "boolean" },
	"eval.js": { kind: "boolean" },
	"eval.rb": { kind: "boolean" },
	"eval.jl": { kind: "boolean" },
	"python.kernelMode": { kind: "enum", options: ["session", "per-call"] },
	"python.interpreter": { kind: "string" },
	"ruby.interpreter": { kind: "string" },
	"julia.interpreter": { kind: "string" },
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
