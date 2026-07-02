import { describe, expect, test } from "bun:test";

import { getSessionBarStatus } from "./StatusBar";
import type { SessionUi } from "@/lib/types";

function session(overrides: Partial<SessionUi> = {}): SessionUi {
	return {
		sessionId: "s1",
		cwd: "/tmp/project",
		messages: [],
		toolCalls: {},
		todoPhases: [],
		status: "idle",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: 0,
		},
		turnCount: 0,
		queuedPrompts: [],
		...overrides,
	};
}

describe("getSessionBarStatus", () => {
	test("keeps an idle session with no live or queued work ready to render as ready", () => {
		expect(getSessionBarStatus(session())).toBe("idle");
	});

	test("reports queued only when an otherwise-idle session has pending prompts", () => {
		expect(
			getSessionBarStatus(
				session({
					queuedPrompts: [
						{ id: "q1", text: "next", behavior: "followUp", queuedAt: 1700000000000 },
					],
				}),
			),
		).toBe("queued");
	});

	test("treats a streaming assistant tail as streaming even before session.status updates", () => {
		expect(
			getSessionBarStatus(
				session({
					messages: [
						{ id: "u1", role: "user", text: "hello" },
						{ id: "a1", role: "assistant", blocks: [], isStreaming: true },
					],
				}),
			),
		).toBe("streaming");
	});

	test("treats a running tool call as streaming even after session.status falls idle", () => {
		expect(
			getSessionBarStatus(
				session({
					toolCalls: {
						call1: {
							id: "call1",
							name: "read",
							args: undefined,
							status: "running",
							isError: false,
							startedAt: 1700000000000,
						},
					},
				}),
			),
		).toBe("streaming");
	});

	test("lets explicit non-idle session status win over derived live-work signals", () => {
		expect(
			getSessionBarStatus(
				session({
					status: "retrying",
					messages: [{ id: "a1", role: "assistant", blocks: [], isStreaming: true }],
					queuedPrompts: [
						{ id: "q1", text: "next", behavior: "followUp", queuedAt: 1700000000000 },
					],
				}),
			),
		).toBe("retrying");

		expect(
			getSessionBarStatus(
				session({
					status: "compacting",
					toolCalls: {
						call1: {
							id: "call1",
							name: "read",
							args: undefined,
							status: "running",
							isError: false,
							startedAt: 1700000000000,
						},
					},
				}),
			),
		).toBe("compacting");
	});
});
