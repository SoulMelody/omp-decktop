/**
 * GoalModeBridge tests — exercises the per-session goal-mode state machine
 * without spinning up a real AgentSession. The session surface is stubbed
 * to track tool mutations and abort calls.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { GoalModeContextWire, ServerFrame } from "@omp-deck/protocol";

import { GoalModeBridge, type GoalAction, type GoalModeSessionSurface, type GoalModeFrame } from "./goal-mode-bridge.ts";

class StubSession implements GoalModeSessionSurface {
	private _activeTools: string[];
	private _isStreaming: boolean;
	abortCalls = 0;
	promptCalls: Array<{ text: string }> = [];
	setActiveToolsCalls: string[][] = [];

	constructor(initialTools: string[] = ["read", "write"]) {
		this._activeTools = [...initialTools];
		this._isStreaming = false;
	}

	getActiveToolNames(): string[] {
		return [...this._activeTools];
	}

	async setActiveToolsByName(toolNames: string[]): Promise<void> {
		this._activeTools = [...toolNames];
		this.setActiveToolsCalls.push([...toolNames]);
	}

	get isStreaming(): boolean {
		return this._isStreaming;
	}

	set isStreaming(value: boolean) {
		this._isStreaming = value;
	}

	async abort(): Promise<void> {
		this.abortCalls += 1;
	}

	async prompt(text: string): Promise<boolean> {
		this.promptCalls.push({ text });
		return true;
	}
}

function collect(bridge: GoalModeBridge): { frames: GoalModeFrame[]; unsub: () => void } {
	const frames: GoalModeFrame[] = [];
	const unsub = bridge.subscribe((frame) => frames.push(frame));
	return { frames, unsub };
}

describe("GoalModeBridge", () => {
	let session: StubSession;
	let bridge: GoalModeBridge;

	beforeEach(() => {
		session = new StubSession();
		bridge = new GoalModeBridge({
			sessionId: "s-test",
			session,
		});
	});

	afterEach(() => {
		bridge.dispose();
	});

	describe("create", () => {
		it("starts a new goal and adds 'goal' tool", async () => {
			await bridge.act({ action: "create", objective: "Ship Goal Mode", tokenBudget: 100 });

			expect(session.setActiveToolsCalls).toContainEqual(["read", "write", "goal"]);
			expect(bridge.getContext()).toMatchObject({
				enabled: true,
				objective: "Ship Goal Mode",
				status: "active",
				tokenBudget: 100,
			});
		});

		it("rejects empty objective", async () => {
			await expect(bridge.act({ action: "create", objective: "" })).rejects.toThrow("objective required");
			await expect(bridge.act({ action: "create", objective: "   " })).rejects.toThrow("objective required");
		});
	});

	describe("pause", () => {
		it("pauses an active goal and removes 'goal' tool", async () => {
			await bridge.act({ action: "create", objective: "Test pause" });
			expect(bridge.getContext()?.status).toBe("active");

			await bridge.pauseForPlanMode();

			expect(bridge.getContext()?.status).toBe("paused");
			expect(session.setActiveToolsCalls.at(-1)).toEqual(["read", "write"]);
		});

		it("no-op when no active goal", async () => {
			await bridge.pauseForPlanMode();
			expect(bridge.getContext()).toBeUndefined();
		});
	});

	describe("resume", () => {
		it("resumes a paused goal and adds 'goal' tool back", async () => {
			await bridge.act({ action: "create", objective: "Test resume" });
			await bridge.pauseForPlanMode();
			expect(bridge.getContext()?.status).toBe("paused");

			await bridge.act({ action: "resume" });

			expect(bridge.getContext()?.status).toBe("active");
			expect(session.setActiveToolsCalls.at(-1)).toEqual(["read", "write", "goal"]);
		});

		it("rejects resume when no paused goal", async () => {
			await expect(bridge.act({ action: "resume" })).rejects.toThrow("no paused goal");
		});
	});

	describe("cancel", () => {
		it("cancels an active goal and clears state", async () => {
			await bridge.act({ action: "create", objective: "Test cancel" });
			expect(bridge.getContext()).toBeDefined();

			await bridge.act({ action: "cancel" });

			expect(bridge.getContext()).toBeUndefined();
		});

		it("aborts streaming session on cancel", async () => {
			await bridge.act({ action: "create", objective: "Test abort" });
			session.isStreaming = true;

			await bridge.act({ action: "cancel" });

			expect(session.abortCalls).toBe(1);
			expect(bridge.getContext()).toBeUndefined();
		});
	});

	describe("set_budget", () => {
		it("updates tokenBudget on active goal", async () => {
			await bridge.act({ action: "create", objective: "Budget test", tokenBudget: 50 });
			await bridge.act({ action: "set_budget", tokenBudget: 200 });

			expect(bridge.getContext()?.tokenBudget).toBe(200);
		});

		it("rejects set_budget when no active goal", async () => {
			await expect(bridge.act({ action: "set_budget", tokenBudget: 100 })).rejects.toThrow("no active goal");
		});
	});

	describe("restore", () => {
		it("restores goal state as paused (does not auto-continue)", async () => {
			const state: GoalModeContextWire = {
				enabled: true,
				objective: "Restored goal",
				status: "active",
				tokensUsed: 10,
				timeUsedSeconds: 5,
			};

			bridge.restore(state);

			expect(bridge.getContext()?.status).toBe("paused");
			expect(bridge.getContext()?.objective).toBe("Restored goal");
			// No 'goal' tool added — user must explicitly resume
			expect(session.setActiveToolsCalls).not.toContainEqual(["read", "write", "goal"]);
		});
	});

	describe("broadcasting", () => {
		it("broadcasts goal_updated on create", async () => {
			const { frames } = collect(bridge);
			await bridge.act({ action: "create", objective: "Broadcast test" });

			expect(frames).toHaveLength(1);
			expect(frames[0]).toMatchObject({
				type: "goal_updated",
				sessionId: "s-test",
				goal: { status: "active", objective: "Broadcast test" },
			});
		});

		it("broadcasts goal_updated with null on cancel", async () => {
			const { frames } = collect(bridge);
			await bridge.act({ action: "create", objective: "Cancel broadcast" });
			await bridge.act({ action: "cancel" });

			expect(frames).toHaveLength(2);
			expect(frames[1]).toMatchObject({
				type: "goal_updated",
				sessionId: "s-test",
				goal: null,
			});
		});
	});

	describe("getContext", () => {
		it("returns undefined when no goal", () => {
			expect(bridge.getContext()).toBeUndefined();
		});

		it("returns current goal state after create", async () => {
			await bridge.act({ action: "create", objective: "Get context" });
			const ctx = bridge.getContext();
			expect(ctx).toMatchObject({
				enabled: true,
				objective: "Get context",
				status: "active",
				tokensUsed: 0,
				timeUsedSeconds: 0,
			});
		});
	});
});