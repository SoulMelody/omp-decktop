import { describe, expect, test } from "bun:test";

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
