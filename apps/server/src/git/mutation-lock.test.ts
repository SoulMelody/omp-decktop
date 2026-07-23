import { afterEach, describe, expect, test } from "bun:test";

import { withGitLock, _trackedCwdCount, _resetLocks, detectStaleLock } from "./mutation-lock.ts";

afterEach(() => {
	_resetLocks();
});

describe("withGitLock", () => {
	test("runs the function and returns its value", async () => {
		const r = await withGitLock("/a", async () => 42);
		expect(r).toBe(42);
	});

	test("serializes concurrent calls on the same cwd", async () => {
		const order: string[] = [];
		let releaseFirst: (() => void) | null = null;
		const firstStarted = new Promise<void>((r) => { releaseFirst = r; });
		const first = withGitLock("/a", async () => {
			order.push("first-start");
			await firstStarted;
			order.push("first-end");
			return "first";
		});
		// Yield so the first task gets queued and starts.
		await Promise.resolve();
		const second = withGitLock("/a", async () => {
			order.push("second");
			return "second";
		});
		// Release the first task; the second should then run.
		releaseFirst!();
		const [a, b] = await Promise.all([first, second]);
		expect(a).toBe("first");
		expect(b).toBe("second");
		expect(order).toEqual(["first-start", "first-end", "second"]);
	});

	test("runs parallel calls on different cwds in parallel", async () => {
		const t0 = Date.now();
		await Promise.all([
			withGitLock("/a", () => new Promise((r) => setTimeout(r, 50))),
			withGitLock("/b", () => new Promise((r) => setTimeout(r, 50))),
		]);
		const elapsed = Date.now() - t0;
		// Parallel execution should take ~50ms total, sequential would be ~100ms.
		expect(elapsed).toBeLessThan(95);
	});

	test("continues after a throwing task (no poison)", async () => {
		await expect(
			withGitLock("/a", async () => { throw new Error("boom"); }),
		).rejects.toThrow("boom");
		const r = await withGitLock("/a", async () => "ok");
		expect(r).toBe("ok");
	});
});

describe("detectStaleLock", () => {
	test("returns stale=false when no lock is present", async () => {
		const r = await detectStaleLock(() => null, 100, 20);
		expect(r.stale).toBe(false);
	});

	test("returns stale=true when the lock is byte-identical for the entire window", async () => {
		const same = { size: 12, mtimeMs: 1000 };
		const r = await detectStaleLock(() => same, 100, 20);
		expect(r.stale).toBe(true);
		expect(r.final).toEqual(same);
	});

	test("returns stale=false when the lock disappears mid-window", async () => {
		let calls = 0;
		const r = await detectStaleLock(() => {
			calls++;
			if (calls <= 1) return { size: 12, mtimeMs: 1000 };
			return null;
		}, 100, 20);
		expect(r.stale).toBe(false);
	});

	test("returns stale=false when the lock changes mid-window (real process)", async () => {
		let calls = 0;
		const r = await detectStaleLock(() => {
			calls++;
			return { size: 12 + calls, mtimeMs: 1000 + calls };
		}, 100, 20);
		expect(r.stale).toBe(false);
	});
});

describe("tracked queue accounting", () => {
	test("first call creates a queue, subsequent calls reuse it", async () => {
		expect(_trackedCwdCount()).toBe(0);
		await withGitLock("/x", async () => {});
		await withGitLock("/x", async () => {});
		// Both calls land on the same queue, so still one tracked cwd.
		expect(_trackedCwdCount()).toBe(1);
		await withGitLock("/y", async () => {});
		expect(_trackedCwdCount()).toBe(2);
	});
});