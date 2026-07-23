import { describe, expect, test } from "bun:test";

import { GitIndexMutationQueue } from "./gitIndexMutationQueue.ts";

describe("GitIndexMutationQueue", () => {
	test("runs mutations in FIFO order", async () => {
		const order: string[] = [];
		const q = new GitIndexMutationQueue("/work", async (m) => {
			order.push(m.id);
			await new Promise((r) => setTimeout(r, 5));
		});
		await Promise.all([
			q.enqueue({ id: "1", kind: "stage" }),
			q.enqueue({ id: "2", kind: "unstage" }),
			q.enqueue({ id: "3", kind: "commit" }),
		]);
		expect(order).toEqual(["1", "2", "3"]);
		expect(q.pendingCount()).toBe(0);
	});

	test("rejects a failing mutation but continues the queue", async () => {
		const order: string[] = [];
		const q = new GitIndexMutationQueue("/work", async (m) => {
			order.push(m.id);
			if (m.id === "bad") throw new Error("boom");
		});
		const bad = q.enqueue({ id: "bad", kind: "stage" });
		const good = q.enqueue({ id: "good", kind: "stage" });
		await expect(bad).rejects.toThrow("boom");
		await good;
		expect(order).toEqual(["bad", "good"]);
	});
});