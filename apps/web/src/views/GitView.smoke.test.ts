/**
 * Smoke test for GitView's backend workflow: status → stage → commit → log.
 * Uses a deterministic fake fetch state machine so we verify that the web
 * client sends the right requests without needing a browser DOM.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { api } from "@/lib/api";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("GitView smoke workflow", () => {
	test("status → stage → commit → log", async () => {
		const calls: Array<{ url: string; method: string; body?: unknown }> = [];
		let state: "dirty" | "staged" | "committed" = "dirty";

		globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
			const u = String(url);
			const method = init?.method ?? "GET";
			const body = init?.body ? JSON.parse(init.body as string) : undefined;
			calls.push({ url: u, method, body });

			if (u.includes("/git/status")) {
				if (state === "dirty") {
					return json({ ok: true, cwd: "/work", branch: "main", files: [{ path: "a.ts", index: " ", workingDir: "M" }], isClean: false });
				}
				if (state === "staged") {
					return json({ ok: true, cwd: "/work", branch: "main", files: [{ path: "a.ts", index: "M", workingDir: " " }], isClean: false });
				}
				return json({ ok: true, cwd: "/work", branch: "main", files: [], isClean: true });
			}
			if (u.endsWith("/git/stage")) { state = "staged"; return json({ ok: true }); }
			if (u.endsWith("/git/commit")) { state = "committed"; return json({ ok: true, sha: "abc1234", pushed: false }); }
			if (u.includes("/git/log")) {
				return json({ ok: true, commits: [{ sha: "abc1234", shortSha: "abc1234", author: "u", email: "u@e", date: "2026-01-01", subject: "add a", body: "", insertions: 1, deletions: 0, files: 1 }] });
			}
			return json({ ok: true });
		}) as typeof fetch;

		const before = await api.gitStatus("/work");
		expect(before.files[0]?.workingDir).toBe("M");

		await api.gitStage("/work", ["a.ts"]);
		const staged = await api.gitStatus("/work");
		expect(staged.files[0]?.index).toBe("M");

		const committed = await api.gitCommit("/work", "add a.ts");
		expect(committed.sha).toBe("abc1234");

		const after = await api.gitStatus("/work");
		expect(after.isClean).toBe(true);

		const log = await api.gitLog("/work", { maxCount: 10 });
		expect(log.commits[0]?.subject).toBe("add a");

		const stageCall = calls.find((c) => c.url.endsWith("/git/stage"));
		expect(stageCall?.method).toBe("POST");
		expect(stageCall?.body).toMatchObject({ cwd: "/work", paths: ["a.ts"] });
		const commitCall = calls.find((c) => c.url.endsWith("/git/commit"));
		expect(commitCall?.body).toMatchObject({ cwd: "/work", message: "add a.ts" });
	});
});