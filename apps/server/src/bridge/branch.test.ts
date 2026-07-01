import { describe, expect, it } from "bun:test";
import type { AgentSessionEventJson } from "@omp-deck/protocol";

import { InProcessSessionHandle } from "./session-handle.ts";

function makeHandle(stub: Record<string, unknown>) {
	const events: AgentSessionEventJson[] = [];
	const handle = new InProcessSessionHandle({
		session: stub as never,
		sessionManager: {} as never,
		cwd: "/tmp/x",
		sessionId: "s1",
		getModelRegistry: async () => ({}) as never,
		planBridge: { getPlanModeContext: () => undefined, getPendingPlanApproval: () => undefined } as never,
		onDispose: () => {},
	});
	handle.subscribe((e) => events.push(e));
	return { handle, events };
}

const baseSession = () => ({
	messages: [],
	isStreaming: false,
	getContextUsage: () => undefined,
	getTodoPhases: () => [],
});

describe("InProcessSessionHandle branching", () => {
	it("fork() calls sdk.fork and emits session_replaced", async () => {
		let forked = false;
		const { handle, events } = makeHandle({
			...baseSession(),
			fork: async () => {
				forked = true;
				return true;
			},
		});
		await handle.fork();
		expect(forked).toBe(true);
		expect(events.some((e) => e.type === "session_replaced")).toBe(true);
	});

	it("branch() returns selectedText and emits session_replaced", async () => {
		const { handle, events } = makeHandle({
			...baseSession(),
			branch: async (id: string) => ({ selectedText: `text-for-${id}`, cancelled: false }),
		});
		const res = await handle.branch("e7");
		expect(res.selectedText).toBe("text-for-e7");
		expect(events.some((e) => e.type === "session_replaced")).toBe(true);
	});

	it("branch() that a hook cancels does NOT emit session_replaced", async () => {
		const { handle, events } = makeHandle({
			...baseSession(),
			branch: async () => ({ selectedText: "", cancelled: true }),
		});
		await handle.branch("e7");
		expect(events.some((e) => e.type === "session_replaced")).toBe(false);
	});

	it("rewind() returns editorText and emits session_replaced", async () => {
		const { handle, events } = makeHandle({
			...baseSession(),
			navigateTree: async () => ({ editorText: "rewound", cancelled: false }),
		});
		const res = await handle.rewind("e3");
		expect(res.editorText).toBe("rewound");
		expect(events.some((e) => e.type === "session_replaced")).toBe(true);
	});

	it("getBranchPoints() passes through getUserMessagesForBranching", () => {
		const { handle } = makeHandle({
			...baseSession(),
			getUserMessagesForBranching: () => [{ entryId: "e1", text: "hello" }],
		});
		expect(handle.getBranchPoints()).toEqual([{ entryId: "e1", text: "hello" }]);
	});
});
