import { describe, expect, test } from "bun:test";
import type { ModelProviderRecord } from "@omp-deck/protocol";

import { applyFilters, healthLabel } from "./filters";

function makeRecord(overrides: Partial<ModelProviderRecord> & { id: string }): ModelProviderRecord {
	return {
		id: overrides.id,
		label: overrides.label ?? overrides.id,
		layers: overrides.layers ?? ["models-config"],
		editable: overrides.editable ?? true,
		definition: overrides.definition,
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

describe("applyFilters", () => {
	test("'ready' filter keeps providers whose health is ready", () => {
		const providers: ModelProviderRecord[] = [
			makeRecord({ id: "alpha", health: "ready" }),
			makeRecord({ id: "beta", health: "needs-auth" }),
		];
		expect(applyFilters(providers, "ready", "").map((p) => p.id)).toEqual(["alpha"]);
	});

	test("'needs-attention' filter excludes ready providers", () => {
		const providers: ModelProviderRecord[] = [
			makeRecord({ id: "alpha", health: "ready" }),
			makeRecord({ id: "beta", health: "config-error" }),
			makeRecord({ id: "gamma", health: "needs-auth" }),
		];
		expect(applyFilters(providers, "needs-attention", "").map((p) => p.id).sort()).toEqual([
			"beta",
			"gamma",
		]);
	});

	test("'legacy' filter requires the legacy metadata marker", () => {
		const providers: ModelProviderRecord[] = [
			makeRecord({ id: "alpha", health: "ready" }),
			makeRecord({
				id: "beta",
				health: "legacy",
				legacy: {
					extensionPath: "/tmp/beta",
					providerId: "beta",
					automaticMigration: false,
					status: "active",
				},
			}),
		];
		expect(applyFilters(providers, "legacy", "").map((p) => p.id)).toEqual(["beta"]);
	});

	test("search is case-insensitive and matches label or id substrings", () => {
		const providers: ModelProviderRecord[] = [
			makeRecord({ id: "claude-pro", label: "Claude Pro" }),
			makeRecord({ id: "gpt-team", label: "OpenAI Team" }),
			makeRecord({ id: "azure-team", label: "Azure Direct" }),
		];
		expect(applyFilters(providers, "all", "team").map((p) => p.id).sort()).toEqual([
			"azure-team",
			"gpt-team",
		]);
		expect(applyFilters(providers, "all", "CLAUDE").map((p) => p.id)).toEqual(["claude-pro"]);
	});

	test("empty/undefined providers short-circuit to []", () => {
		expect(applyFilters(undefined, "all", "")).toEqual([]);
		expect(applyFilters([], "all", "x")).toEqual([]);
	});

	test("healthLabel is stable across the union", () => {
		expect(healthLabel("ready")).toBe("ready");
		expect(healthLabel("needs-auth")).toBe("needs auth");
		expect(healthLabel("config-error")).toBe("config error");
		expect(healthLabel("discovery-warning")).toBe("discovery warn");
		expect(healthLabel("legacy")).toBe("legacy");
	});
});
