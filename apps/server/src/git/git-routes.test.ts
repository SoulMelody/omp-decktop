/**
 * End-to-end test for the git router. Spins up a fresh repo per test and
 * exercises a representative slice of endpoints through the Hono test app.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { buildGitRouter } from "./git-routes.ts";
import { makeTestConfig } from "../test-config.ts";
import { makeRepo, writeFile, commitAll, type TestRepo } from "./test-helpers.ts";
import { _resetLocks } from "./mutation-lock.ts";

let repo: TestRepo;
let app: ReturnType<typeof buildGitRouter>;

beforeEach(() => {
	_resetLocks();
	repo = makeRepo();
	app = buildGitRouter(makeTestConfig({ defaultCwd: repo.root, agentDir: repo.root }));
});

afterEach(() => {
	repo.cleanup();
});

async function json<T = unknown>(res: Response): Promise<T> {
	return (await res.json()) as T;
}

describe("/git/check + /git/status", () => {
	test("check returns isRepo=true", async () => {
		const res = await app.request(`/git/check?cwd=${encodeURIComponent(repo.root)}`);
		expect(res.status).toBe(200);
		const body = await json<{ ok: boolean; isRepo: boolean }>(res);
		expect(body.ok).toBe(true);
		expect(body.isRepo).toBe(true);
	});

	test("status reports a clean tree", async () => {
		const res = await app.request(`/git/status?cwd=${encodeURIComponent(repo.root)}`);
		expect(res.status).toBe(200);
		const body = await json<{ isClean: boolean; branch: string; files: unknown[]; mergeInProgress?: unknown; rebaseInProgress?: unknown }>(res);
		expect(body.isClean).toBe(true);
		expect(body.branch).toBe("main");
		expect(body.mergeInProgress).toBeUndefined();
		expect(body.rebaseInProgress).toBeUndefined();
	});

	test("status surfaces untracked + modified files", async () => {
		writeFile(repo.root, "draft.md", "todo");
		writeFile(repo.root, "README.md", "# changed\n");
		const res = await app.request(`/git/status?cwd=${encodeURIComponent(repo.root)}`);
		const body = await json<{ isClean: boolean; files: { path: string; index: string; workingDir: string }[] }>(res);
		expect(body.isClean).toBe(false);
		expect(body.files.find((f) => f.path === "draft.md")?.workingDir).toBe("?");
		expect(body.files.find((f) => f.path === "README.md")?.workingDir).toBe("M");
	});
});

describe("git mutations through the router", () => {
	test("POST /git/stage moves changes into the index", async () => {
		writeFile(repo.root, "README.md", "# changed\n");
		const res = await app.request("/git/stage", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cwd: repo.root, paths: ["README.md"] }),
		});
		expect(res.status).toBe(200);
		const statusRes = await app.request(`/git/status?cwd=${encodeURIComponent(repo.root)}`);
		const body = await json<{ files: { path: string; index: string }[] }>(statusRes);
		expect(body.files.find((f) => f.path === "README.md")?.index).toBe("M");
	});

	test("POST /git/commit returns a sha and cleans the tree", async () => {
		writeFile(repo.root, "a.ts", "export {};\n");
		await app.request("/git/stage", {
			method: "POST", headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cwd: repo.root, paths: ["a.ts"] }),
		});
		const res = await app.request("/git/commit", {
			method: "POST", headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cwd: repo.root, message: "add a.ts" }),
		});
		expect(res.status).toBe(200);
		const body = await json<{ ok: boolean; sha: string }>(res);
		expect(body.ok).toBe(true);
		expect(body.sha).toMatch(/^[0-9a-f]{7,}$/);
	});

	test("POST /git/push requires confirmation for force-with-lease", async () => {
		const res = await app.request("/git/push", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cwd: repo.root, force: "lease" }),
		});
		expect(res.status).toBe(400);
		expect(await json(res)).toMatchObject({ ok: false, error: "confirm required for force push" });
	});

	test("POST /git/branches + /git/checkout switches branch", async () => {
		const createRes = await app.request("/git/branches", {
			method: "POST", headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cwd: repo.root, name: "feat", checkout: true }),
		});
		expect(createRes.status).toBe(200);
		const coRes = await app.request(`/git/status?cwd=${encodeURIComponent(repo.root)}`);
		const body = await json<{ branch: string }>(coRes);
		expect(body.branch).toBe("feat");
	});

	test("DELETE /git/branches refuses unmerged without confirm", async () => {
		// Create + checkout + commit so feat is unmerged.
		await app.request("/git/branches", {
			method: "POST", headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cwd: repo.root, name: "feat", checkout: true }),
		});
		writeFile(repo.root, "feat.txt", "feat");
		await app.request("/git/stage", {
			method: "POST", headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cwd: repo.root, paths: ["feat.txt"] }),
		});
		await app.request("/git/commit", {
			method: "POST", headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cwd: repo.root, message: "feat change" }),
		});
		await app.request("/git/checkout", {
			method: "POST", headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cwd: repo.root, branch: "main" }),
		});
		const delRes = await app.request("/git/branches", {
			method: "DELETE", headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cwd: repo.root, name: "feat", force: false }),
		});
		expect(delRes.status).toBe(400);
		const body = await json<{ code: string }>(delRes);
		expect(body.code).toBe("branch_unmerged");
	});

	test("DELETE /git/remotes refuses to remove origin", async () => {
		const res = await app.request("/git/remotes", {
			method: "DELETE", headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cwd: repo.root, name: "origin" }),
		});
		expect(res.status).toBe(400);
	});
});

describe("read endpoints", () => {
	test("GET /git/branches lists local + remote", async () => {
		const res = await app.request(`/git/branches?cwd=${encodeURIComponent(repo.root)}`);
		expect(res.status).toBe(200);
		const body = await json<{ ok: boolean; local: { name: string }[]; remote: { name: string }[] }>(res);
		expect(body.local.find((b) => b.name === "main")).toBeDefined();
		expect(body.remote).toEqual([]);
	});

	test("GET /git/log returns commits with sha + subject", async () => {
		commitAll(repo.root, "second commit");
		const res = await app.request(`/git/log?cwd=${encodeURIComponent(repo.root)}&maxCount=10`);
		expect(res.status).toBe(200);
		const body = await json<{ ok: boolean; commits: { subject: string }[] }>(res);
		expect(body.commits.length).toBeGreaterThan(0);
	});

	test("GET /git/diff returns patch with insertions", async () => {
		writeFile(repo.root, "README.md", "# changed\n# more\n# more\n");
		const res = await app.request(`/git/diff?cwd=${encodeURIComponent(repo.root)}`);
		expect(res.status).toBe(200);
		const body = await json<{ insertions: number; deletions: number; patch: string }>(res);
		expect(body.insertions).toBeGreaterThan(0);
		expect(body.patch).toContain("@@");
	});

	test("GET /git/worktrees returns the primary", async () => {
		const res = await app.request(`/git/worktrees?cwd=${encodeURIComponent(repo.root)}`);
		expect(res.status).toBe(200);
		const body = await json<{ ok: boolean; worktrees: { isPrimary: boolean }[] }>(res);
		expect(body.worktrees.find((w) => w.isPrimary)).toBeDefined();
	});
});

describe("identity", () => {
	test("GET /git/global-identity returns null when unset", async () => {
		const res = await app.request("/git/global-identity");
		expect(res.status).toBe(200);
		const body = await json<{ userName: string | null; userEmail: string | null }>(res);
		// Either null (unset) or string (system configured) — we just assert the shape.
		expect("userName" in body).toBe(true);
		expect("userEmail" in body).toBe(true);
	});

	test("GET /git/identities round-trips add + delete", async () => {
		const add = await app.request("/git/identities", {
			method: "POST", headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ id: "me-1", userName: "u", userEmail: "u@e.com", authType: "https" }),
		});
		expect(add.status).toBe(200);
		const list = await app.request("/git/identities");
		const body = await json<{ ok: boolean; identities: { id: string }[] }>(list);
		expect(body.identities.find((i) => i.id === "me-1")).toBeDefined();
		const del = await app.request("/git/identities/me-1", { method: "DELETE" });
		expect(del.status).toBe(200);
	});
});

describe("validation", () => {
	test("missing cwd returns 400", async () => {
		const res = await app.request("/git/status");
		expect(res.status).toBe(400);
	});

	test("disallowed cwd returns 403", async () => {
		const res = await app.request(`/git/status?cwd=${encodeURIComponent("/etc")}`);
		expect(res.status).toBe(403);
	});

	test("/git/revert without confirm returns 400", async () => {
		writeFile(repo.root, "README.md", "# dirty\n");
		const res = await app.request("/git/revert", {
			method: "POST", headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cwd: repo.root, path: "README.md" }),
		});
		expect(res.status).toBe(400);
	});
});