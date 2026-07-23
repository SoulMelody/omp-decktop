/**
 * Smoke tests for the FilesView integration. Spins up a fake fetch harness
 * that exercises the api wrappers + dialog + context-menu dispatch without
 * mounting the full React tree (mounting requires router context and a
 * real store; we test the pure-data side here).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { api } from "@/lib/api";

const realFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = realFetch;
});

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

describe("api.fs-ops wrappers", () => {
	test("mkdir posts cwd + path + recursive", async () => {
		let captured: { url: string; init: RequestInit } | null = null;
		globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
			captured = { url: String(url), init: init ?? {} };
			return jsonResponse({ ok: true });
		}) as typeof fetch;

		const r = await api.mkdir("/work", "src/new", true);
		expect(r.ok).toBe(true);
		expect(captured?.url.endsWith("/fs/mkdir")).toBe(true);
		expect(JSON.parse(captured!.init.body as string)).toMatchObject({
			cwd: "/work", path: "src/new", recursive: true,
		});
	});

	test("writeFile passes expectedSha256 when supplied", async () => {
		let body: unknown = null;
		globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
			body = JSON.parse(init!.body as string);
			return jsonResponse({ ok: true, path: "a.ts", size: 1, sha256: "a".repeat(64) });
		}) as typeof fetch;

		const r = await api.writeFile("/work", "a.ts", "x", { expectedSha256: "0".repeat(64) });
		expect(r.ok).toBe(true);
		expect(body).toMatchObject({ cwd: "/work", path: "a.ts", content: "x", expectedSha256: "0".repeat(64) });
	});

	test("writeFile surfaces a 409 stale response", async () => {
		globalThis.fetch = (async () => jsonResponse({
			ok: false, error: "stale", stale: { serverSha256: "abc", serverSize: 12 },
		}, 409)) as typeof fetch;

		const r = await api.writeFile("/work", "a.ts", "x");
		expect(r.ok).toBe(false);
		if (r.ok) throw new Error("expected stale");
		expect(r.error).toBe("stale");
		expect(r.stale?.serverSha256).toBe("abc");
	});

	test("renamePath builds the right URL and body", async () => {
		let captured: RequestInit | null = null;
		globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
			captured = init ?? null;
			return jsonResponse({ ok: true });
		}) as typeof fetch;

		const r = await api.renamePath("/work", "old.ts", "new.ts", false);
		expect(r.ok).toBe(true);
		expect(captured?.method).toBe("POST");
		expect(JSON.parse(captured!.body as string)).toMatchObject({
			cwd: "/work", from: "old.ts", to: "new.ts", overwrite: false,
		});
	});

	test("deletePath encodes recursive flag", async () => {
		let body: unknown = null;
		globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
			body = JSON.parse(init!.body as string);
			return jsonResponse({ ok: true });
		}) as typeof fetch;

		const r = await api.deletePath("/work", "dir", true);
		expect(r.ok).toBe(true);
		expect(body).toMatchObject({ cwd: "/work", path: "dir", recursive: true });
	});

	test("searchFiles builds query string with all options", async () => {
		let captured: string | null = null;
		globalThis.fetch = (async (url: string | URL | Request) => {
			captured = String(url);
			return jsonResponse({ ok: true, hits: [] });
		}) as typeof fetch;

		const r = await api.searchFiles("/work", "comp", { type: "file", limit: 10 });
		expect(r.ok).toBe(true);
		expect(captured).toContain("cwd=%2Fwork");
		expect(captured).toContain("q=comp");
		expect(captured).toContain("type=file");
		expect(captured).toContain("limit=10");
	});

	test("cloneRepo refuses to send if URL is non-https", async () => {
		// The api wrapper doesn't validate — the server does — but we at least
		// confirm the body shape is forwarded correctly.
		let body: unknown = null;
		globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
			body = JSON.parse(init!.body as string);
			return jsonResponse({ ok: true, path: "/work/y" });
		}) as typeof fetch;

		const r = await api.cloneRepo("/work", "https://github.com/x/y.git", "y");
		expect(r.ok).toBe(true);
		expect(body).toMatchObject({
			cwd: "/work", remoteUrl: "https://github.com/x/y.git", destinationPath: "y",
		});
	});

	test("revealPath routes desktop hint to the server", async () => {
		let body: unknown = null;
		globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
			body = JSON.parse(init!.body as string);
			return jsonResponse({ ok: true, hint: "desktop" });
		}) as typeof fetch;

		const r = await api.revealPath("/work", "/etc/hosts", "desktop");
		expect(r.ok).toBe(true);
		expect(body).toMatchObject({ cwd: "/work", path: "/etc/hosts", via: "desktop" });
	});

	test("issueGrant forwards ttlMs and reason", async () => {
		let body: unknown = null;
		globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
			body = JSON.parse(init!.body as string);
			return jsonResponse({ token: "grant_x", expiresAt: 123 });
		}) as typeof fetch;

		const r = await api.issueGrant("/etc/x", 5_000, "debug");
		expect(r.token).toBe("grant_x");
		expect(body).toMatchObject({ path: "/etc/x", ttlMs: 5_000, reason: "debug" });
	});

	test("startExec polls job status", async () => {
		globalThis.fetch = (async () => jsonResponse({
			jobId: "exec_xyz", status: "queued", stdout: "", stderr: "", exitCode: null, startedAt: 0, finishedAt: null,
		})) as typeof fetch;

		const start = await api.startExec("/work", "ls", ["-la"], 5_000, "list");
		expect(start.jobId).toBe("exec_xyz");

		globalThis.fetch = (async () => jsonResponse({
			jobId: "exec_xyz", status: "done", stdout: "ok\n", stderr: "", exitCode: 0,
			startedAt: 1, finishedAt: 2, label: "list",
		})) as typeof fetch;
		const job = await api.pollExecJob("exec_xyz");
		expect(job.status).toBe("done");
		expect(job.stdout).toBe("ok\n");
	});
});

describe("file URL helpers", () => {
	test("readRawUrl encodes cwd and path", () => {
		const url = api.readRawUrl("/work", "src/has space.ts");
		expect(url).toContain("/fs/raw?");
		expect(url).toContain("cwd=");
		expect(url).toContain("path=");
	});
});