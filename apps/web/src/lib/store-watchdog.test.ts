/**
 * Streaming-watchdog contract.
 *
 * The deck's status bar reads `session.status === "streaming"` to render the
 * spinner. If the watchdog flips that back to "idle" mid-stream (zombie / slow
 * model / paused network), the indicator falsely reports "ready" while the
 * user is still waiting for output.
 *
 * The watchdog exists for ONE purpose: to disarm the false "streaming" claim
 * when the client reconnects and the server snapshot says isStreaming=true but
 * the upstream stream is actually dead. In that case no events arrive, so the
 * 15s timer flips the status to idle.
 *
 * For everything else — a normal turn_start → many message_updates → turn_end
 * cycle — the SDK's own turn_end is the authoritative source of truth. The
 * watchdog MUST NOT re-arm on each event during streaming; doing so would
 * cancel the previous timer, but the new timer would still elapse after 15s
 * of slow thinking / rate-limit backoff / network stall and flip status to
 * idle while the SDK is still mid-turn.
 */
import { describe, expect, test } from "bun:test";

import { initSession } from "./reducer";
import { __test__, useStore } from "./store";
import type { StoreState } from "./store";
import type { AgentSessionEventJson, SessionUi } from "./types";

function withStreamingSession(): void {
	useStore.setState((s: StoreState) => {
		// Clear any leftover watchdogs from previous tests so failures are
		// localized to the test that armed them.
		__test__.clearStreamingWatchdog("s1");
		const session: SessionUi = initSession({
			sessionId: "s1",
			cwd: "/tmp/x",
			isStreaming: true,
			messages: [],
			todoPhases: [],
		});
		return {
			...s,
			sessionsById: { s1: session },
			activeId: "s1",
		};
	});
}

function dispatch(
	events: Array<{ sessionId: string; event: AgentSessionEventJson }>,
): void {
	__test__.enqueueAndFlush(events, useStore.setState, useStore.getState);
}

describe("streaming watchdog", () => {
	test("does NOT re-arm on each event during a normal streaming turn", () => {
		// Regression: status flipped to "idle" mid-stream because _flushBatch
		// re-armed the watchdog on every message_update, then the new timer
		// fired after 15s of slow thinking / network stall.
		withStreamingSession();

		expect(__test__.hasStreamingWatchdog("s1")).toBe(false);

		dispatch([{ sessionId: "s1", event: { type: "message_update", messageIndex: 0, delta: "hi" } }]);

		// Status must remain "streaming" — no watchdog re-arm.
		expect(useStore.getState().sessionsById["s1"]?.status).toBe("streaming");
		expect(__test__.hasStreamingWatchdog("s1")).toBe(false);
	});

	test("clears the watchdog on the first event after reconnect", () => {
		// Simulate a reconnect: subscribed handler armed the watchdog because
		// the server snapshot said isStreaming=true. The first live event
		// proves the stream is healthy and disarms the timer.
		withStreamingSession();
		__test__.armStreamingWatchdog("s1", useStore.setState, useStore.getState);
		expect(__test__.hasStreamingWatchdog("s1")).toBe(true);

		dispatch([{ sessionId: "s1", event: { type: "message_update", messageIndex: 0, delta: "x" } }]);

		expect(__test__.hasStreamingWatchdog("s1")).toBe(false);
		expect(useStore.getState().sessionsById["s1"]?.status).toBe("streaming");
	});

	test("clears the watchdog when status transitions away from streaming", () => {
		// A live stream completes (turn_end). The watchdog must be cleared
		// even if it was armed (e.g., the turn started via reconnect).
		withStreamingSession();
		__test__.armStreamingWatchdog("s1", useStore.setState, useStore.getState);
		expect(__test__.hasStreamingWatchdog("s1")).toBe(true);

		dispatch([{ sessionId: "s1", event: { type: "turn_end", turn: 1 } }]);

		expect(__test__.hasStreamingWatchdog("s1")).toBe(false);
		expect(useStore.getState().sessionsById["s1"]?.status).toBe("idle");
	});

	test("ignores events for unknown sessions without throwing", () => {
		// Defensive: a session_event that arrives for an unknown session
		// (race between unsubscribe and an in-flight flush) must not crash
		// the reducer path.
		withStreamingSession();

		expect(() => {
			dispatch([
				{ sessionId: "ghost", event: { type: "message_update", messageIndex: 0, delta: "x" } },
			]);
		}).not.toThrow();
	});

	test("clearStreamingWatchdog is a no-op when no watchdog is armed", () => {
		// Regression: clearing an absent entry must not throw or surface
		// elsewhere as an error.
		withStreamingSession();
		expect(__test__.hasStreamingWatchdog("s1")).toBe(false);
		expect(() => __test__.clearStreamingWatchdog("s1")).not.toThrow();
		expect(__test__.streamingWatchdogCount()).toBe(0);
	});
});