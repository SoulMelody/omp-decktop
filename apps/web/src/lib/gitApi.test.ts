import { afterEach, describe, expect, test } from "bun:test";

import { gitApi } from "./gitApi.ts";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("gitApi wrappers", () => {
	test("check returns null on network failure", async () => {
		globalThis.fetch = (async () => { throw new Error("offline"); }) as typeof fetch;
		expect(await gitApi.check("/work")).toBeNull();
	});

	test("status returns parsed response", async () => {
		globalThis.fetch = (async () => json({ ok: true, cwd: "/work", branch: "main", files: [], isClean: true })) as typeof fetch;
		const r = await gitApi.status("/work");
		expect(r?.branch).toBe("main");
	});

	test("stage maps success to kind=ok", async () => {
		globalThis.fetch = (async () => json({ ok: true })) as typeof fetch;
		const r = await gitApi.stage("/work", ["a.ts"]);
		expect(r.kind).toBe("ok");
	});

	test("stage maps HTTP error to kind=error with server code", async () => {
		globalThis.fetch = (async () => json({ ok: false, error: "bad", code: "git_failed" }, 500)) as typeof fetch;
		const r = await gitApi.stage("/work", ["a.ts"]);
		expect(r.kind).toBe("error");
		if (r.kind !== "error") throw new Error("expected error");
		expect(r.code).toBe("git_failed");
	});

	test("commit forwards pushAfter flag", async () => {
		let body: unknown = null;
		globalThis.fetch = (async (_url, init) => {
			body = JSON.parse(init!.body as string);
			return json({ ok: true, sha: "abc1234", pushed: true });
		}) as typeof fetch;
		const r = await gitApi.commit("/work", "msg", { pushAfter: true });
		expect(r.kind).toBe("ok");
		expect(body).toMatchObject({ cwd: "/work", message: "msg", pushAfter: true });
	});

	test("push maps non-fast-forward HTTP failure to kind=rejected", async () => {
		globalThis.fetch = (async () => json({ ok: false, error: "non-fast-forward; fetch first", code: "git_failed" }, 500)) as typeof fetch;
		const r = await gitApi.push("/work");
		expect(r.kind).toBe("rejected");
	});

	test("push maps an ok response with rejected=true to kind=rejected", async () => {
		globalThis.fetch = (async () => json({ ok: true, rejected: true, reason: "fetch first" })) as typeof fetch;
		const r = await gitApi.push("/work");
		expect(r).toEqual({ kind: "rejected", message: "fetch first" });
	});

	test("force-with-lease push forwards explicit confirmation", async () => {
		let body: unknown = null;
		globalThis.fetch = (async (_url, init) => {
			body = JSON.parse(init!.body as string);
			return json({ ok: true, setUpstream: false });
		}) as typeof fetch;
		const r = await gitApi.push("/work", { force: "lease", confirm: true });
		expect(r.kind).toBe("ok");
		expect(body).toMatchObject({ cwd: "/work", force: "lease", confirm: true });
	});

	test("branches returns null on failure", async () => {
		globalThis.fetch = (async () => { throw new Error("offline"); }) as typeof fetch;
		expect(await gitApi.branches("/work")).toBeNull();
	});

	test("log returns null on failure", async () => {
		globalThis.fetch = (async () => { throw new Error("offline"); }) as typeof fetch;
		expect(await gitApi.log("/work")).toBeNull();
	});

	test("stashes returns [] on failure", async () => {
		globalThis.fetch = (async () => { throw new Error("offline"); }) as typeof fetch;
		expect(await gitApi.stashes("/work")).toEqual([]);
	});

	test("worktrees returns [] on failure", async () => {
		globalThis.fetch = (async () => { throw new Error("offline"); }) as typeof fetch;
		expect(await gitApi.worktrees("/work")).toEqual([]);
	});
});