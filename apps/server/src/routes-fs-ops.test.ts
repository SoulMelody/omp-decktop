import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildFsOpsRouter } from "./routes-fs-ops.ts";
import { makeTestConfig } from "./test-config.ts";

type Result<T> = T & { ok: true } | { ok: false; error: string };

describe("/fs-ops", () => {
	let root: string;
	let app: ReturnType<typeof buildFsOpsRouter>;

	beforeAll(() => {
		root = mkdtempSync(join(tmpdir(), "fs-ops-test-"));
		mkdirSync(join(root, "src"), { recursive: true });
		writeFileSync(join(root, "src", "index.ts"), "export {};\n");
		app = buildFsOpsRouter(makeTestConfig({ defaultCwd: root }));
	});

	afterAll(() => {
		rmSync(root, { recursive: true, force: true });
	});

	test("GET /fs/home returns a home string", async () => {
		const res = await app.request("/fs/home");
		expect(res.status).toBe(200);
		const body = await res.json() as { home: string };
		expect(typeof body.home).toBe("string");
	});

	test("GET /fs/stat returns metadata for an existing file", async () => {
		const res = await app.request(`/fs/stat?cwd=${encodeURIComponent(root)}&path=src/index.ts`);
		expect(res.status).toBe(200);
		const body = await res.json() as Result<{ entry: { name: string; isFile: boolean; mime: string } }>;
		expect(body.ok).toBe(true);
		if (!body.ok) throw new Error(body.error);
		expect(body.entry.name).toBe("index.ts");
		expect(body.entry.isFile).toBe(true);
		expect(body.entry.mime).toContain("typescript");
	});

	test("GET /fs/stat refuses paths that escape cwd", async () => {
		const res = await app.request(`/fs/stat?cwd=${encodeURIComponent(root)}&path=../etc/passwd`);
		expect(res.status).toBe(403);
	});

	test("POST /fs/mkdir creates nested directories", async () => {
		const res = await app.request("/fs/mkdir", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cwd: root, path: "a/b/c", recursive: true }),
		});
		expect(res.status).toBe(200);
		expect(existsSync(join(root, "a", "b", "c"))).toBe(true);
	});

	test("POST /fs/write writes a file atomically", async () => {
		const res = await app.request("/fs/write", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cwd: root, path: "new.ts", content: "export const x = 1;\n" }),
		});
		expect(res.status).toBe(200);
		const body = await res.json() as Result<{ path: string; sha256: string; size: number }>;
		expect(body.ok).toBe(true);
		if (!body.ok) throw new Error(body.error);
		expect(body.size).toBe(20);
		expect(readFileSync(join(root, "new.ts"), "utf-8")).toBe("export const x = 1;\n");
	});

	test("POST /fs/write returns 409 stale when expectedSha256 mismatches", async () => {
		// First read the current sha256 so we can test the happy-path stale check.
		const pre = await app.request(`/fs/stat?cwd=${encodeURIComponent(root)}&path=src/index.ts`);
		const preBody = await pre.json() as Result<{ name: string }>;
		expect(preBody.ok).toBe(true);
		const res = await app.request("/fs/write", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				cwd: root,
				path: "src/index.ts",
				content: "modified",
				expectedSha256: "0".repeat(64),
			}),
		});
		expect(res.status).toBe(409);
		const body = await res.json() as Result<{ stale?: { serverSha256: string } }>;
		expect(body.ok).toBe(false);
		if (body.ok) throw new Error("expected stale");
		expect(body.error).toBe("stale");
	});

	test("POST /fs/rename moves a file", async () => {
		const res = await app.request("/fs/rename", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cwd: root, from: "new.ts", to: "renamed.ts" }),
		});
		expect(res.status).toBe(200);
		expect(existsSync(join(root, "renamed.ts"))).toBe(true);
		expect(existsSync(join(root, "new.ts"))).toBe(false);
	});

	test("POST /fs/rename refuses to overwrite without the flag", async () => {
		const res = await app.request("/fs/rename", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cwd: root, from: "renamed.ts", to: "src/index.ts" }),
		});
		expect(res.status).toBe(409);
	});

	test("POST /fs/delete removes a file", async () => {
		const res = await app.request("/fs/delete", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cwd: root, path: "renamed.ts" }),
		});
		expect(res.status).toBe(200);
		expect(existsSync(join(root, "renamed.ts"))).toBe(false);
	});

	test("POST /fs/delete refuses non-empty directories without recursive", async () => {
		const res = await app.request("/fs/delete", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cwd: root, path: "src" }),
		});
		expect(res.status).toBe(400);
	});

	test("POST /fs/delete with recursive removes nested dirs", async () => {
		const res = await app.request("/fs/delete", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cwd: root, path: "a", recursive: true }),
		});
		expect(res.status).toBe(200);
		expect(existsSync(join(root, "a"))).toBe(false);
	});

	test("GET /fs/search returns matching files", async () => {
		const res = await app.request(`/fs/search?cwd=${encodeURIComponent(root)}&q=index`);
		expect(res.status).toBe(200);
		const body = await res.json() as Result<{ hits: Array<{ name: string; isFile: boolean }> }>;
		expect(body.ok).toBe(true);
		if (!body.ok) throw new Error(body.error);
		expect(body.hits.find((h) => h.name === "index.ts")).toBeDefined();
	});

	test("POST /fs/grants issues a token", async () => {
		const res = await app.request("/fs/grants", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ path: "/etc/passwd", ttlMs: 5000 }),
		});
		expect(res.status).toBe(200);
		const body = await res.json() as { token: string; expiresAt: number };
		expect(body.token.startsWith("grant_")).toBe(true);
	});

	test("POST /fs/exec refuses when enableFsExec is false", async () => {
		const res = await app.request("/fs/exec", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cwd: root, cmd: process.execPath, args: ["-e", "0"] }),
		});
		expect(res.status).toBe(403);
	});

	test("POST /fs/exec runs and polls the job when enabled", async () => {
		const execApp = buildFsOpsRouter(makeTestConfig({ defaultCwd: root, enableFsExec: true }));
		const startRes = await execApp.request("/fs/exec", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				cwd: root, cmd: process.execPath,
				args: ["-e", "console.log('hi'); process.exit(0)"],
				timeoutMs: 5_000,
			}),
		});
		expect(startRes.status).toBe(200);
		const { jobId } = await startRes.json() as { jobId: string };
		// Poll until terminal.
		for (let i = 0; i < 100; i++) {
			const poll = await execApp.request(`/fs/exec/${jobId}`);
			const body = await poll.json() as { status: string; stdout: string; exitCode: number | null };
			if (body.status === "done" || body.status === "failed") {
				expect(body.status).toBe("done");
				expect(body.stdout).toContain("hi");
				expect(body.exitCode).toBe(0);
				return;
			}
			await new Promise((r) => setTimeout(r, 30));
		}
		throw new Error("job did not finish within 3s");
	});

	test("POST /fs/clone refuses file:// URLs", async () => {
		const res = await app.request("/fs/clone", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				cwd: root,
				remoteUrl: "file:///etc/passwd",
				destinationPath: "evil",
			}),
		});
		expect(res.status).toBe(400);
	});

	test("validation rejects missing required fields", async () => {
		const res = await app.request("/fs/mkdir", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cwd: root }),
		});
		expect(res.status).toBe(400);
	});
});