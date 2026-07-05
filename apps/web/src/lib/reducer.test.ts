/**
 * Tests for the prompt-queue lifecycle (T-88). Covers the three synthetic
 * events the bridge emits via the session_event channel — `prompt_queued`,
 * `queue_cleared` — plus the de-dup behavior that drops a queued bubble
 * when the SDK eventually emits the real user message_start it was waiting
 * on.
 */
import { describe, expect, test } from "bun:test";

import { applyEvent, initSession } from "./reducer";
import type { SessionUi } from "./types";

function fresh(): SessionUi {
	return initSession({
		sessionId: "s1",
		cwd: "/tmp/x",
		isStreaming: true,
		messages: [],
		todoPhases: [],
	});
}

function queueEvent(text: string, queuedId = `q-${text}`) {
	return { type: "prompt_queued", queuedId, text, behavior: "followUp" } as never;
}

function userMessageStart(text: string, synthetic = false) {
	return {
		type: "message_start",
		message: { role: "user", content: text, synthetic, timestamp: 1700000000000 },
	} as never;
}

describe("reducer queue lifecycle", () => {
	test("prompt_queued appends a QueuedPrompt with the server id", () => {
		const s1 = applyEvent(fresh(), queueEvent("first", "abc"));
		expect(s1.queuedPrompts).toHaveLength(1);
		expect(s1.queuedPrompts[0]).toMatchObject({
			id: "abc",
			text: "first",
			behavior: "followUp",
		});
		const s2 = applyEvent(s1, queueEvent("second", "def"));
		expect(s2.queuedPrompts.map((q) => q.id)).toEqual(["abc", "def"]);
	});

	test("real user message_start drops the first matching queued entry (FIFO)", () => {
		let s = fresh();
		s = applyEvent(s, queueEvent("alpha", "1"));
		s = applyEvent(s, queueEvent("beta", "2"));
		s = applyEvent(s, queueEvent("alpha", "3")); // duplicate text — drop the oldest

		s = applyEvent(s, userMessageStart("alpha"));
		expect(s.queuedPrompts.map((q) => q.id)).toEqual(["2", "3"]);
		// The real user message also lands in `messages` so the chat shows it.
		expect(s.messages.at(-1)).toMatchObject({ role: "user", text: "alpha", synthetic: false });
	});

	test("synthetic user message_start does NOT drop a queued entry", () => {
		// Slash-command round-trips emit synthetic user messages with the
		// command text. They didn't come from the composer queue, so they
		// must not consume a queued bubble even if the text happens to match.
		let s = fresh();
		s = applyEvent(s, queueEvent("/help", "z"));
		s = applyEvent(s, userMessageStart("/help", true));
		expect(s.queuedPrompts.map((q) => q.id)).toEqual(["z"]);
	});

	test("queue_cleared empties the queue", () => {
		let s = fresh();
		s = applyEvent(s, queueEvent("a"));
		s = applyEvent(s, queueEvent("b"));
		expect(s.queuedPrompts).toHaveLength(2);

		s = applyEvent(s, { type: "queue_cleared", cleared: { steering: 0, followUp: 2 } } as never);
		expect(s.queuedPrompts).toHaveLength(0);
	});

	test("queue_cleared on an already-empty queue is a no-op (returns same ref)", () => {
		const s = fresh();
		const next = applyEvent(s, { type: "queue_cleared", cleared: { steering: 0, followUp: 0 } } as never);
		expect(next).toBe(s);
	});

	test("non-matching user message leaves the queue untouched", () => {
		let s = fresh();
		s = applyEvent(s, queueEvent("hello", "h"));
		s = applyEvent(s, userMessageStart("something unrelated"));
		expect(s.queuedPrompts.map((q) => q.id)).toEqual(["h"]);
	});

	test("initSession seeds queuedPrompts as an empty array", () => {
		expect(fresh().queuedPrompts).toEqual([]);
	});
});

/**
 * T-106: bridge synthesizes `todo_phases_set` after every `todo_write`
 * `tool_execution_end` so the Inspector doesn't show stale todos between
 * SDK reminder ticks. Reducer must normalize the carried `todoPhases`
 * into the same shape `todo_reminder` produces, and must coexist with
 * the existing reminder path without one stomping the other.
 */
describe("reducer todo_phases_set (T-106)", () => {
	test("replaces todoPhases with the carried snapshot, normalized", () => {
		let s = fresh();
		s = applyEvent(s, {
			type: "todo_phases_set",
			todoPhases: [
				{
					id: "phase-1",
					name: "Merge",
					tasks: [
						{ id: "t1", content: "Stage A", status: "completed" },
						{ id: "t2", content: "Stage B", status: "in_progress" },
					],
				},
			],
		} as never);
		expect(s.todoPhases).toHaveLength(1);
		expect(s.todoPhases[0]!.name).toBe("Merge");
		expect(s.todoPhases[0]!.tasks.map((t) => t.status)).toEqual(["completed", "in_progress"]);
	});

	test("empty array clears todoPhases", () => {
		let s = fresh();
		s = applyEvent(s, {
			type: "todo_phases_set",
			todoPhases: [{ name: "phase", tasks: [{ content: "x", status: "pending" }] }],
		} as never);
		expect(s.todoPhases).toHaveLength(1);
		s = applyEvent(s, { type: "todo_phases_set", todoPhases: [] } as never);
		expect(s.todoPhases).toEqual([]);
	});

	test("missing todoPhases payload is treated as empty (defensive)", () => {
		let s = fresh();
		s = applyEvent(s, { type: "todo_phases_set" } as never);
		expect(s.todoPhases).toEqual([]);
	});

	test("does not interfere with todo_reminder's existing wrap-once shape", () => {
		let s = fresh();
		// SDK-style reminder: single phase value (NOT wrapped)
		s = applyEvent(s, {
			type: "todo_reminder",
			todos: { name: "from-reminder", tasks: [{ content: "x", status: "pending" }] },
		} as never);
		expect(s.todoPhases[0]!.name).toBe("from-reminder");
		// Synthetic event then overrides cleanly with the canonical shape
		s = applyEvent(s, {
			type: "todo_phases_set",
			todoPhases: [{ name: "from-sync", tasks: [{ content: "y", status: "completed" }] }],
		} as never);
		expect(s.todoPhases[0]!.name).toBe("from-sync");
	});
});

describe("reducer todo_auto_clear event", () => {
	test("keeps the last rendered todo list instead of clearing it", () => {
		let s = fresh();
		s = applyEvent(s, {
			type: "todo_phases_set",
			todoPhases: [{ name: "Merge", tasks: [{ content: "Stage A", status: "completed" }] }],
		} as never);
		expect(s.todoPhases).toHaveLength(1);
		const before = s.todoPhases;
		s = applyEvent(s, { type: "todo_auto_clear" } as never);
		// The SDK's auto-clear must not blank a pinned todo panel — the last
		// list survives untouched until a real reminder/phases_set replaces it.
		expect(s.todoPhases).toBe(before);
		expect(s.todoPhases[0]!.name).toBe("Merge");
	});

	test("a later todo_phases_set still replaces the retained list", () => {
		let s = fresh();
		s = applyEvent(s, {
			type: "todo_phases_set",
			todoPhases: [{ name: "old", tasks: [{ content: "x", status: "completed" }] }],
		} as never);
		s = applyEvent(s, { type: "todo_auto_clear" } as never);
		s = applyEvent(s, {
			type: "todo_phases_set",
			todoPhases: [{ name: "new", tasks: [{ content: "y", status: "pending" }] }],
		} as never);
		expect(s.todoPhases).toHaveLength(1);
		expect(s.todoPhases[0]!.name).toBe("new");
	});
});

describe("reducer queue_state event", () => {
	test("replaces queuedPrompts wholesale with the broadcast list", () => {
		let s = fresh();
		s = applyEvent(s, queueEvent("a", "1"));
		s = applyEvent(s, queueEvent("b", "2"));
		s = applyEvent(s, queueEvent("c", "3"));

		s = applyEvent(s, {
			type: "queue_state",
			queue: [
				{ id: "1", text: "a", behavior: "followUp", queuedAt: 1 },
				{ id: "3", text: "c", behavior: "followUp", queuedAt: 3 },
			],
		} as never);
		expect(s.queuedPrompts.map((q) => q.id)).toEqual(["1", "3"]);
	});

	test("returns the same state ref when the broadcast queue is structurally identical", () => {
		let s = fresh();
		s = applyEvent(s, queueEvent("a", "1"));
		const before = s;
		s = applyEvent(s, {
			type: "queue_state",
			queue: [{ id: "1", text: "a", behavior: "followUp", queuedAt: 1 }],
		} as never);
		expect(s).toBe(before);
	});

	test("queue_state with edited text on the same id updates that entry only", () => {
		let s = fresh();
		s = applyEvent(s, queueEvent("draft", "x"));
		s = applyEvent(s, {
			type: "queue_state",
			queue: [{ id: "x", text: "polished", behavior: "followUp", queuedAt: 1 }],
		} as never);
		expect(s.queuedPrompts[0]).toMatchObject({ id: "x", text: "polished" });
	});

	test("malformed queue entries (no id) are dropped, not crashed on", () => {
		const s = applyEvent(fresh(), {
			type: "queue_state",
			queue: [
				{ text: "ghost", behavior: "followUp" },
				{ id: "ok", text: "kept", behavior: "followUp", queuedAt: 1 },
			],
		} as never);
		expect(s.queuedPrompts.map((q) => q.id)).toEqual(["ok"]);
	});
});

describe("reducer queuedPrompts snapshot hydration", () => {
	test("initSession hydrates queuedPrompts from snapshot when present", () => {
		const s = initSession({
			sessionId: "s1",
			cwd: "/tmp/x",
			isStreaming: true,
			messages: [],
			todoPhases: [],
			queuedPrompts: [
				{ id: "k1", text: "first", behavior: "followUp", queuedAt: 1 },
				{ id: "k2", text: "second", behavior: "steer", queuedAt: 2 },
			],
		});
		expect(s.queuedPrompts.map((q) => q.id)).toEqual(["k1", "k2"]);
		expect(s.queuedPrompts[1]?.behavior).toBe("steer");
	});
});

describe("reducer session_replaced event", () => {
	test("rebuilds state from carried snapshot while keeping session id stable", () => {
		let s = fresh();
		s = applyEvent(s, queueEvent("old queued", "q-old"));
		s = applyEvent(s, userMessageStart("old message"));

		const next = applyEvent(s, {
			type: "session_replaced",
			snapshot: {
				sessionId: "s1",
				cwd: "/tmp/x",
				isStreaming: false,
				messages: [{ role: "user", content: "new branch", timestamp: 1700000000001 }],
				todoPhases: [{ name: "branch", tasks: [{ content: "do branch", status: "pending" }] }],
			},
		} as never);

		expect(next.sessionId).toBe("s1");
		expect(next.status).toBe("idle");
		expect(next.queuedPrompts).toEqual([]);
		expect(next.messages.map((m) => m.text)).toEqual(["new branch"]);
		expect(next.todoPhases[0]?.name).toBe("branch");
	});

	test("ignores malformed replacement payloads", () => {
		const s = fresh();
		expect(applyEvent(s, { type: "session_replaced" } as never)).toBe(s);
	});
});

describe("reducer subagent task events", () => {
	function withTaskTool(): SessionUi {
		return applyEvent(fresh(), {
			type: "tool_execution_start",
			toolCallId: "tool-task-1",
			toolName: "task",
			args: {
				agent: "explore",
				tasks: [{ id: "MapTools", description: "Map tool renderers" }],
			},
		} as never);
	}

	test("subagent_lifecycle started creates a running subagent run", () => {
		const s = applyEvent(withTaskTool(), {
			type: "subagent_lifecycle",
			parentToolCallId: "tool-task-1",
			subagentId: "MapTools",
			index: 0,
			label: "MapTools",
			agent: "explore",
			description: "Map tool renderers",
			status: "started",
			sessionFile: "/tmp/subagent.jsonl",
		} as never);

		expect(s.toolCalls["tool-task-1"]?.subagents?.MapTools).toMatchObject({
			id: "MapTools",
			index: 0,
			label: "MapTools",
			agent: "explore",
			description: "Map tool renderers",
			status: "running",
			outputAvailable: false,
			sessionFile: "/tmp/subagent.jsonl",
		});
	});

	test("subagent_progress merges metrics into an existing run", () => {
		let s = applyEvent(withTaskTool(), {
			type: "subagent_lifecycle",
			parentToolCallId: "tool-task-1",
			subagentId: "MapTools",
			index: 0,
			label: "MapTools",
			status: "started",
		} as never);

		s = applyEvent(s, {
			type: "subagent_progress",
			parentToolCallId: "tool-task-1",
			subagentId: "MapTools",
			status: "running",
			durationMs: 1234,
			cost: 0.42,
			requests: 3,
			tokens: 456,
			currentTool: "grep",
			recentOutput: ["checking files", "found renderer"],
		} as never);

		expect(s.toolCalls["tool-task-1"]?.subagents?.MapTools).toMatchObject({
			status: "running",
			durationMs: 1234,
			cost: 0.42,
			requests: 3,
			tokens: 456,
			currentTool: "grep",
			recentOutput: ["checking files", "found renderer"],
		});
	});

	test("terminal subagent_lifecycle completed marks output available", () => {
		let s = applyEvent(withTaskTool(), {
			type: "subagent_lifecycle",
			parentToolCallId: "tool-task-1",
			subagentId: "MapTools",
			index: 0,
			status: "started",
		} as never);

		s = applyEvent(s, {
			type: "subagent_lifecycle",
			parentToolCallId: "tool-task-1",
			subagentId: "MapTools",
			status: "completed",
		} as never);

		expect(s.toolCalls["tool-task-1"]?.subagents?.MapTools).toMatchObject({
			status: "complete",
			outputAvailable: true,
		});
		expect(s.toolCalls["tool-task-1"]?.subagents?.MapTools.completedAt).toBeNumber();
	});

	test("missing parent tool call is a no-op", () => {
		const s = withTaskTool();
		const next = applyEvent(s, {
			type: "subagent_lifecycle",
			parentToolCallId: "missing-tool",
			subagentId: "MapTools",
			status: "started",
		} as never);

		expect(next).toBe(s);
	});
});

describe("reducer goal_updated lifecycle", () => {
	test("hydrates goal progress from goal_updated event", () => {
		const active = applyEvent(fresh(), {
			type: "goal_updated",
			goal: {
				enabled: true,
				objective: "Ship safely",
				status: "active",
				tokenBudget: 100,
				tokensUsed: 12,
				timeUsedSeconds: 3,
			},
		} as never);

		expect(active.goalMode).toMatchObject({ objective: "Ship safely", status: "active" });
	});

	test("clears goalMode when goal is null", () => {
		const withGoal = applyEvent(fresh(), {
			type: "goal_updated",
			goal: {
				enabled: true,
				objective: "Ship safely",
				status: "active",
				tokenBudget: 100,
				tokensUsed: 12,
				timeUsedSeconds: 3,
			},
		} as never);

		const cleared = applyEvent(withGoal, { type: "goal_updated", goal: null } as never);
		expect(cleared.goalMode).toBeUndefined();
	});

	test("initSession seeds goalMode from snapshot", () => {
		const s = initSession({
			sessionId: "s1",
			cwd: "/tmp/x",
			isStreaming: true,
			messages: [],
			todoPhases: [],
			goalMode: {
				enabled: true,
				objective: "Refactor core",
				status: "paused",
				tokensUsed: 42,
				timeUsedSeconds: 10,
			},
		});
		expect(s.goalMode).toMatchObject({ objective: "Refactor core", status: "paused" });
	});
});
