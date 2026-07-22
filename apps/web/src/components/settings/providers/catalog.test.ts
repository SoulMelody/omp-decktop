import { describe, expect, test } from "bun:test";
import type { RedactedModelDefinition } from "@omp-deck/protocol";

import {
	addDiscoveredModels,
	applyAction,
	catalogBase,
	cloneId,
	deriveMode,
	isDuplicateId,
	mergeModel,
	modelSourceLabel,
	projectEditedModel,
	redactHeadersForCatalog,
	sparsePersist,
	validateModelDraft,
} from "./catalog";

function makeModel(overrides: Partial<RedactedModelDefinition> & { id: string }): RedactedModelDefinition {
	return {
		id: overrides.id,
		name: overrides.name ?? overrides.id,
		input: overrides.input ?? ["text"],
		reasoning: overrides.reasoning,
		contextWindow: overrides.contextWindow,
		maxTokens: overrides.maxTokens,
		supportsTools: overrides.supportsTools,
		thinking: overrides.thinking,
		cost: overrides.cost,
		headers: overrides.headers,
		compat: overrides.compat,
	};
}

describe("deriveMode", () => {
	test("returns dynamic when neither models nor overrides are present and registry is non-empty", () => {
		expect(deriveMode(undefined, undefined, 12)).toBe("dynamic");
		expect(deriveMode([], {}, 4)).toBe("dynamic");
	});
	test("returns pinned when models are present and overrides are empty", () => {
		expect(deriveMode([makeModel({ id: "a" })], {}, 4)).toBe("pinned");
	});
	test("returns hybrid when both models and overrides are present", () => {
		expect(
			deriveMode(
				[makeModel({ id: "a" })],
				{ a: { contextWindow: 4096 } },
				1,
			),
		).toBe("hybrid");
	});
	test("returns builtin when neither registry nor models nor overrides exist", () => {
		expect(deriveMode([], {}, 0)).toBe("builtin");
		expect(deriveMode([], {}, 1)).toBe("dynamic");
	});
});

describe("applyAction", () => {
	test("add inserts a new model only when id is unique", () => {
		const next = applyAction(
			{ mode: "pinned", models: [], overrides: {}, discoveredIds: [] },
			{ kind: "add", model: makeModel({ id: "x" }) },
		);
		expect(next.models.map((m) => m.id)).toEqual(["x"]);
		expect(
			applyAction(next, { kind: "add", model: makeModel({ id: "x" }) }).models.map((m) => m.id),
		).toEqual(["x"]);
	});

	test("edit merges only the provided fields", () => {
		const next = applyAction(
			{ mode: "pinned", models: [makeModel({ id: "x", contextWindow: 4096 })], overrides: {}, discoveredIds: [] },
			{
				kind: "edit",
				id: "x",
				patch: { maxTokens: 512 },
			},
		);
		expect(next.models[0]?.contextWindow).toBe(4096);
		expect(next.models[0]?.maxTokens).toBe(512);
	});

	test("duplicate appends a suffixed copy and refuses collisions", () => {
		const draft = {
			mode: "pinned" as const,
			models: [makeModel({ id: "x" })],
			overrides: {},
			discoveredIds: [],
		};
		const next = applyAction(draft, { kind: "duplicate", id: "x" });
		expect(next.models.map((m) => m.id)).toEqual(["x", "x-copy"]);
		const overflow = applyAction(
			{ ...draft, models: [makeModel({ id: "x" }), makeModel({ id: "x-copy" })] },
			{ kind: "duplicate", id: "x-copy" },
		);
		const ids = overflow.models.map((m) => m.id);
		expect(ids).toContain("x");
		expect(ids).toContain("x-copy");
		expect(ids.length).toBeGreaterThan(2);
	});

	test("remove also drops any matching override", () => {
		const next = applyAction(
			{
				mode: "hybrid" as const,
				models: [makeModel({ id: "x" })],
				overrides: { x: { name: "X" } },
				discoveredIds: [],
			},
			{ kind: "remove", id: "x" },
		);
		expect(next.models).toEqual([]);
		expect(next.overrides).toEqual({});
	});

	test("configure toggles the override entry", () => {
		const first = applyAction(
			{ mode: "hybrid" as const, models: [makeModel({ id: "x" })], overrides: {}, discoveredIds: [] },
			{ kind: "configure", id: "x", override: { name: "X" } },
		);
		expect(first.overrides.x).toEqual({ name: "X" });
		const cleared = applyAction(first, { kind: "configure", id: "x", override: undefined });
		expect(cleared.overrides).toEqual({});
	});
});

describe("catalogBase", () => {
	test("merges incoming with the existing list and updates the discovered set", () => {
		const next = catalogBase(
			{ mode: "pinned", models: [], overrides: {}, discoveredIds: [] },
			[makeModel({ id: "alpha" })],
			[],
		);
		expect(next.models.map((m) => m.id)).toEqual(["alpha"]);
		expect(next.discoveredIds).toContain("alpha");
	});
});

describe("addDiscoveredModels", () => {
	test("adds newly discovered models without dropping configured models", () => {
		const next = addDiscoveredModels(
			{
				mode: "pinned",
				models: [makeModel({ id: "configured" })],
				overrides: {},
				discoveredIds: [],
			},
			[makeModel({ id: "remote-a" }), makeModel({ id: "remote-b" })],
		);

		expect(next.models.map((model) => model.id)).toEqual(["configured", "remote-a", "remote-b"]);
		expect(next.discoveredIds).toEqual(["remote-a", "remote-b"]);
	});

	test("does not duplicate existing models but marks them as discovered", () => {
		const next = addDiscoveredModels(
			{
				mode: "hybrid",
				models: [makeModel({ id: "shared" })],
				overrides: {},
				discoveredIds: [],
			},
			[makeModel({ id: "shared" }), makeModel({ id: "new" })],
		);

		expect(next.models.map((model) => model.id)).toEqual(["shared", "new"]);
		expect(next.discoveredIds).toEqual(["shared", "new"]);
	});
});

describe("validateModelDraft", () => {
	test("flags missing id", () => {
		expect(validateModelDraft({} as RedactedModelDefinition)).toContain("id is required");
	});
	test("flags non-positive contextWindow/maxTokens and unknown input modalities", () => {
		const issues = validateModelDraft({ id: "x", contextWindow: 0, maxTokens: -1, input: ["audio"] });
		expect(issues.join("\n")).toMatch(/contextWindow must be positive/);
		expect(issues.join("\n")).toMatch(/maxTokens must be positive/);
		expect(issues.join("\n")).toMatch(/unknown input: audio/);
	});
	test("requires non-empty effort list when thinking mode is effort", () => {
		expect(
			validateModelDraft({
				id: "x",
				thinking: { mode: "effort", efforts: [] },
			}).join("\n"),
		).toMatch(/efforts is required/);
	});
});

describe("helpers", () => {
	test("cloneId increments numeric suffix when present", () => {
		expect(cloneId("model-2")).toBe("model-3");
		expect(cloneId("model")).toBe("model-copy");
	});
	test("isDuplicateId matches anywhere in the existing list", () => {
		expect(isDuplicateId("x", [makeModel({ id: "x" })])).toBe(true);
		expect(isDuplicateId("y", [makeModel({ id: "x" })])).toBe(false);
	});
	test("modelSourceLabel reports configured, remote, or edited", () => {
		expect(modelSourceLabel(makeModel({ id: "new" }), [])).toBe("configured");
		expect(modelSourceLabel(makeModel({ id: "remote" }), ["remote"])).toBe("remote");
		expect(modelSourceLabel(makeModel({ id: "remote", name: "remote (copy)" }), [])).toBe("edited");
	});
	test("mergeModel preserves untouched fields", () => {
		const merged = mergeModel(
			makeModel({ id: "x", contextWindow: 2048 }),
			{ maxTokens: 1024 },
		);
		expect(merged.contextWindow).toBe(2048);
		expect(merged.maxTokens).toBe(1024);
	});
	test("sparsePersist returns only fields that differ", () => {
		const saved = makeModel({ id: "x", contextWindow: 2048 });
		const draft = { ...saved, contextWindow: 4096 };
		expect(sparsePersist(draft, saved)).toEqual({ contextWindow: 4096 });
	});
	test("projectEditedModel excludes opaque advanced fields", () => {
		const saved = makeModel({ id: "x", contextWindow: 2048, headers: { "X-A": "1" }, compat: { a: 1 } });
		const draft = { ...saved, contextWindow: 4096, headers: { "X-A": "2" }, compat: { a: 2 } };
		expect(projectEditedModel(draft, saved)).toEqual({ contextWindow: 4096 });
	});
	test("redactHeadersForCatalog masks values containing the sentinel", () => {
		expect(
			redactHeadersForCatalog(
				{ "X-User": "omp-deck", "X-Auth": "__OMP_DECK_SECRET__" },
				"__OMP_DECK_SECRET__",
			),
		).toEqual({ "X-User": "omp-deck", "X-Auth": "__OMP_DECK_SECRET__" });
	});
});
