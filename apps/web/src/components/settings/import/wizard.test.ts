import { describe, expect, test } from "bun:test";

import {
	DraftMapping,
	WizardStage,
	applyReplaceConfirmation,
	buildDefaultMappings,
	filterMappings,
	isReplacementConfirmed,
	migrateCredentialAction,
	remapCollision,
	summariseStatus,
	stageIndex,
	stageProgress,
} from "./wizard";

function makeMapping(overrides: Partial<DraftMapping>): DraftMapping {
	return {
		sourceKey: overrides.sourceKey ?? "alpha::claude",
		displayName: overrides.displayName ?? "Alpha",
		proposedTargetId: overrides.proposedTargetId ?? "ccswitch-alpha",
		targetId: overrides.targetId ?? "ccswitch-alpha",
		api: overrides.api ?? "openai-completions",
		baseUrl: overrides.baseUrl ?? "https://api.alpha.test/v1",
		migrateCredential: overrides.migrateCredential ?? true,
		catalogStrategy: overrides.catalogStrategy ?? "dynamic",
		collisionAction: overrides.collisionAction ?? "new",
		confirmReplace: overrides.confirmReplace ?? false,
	};
}

describe("ImportWizard helpers", () => {
	test("buildDefaultMappings produces mapping rows for selected candidates", () => {
		const mappings = buildDefaultMappings(
			[
				{ sourceKey: "alpha::claude", proposedTargetId: "ccswitch-alpha", displayName: "Alpha", selected: true },
				{ sourceKey: "bravo::codex", proposedTargetId: "ccswitch-bravo", displayName: "Bravo", selected: false },
			],
			"openai-completions",
		);
		expect(mappings.length).toBe(1);
		expect(mappings[0]?.targetId).toBe("ccswitch-alpha");
		expect(mappings[0]?.api).toBe("openai-completions");
		expect(mappings[0]?.collisionAction).toBe("new");
	});

	test("buildDefaultMappings prefers each candidate suggested API and base URL", () => {
		const mappings = buildDefaultMappings(
			[
				{
					sourceKey: "anthropic::claude",
					proposedTargetId: "anthropic",
					displayName: "Anthropic",
					selected: true,
					suggestedApi: "anthropic-messages",
					baseUrl: "https://api.anthropic.com",
				},
				{
					sourceKey: "fallback::unknown",
					proposedTargetId: "fallback",
					displayName: "Fallback",
					selected: true,
				},
			],
			"openai-completions",
		);

		expect(mappings[0]?.api).toBe("anthropic-messages");
		expect(mappings[0]?.baseUrl).toBe("https://api.anthropic.com");
		expect(mappings[1]?.api).toBe("openai-completions");
	});

	test("summariseStatus counts selected creds, ready, and blocked replaces", () => {
		const summary = summariseStatus([
			makeMapping({ migrateCredential: true, collisionAction: "new" }),
			makeMapping({ sourceKey: "b", displayName: "B", proposedTargetId: "b", targetId: "b", migrateCredential: false, collisionAction: "skip" }),
			makeMapping({
				sourceKey: "c",
				displayName: "C",
				proposedTargetId: "c",
				targetId: "c",
				migrateCredential: false,
				collisionAction: "replace",
				confirmReplace: false,
			}),
		]);
		expect(summary.selected).toBe(1);
		expect(summary.ready).toBe(1);
		expect(summary.blocked).toBe(1);
	});

	test("isReplacementConfirmed returns true when no replace is requested", () => {
		expect(isReplacementConfirmed(makeMapping({ collisionAction: "skip" }))).toBe(true);
	});

	test("applyReplaceConfirmation toggles confirmReplace + action", () => {
		const next = applyReplaceConfirmation(makeMapping({ collisionAction: "replace" }), true);
		expect(next.confirmReplace).toBe(true);
		const cleared = applyReplaceConfirmation(
			makeMapping({ collisionAction: "replace", confirmReplace: true }),
			false,
		);
		expect(cleared.collisionAction).toBe("replace");
		expect(cleared.confirmReplace).toBe(false);
	});

	test("remapCollision rejects unknown actions", () => {
		const next = remapCollision(makeMapping({ collisionAction: "merge" }), "skip");
		expect(next.collisionAction).toBe("skip");
		// @ts-expect-error verifying unknown action is ignored
		expect(remapCollision(makeMapping({}), "bogus").collisionAction).toBe("new");
	});

	test("filterMappings narrows by displayName, targetId, or sourceKey", () => {
		const a = makeMapping({ displayName: "Anthropic Claude", targetId: "claude", sourceKey: "alpha::claude" });
		const b = makeMapping({ displayName: "OpenAI", targetId: "openai", sourceKey: "bravo::codex" });
		expect(filterMappings([a, b], "claude").map((m) => m.sourceKey)).toEqual(["alpha::claude"]);
		expect(filterMappings([a, b], "Codex")).toEqual([b]);
		expect(filterMappings([a, b], "")).toEqual([a, b]);
	});

	test("migrateCredentialAction maps to preserve/set/remove", () => {
		expect(migrateCredentialAction(makeMapping({ migrateCredential: true }))).toBe("set");
		expect(migrateCredentialAction(makeMapping({ migrateCredential: false }))).toBe("preserve");
	});

	test("stageProgress maps index 0..5 onto done/total counts", () => {
		expect(stageProgress("scan" as WizardStage)).toEqual({ done: 0, total: 5 });
		expect(stageProgress("preview" as WizardStage)).toEqual({ done: 3, total: 5 });
		expect(stageProgress("done" as WizardStage)).toEqual({ done: 5, total: 5 });
	});

	test("stageIndex is monotonic and last", () => {
		expect(stageIndex("scan" as WizardStage)).toBe(0);
		expect(stageIndex("done" as WizardStage)).toBe(5);
	});
});
