import { describe, expect, test } from "bun:test";
import { TASK_SUBAGENT_LIFECYCLE_CHANNEL, TASK_SUBAGENT_PROGRESS_CHANNEL } from "@oh-my-pi/pi-coding-agent/task";

import { InProcessAgentBridge } from "./agent-bridge";

describe("InProcessAgentBridge.listModels", () => {
	test("waits for online registry refresh when ensureOnlineRefresh is requested", async () => {
		const calls: string[] = [];
		const registry = {
			async refresh(strategy?: string) {
				calls.push(`refresh:${strategy ?? "default"}`);
			},
			getAll() {
				calls.push("getAll");
				return [];
			},
		};
		const bridge = new InProcessAgentBridge({ idleTimeoutMs: 0 }) as unknown as {
			ensureModelRegistry: () => Promise<typeof registry>;
			listModels: (opts?: { sessionId?: string; ensureOnlineRefresh?: boolean }) => Promise<unknown[]>;
		};
		bridge.ensureModelRegistry = async () => registry;

		await bridge.listModels({ ensureOnlineRefresh: true });

		expect(calls).toEqual(["refresh:online", "getAll"]);
	});

	test("does not force online registry refresh by default", async () => {
		const calls: string[] = [];
		const registry = {
			async refresh(strategy?: string) {
				calls.push(`refresh:${strategy ?? "default"}`);
			},
			getAll() {
				calls.push("getAll");
				return [];
			},
		};
		const bridge = new InProcessAgentBridge({ idleTimeoutMs: 0 }) as unknown as {
			ensureModelRegistry: () => Promise<typeof registry>;
			listModels: (opts?: { sessionId?: string; ensureOnlineRefresh?: boolean }) => Promise<unknown[]>;
		};
		bridge.ensureModelRegistry = async () => registry;

		await bridge.listModels();

		expect(calls).toEqual(["getAll"]);
	});
});

describe("InProcessAgentBridge subagent event bridge", () => {
	test("forwards SDK subagent lifecycle and progress eventBus events", () => {
		const handlers = new Map<string, Array<(payload: unknown) => void>>();
		const eventBus = {
			on(channel: string, handler: (payload: unknown) => void) {
				const channelHandlers = handlers.get(channel) ?? [];
				channelHandlers.push(handler);
				handlers.set(channel, channelHandlers);
				return () => {
					const nextHandlers = handlers.get(channel)?.filter((candidate) => candidate !== handler) ?? [];
					handlers.set(channel, nextHandlers);
				};
			},
		};
		const session = {
			sessionId: "s_test",
			eventBus,
			subscribe() {
				return () => {};
			},
			getContextUsage() {
				return undefined;
			},
		};
		const sessionManager = {
			getArtifactsDir() {
				return null;
			},
			getSessionId() {
				return "s_test";
			},
		};
		const bridge = new InProcessAgentBridge({ idleTimeoutMs: 0 }) as unknown as {
			attach: (
				session: Record<string, unknown>, 
				cwd: string,
				sessionManager: Record<string, unknown>,
				setToolUIContext: () => void,
			) => { subscribe: (listener: (event: unknown) => void) => () => void };
		};
		const emitted: unknown[] = [];
		const lifecyclePayload = { sessionId: "s_test", phase: "started" };
		const progressPayload = { sessionId: "s_test", message: "working" };

		const handle = bridge.attach(session as Record<string, unknown>, process.cwd(), sessionManager as Record<string, unknown>, () => {});
		handle.subscribe((event) => emitted.push(event));
		handlers.get(TASK_SUBAGENT_LIFECYCLE_CHANNEL)?.forEach((handler) => handler(lifecyclePayload));
		handlers.get(TASK_SUBAGENT_PROGRESS_CHANNEL)?.forEach((handler) => handler(progressPayload));

		expect(emitted).toEqual([
			{ type: "subagent_lifecycle", payload: lifecyclePayload },
			{ type: "subagent_progress", payload: progressPayload },
		]);
	});
});
