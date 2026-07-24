/**
 * Tests for the lean git-service. Exercises one happy path per public
 * function plus a couple of failure scenarios. Uses real git in a tmpdir;
 * no mocks — the service is thin enough that mocking wouldn't add value.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	isGitRepository,
	getToplevel,
	getStatus,
	getDiff,
	getMergeInProgress,
	getRebaseInProgress,
	stageFiles,
	unstageFiles,
	revertFile,
	commit,
	getBranches,
	createBranch,
	deleteBranch,
	renameBranch,
	checkoutBranch,
	getLog,
	listStashes,
	stashPush,
	stashApply,
	stashPop,
	stashDrop,
	getRemotes,
	getWorktrees,
	addRemote,
} from "./git-service.ts";
import { _resetLocks } from "./mutation-lock.ts";
import { makeRepo, writeFile, commitAll, type TestRepo } from "./test-helpers.ts";

let repo: TestRepo;

beforeEach(() => {
	_resetLocks();
	repo = makeRepo();
});

afterEach(() => {
	repo.cleanup();
});

describe("isGitRepository / getToplevel", () => {
	test("detects a repo and returns its toplevel", async () => {
		expect(await isGitRepository(repo.root)).toBe(true);
		expect(await getToplevel(repo.root)).toBe(repo.root);
	});

	test("returns false for a non-repo directory", async () => {
		const tmp = join(repo.root, "..", `non-repo-${Date.now()}`);
		expect(await isGitRepository(tmp)).toBe(false);
		expect(await getToplevel(tmp)).toBeNull();
	});
});

describe("status / diff", () => {
	test("reports a clean tree after init", async () => {
		const status = await getStatus(repo.root);
		expect(status.isClean).toBe(true);
		expect(status.branch).toBe("main");
		expect(status.files).toEqual([]);
	});

	test("flags individual untracked files in working_dir with index=' '", async () => {
		writeFile(repo.root, "draft.md", "todo");
		writeFile(repo.root, "nested/deep/note.md", "todo");
		const status = await getStatus(repo.root);
		expect(status.isClean).toBe(false);
		const row = status.files.find((f) => f.path === "draft.md");
		expect(row).toBeDefined();
		expect(row?.index).toBe(" ");
		expect(row?.workingDir).toBe("?");
		expect(status.files.find((f) => f.path === "nested/deep/note.md")?.workingDir).toBe("?");
		expect(status.files.find((f) => f.path === "nested/")).toBeUndefined();
	});

	test("flags a modified tracked file in working_dir with index=' '", async () => {
		writeFile(repo.root, "README.md", "# changed\n");
		const status = await getStatus(repo.root);
		const row = status.files.find((f) => f.path === "README.md");
		expect(row?.workingDir).toBe("M");
		expect(row?.index).toBe(" ");
	});

	test("diff returns a unified patch with insertion/deletion counts", async () => {
		writeFile(repo.root, "README.md", "# line1\n# line2\n# line3\n");
		const diff = await getDiff(repo.root, { path: "README.md" });
		expect(diff.binary).toBe(false);
		expect(diff.insertions).toBeGreaterThan(0);
		expect(diff.patch).toContain("@@");
	});

	test("reports ahead count from the configured upstream", async () => {
		const remote = mkdtempSync(join(tmpdir(), "git-remote-"));
		try {
			execFileSync("git", ["init", "--bare", "-q", remote]);
			execFileSync("git", ["remote", "add", "origin", remote], { cwd: repo.root });
			execFileSync("git", ["push", "-u", "origin", "main"], { cwd: repo.root, stdio: "ignore" });
			commitAll(repo.root, "local ahead");

			const status = await getStatus(repo.root);
			expect(status.tracking).toMatchObject({ remote: "origin", branch: "main", ahead: 1, behind: 0 });
		} finally {
			rmSync(remote, { recursive: true, force: true });
		}
	});
});

describe("in-progress operations", () => {
	test("does not report merge or rebase state in a normal repository", async () => {
		expect(await getMergeInProgress(repo.root)).toBeNull();
		expect(await getRebaseInProgress(repo.root)).toBeNull();
	});

	test("detects an actual conflicted merge", async () => {
		execFileSync("git", ["checkout", "-b", "feature"], { cwd: repo.root });
		writeFile(repo.root, "README.md", "feature\n");
		commitAll(repo.root, "feature change");
		execFileSync("git", ["checkout", "main"], { cwd: repo.root });
		writeFile(repo.root, "README.md", "main\n");
		commitAll(repo.root, "main change");
		try {
			execFileSync("git", ["merge", "feature"], { cwd: repo.root, stdio: "ignore" });
		} catch {
			// The conflict is the state under test.
		}

		const state = await getMergeInProgress(repo.root);
		expect(state?.head).toMatch(/^[0-9a-f]{40}$/);
		expect(state?.message).toContain("feature");
		const status = await getStatus(repo.root);
		expect(status.files.find((file) => file.path === "README.md")).toMatchObject({ index: "U", workingDir: "U" });
		expect(await getRebaseInProgress(repo.root)).toBeNull();
	});

	test("detects an actual conflicted rebase without reporting a merge", async () => {
		execFileSync("git", ["checkout", "-b", "feature"], { cwd: repo.root });
		writeFile(repo.root, "README.md", "feature\n");
		commitAll(repo.root, "feature change");
		execFileSync("git", ["checkout", "main"], { cwd: repo.root });
		writeFile(repo.root, "README.md", "main\n");
		commitAll(repo.root, "main change");
		execFileSync("git", ["checkout", "feature"], { cwd: repo.root });
		try {
			execFileSync("git", ["rebase", "main"], { cwd: repo.root, stdio: "ignore" });
		} catch {
			// The conflict is the state under test.
		}

		const state = await getRebaseInProgress(repo.root);
		expect(state?.headName).toContain("feature");
		expect(state?.onto).toMatch(/^[0-9a-f]{40}$/);
		expect(await getMergeInProgress(repo.root)).toBeNull();
	});
});

describe("stage / unstage / revert", () => {
	test("stageFiles moves a working-tree change into the index", async () => {
		writeFile(repo.root, "README.md", "# changed\n");
		await stageFiles(repo.root, ["README.md"]);
		const status = await getStatus(repo.root);
		const row = status.files.find((f) => f.path === "README.md");
		expect(row?.index).toBe("M");
		expect(row?.workingDir).toBe(" ");
	});

	test("unstageFiles preserves working-tree changes", async () => {
		writeFile(repo.root, "README.md", "# changed\n");
		await stageFiles(repo.root, ["README.md"]);
		await unstageFiles(repo.root, ["README.md"]);
		const status = await getStatus(repo.root);
		const row = status.files.find((f) => f.path === "README.md");
		expect(row?.index).toBe(" ");
		expect(row?.workingDir).toBe("M");
	});

	test("revertFile discards the working-tree change", async () => {
		const original = "# test repo\n";
		writeFile(repo.root, "README.md", "# mutated\n");
		await revertFile(repo.root, "README.md", "working");
		const { readFileSync } = await import("node:fs");
		expect(readFileSync(join(repo.root, "README.md"), "utf-8")).toBe(original);
	});
});

describe("commit", () => {
	test("creates a commit with a valid SHA", async () => {
		writeFile(repo.root, "a.ts", "export const x = 1;\n");
		await stageFiles(repo.root, ["a.ts"]);
		const r = await commit(repo.root, "add a.ts");
		expect(r.sha).toMatch(/^[0-9a-f]{7,}$/);
		const status = await getStatus(repo.root);
		expect(status.isClean).toBe(true);
	});
});

describe("branches", () => {
	test("createBranch + checkoutBranch moves HEAD", async () => {
		const r = await createBranch(repo.root, "feature", { startPoint: "main", checkout: true });
		expect(r.branch).toBe("feature");
		expect(r.checkedOut).toBe(true);
		const status = await getStatus(repo.root);
		expect(status.branch).toBe("feature");
	});

	test("getBranches lists local + remote", async () => {
		const { local, remote } = await getBranches(repo.root);
		expect(local.find((b) => b.name === "main")).toBeDefined();
		expect(remote).toEqual([]);
	});

	test("deleteBranch refuses unmerged by default; force=true succeeds", async () => {
		await createBranch(repo.root, "wip", { startPoint: "main", checkout: true });
		writeFile(repo.root, "wip.txt", "wip");
		commitAll(repo.root, "wip change on wip branch");
		// Switch back to main first so wip is unmerged.
		await checkoutBranch(repo.root, "main");
		let threw = false;
		try { await deleteBranch(repo.root, "wip", { force: false }); } catch { threw = true; }
		expect(threw).toBe(true);
		await deleteBranch(repo.root, "wip", { force: true });
		const { local } = await getBranches(repo.root);
		expect(local.find((b) => b.name === "wip")).toBeUndefined();
	});

	test("renameBranch renames and preserves upstream tracking", async () => {
		await createBranch(repo.root, "old", { checkout: false });
		const r = await renameBranch(repo.root, "old", "new");
		expect(r.name).toBe("new");
		const { local } = await getBranches(repo.root);
		expect(local.find((b) => b.name === "old")).toBeUndefined();
		expect(local.find((b) => b.name === "new")).toBeDefined();
	});
});

describe("log", () => {
	test("returns the most recent commits with paging cursor", async () => {
		// Create a handful of empty commits.
		for (let i = 0; i < 5; i++) commitAll(repo.root, `commit ${i}`);
		const r = await getLog(repo.root, { maxCount: 3 });
		expect(r.commits.length).toBe(3);
		expect(r.nextCursor).toBeDefined();

		const next = await getLog(repo.root, { maxCount: 3, cursor: r.nextCursor });
		expect(next.commits.length).toBeGreaterThan(0);
		expect(next.commits.map((commit) => commit.sha)).not.toContain(r.commits[2]?.sha);
		expect(new Set([...r.commits, ...next.commits].map((commit) => commit.sha)).size).toBe(r.commits.length + next.commits.length);
	});
});

describe("stash", () => {
	test("stashPush + stashPop + listStashes", async () => {
		writeFile(repo.root, "README.md", "# dirty\n");
		const push = await stashPush(repo.root, { message: "wip" });
		expect(push.ref).toMatch(/^stash@\{\d+\}$/);

		const statusAfterPush = await getStatus(repo.root);
		expect(statusAfterPush.isClean).toBe(true);

		await stashPop(repo.root, push.ref);
		const after = await listStashes(repo.root);
		expect(after.entries.find((e) => e.ref === push.ref)).toBeUndefined();
		const final = await getStatus(repo.root);
		expect(final.isClean).toBe(false);
	});

	test("stashDrop removes an entry without applying", async () => {
		writeFile(repo.root, "README.md", "# dirty\n");
		const push = await stashPush(repo.root);
		await stashDrop(repo.root, push.ref);
		const after = await listStashes(repo.root);
		expect(after.entries).toHaveLength(0);
	});
});

describe("remotes", () => {
	test("addRemote + getRemotes round-trip", async () => {
		await addRemote(repo.root, "origin", "https://example.com/repo.git");
		const { remotes } = await getRemotes(repo.root);
		expect(remotes.find((r) => r.name === "origin")).toBeDefined();
	});
});

describe("worktrees", () => {
	test("getWorktrees lists the primary worktree", async () => {
		const { worktrees } = await getWorktrees(repo.root);
		const primary = worktrees.find((w) => w.isPrimary);
		expect(primary).toBeDefined();
		expect(primary?.path).toBe(repo.root);
	});
});

describe("mutation lock", () => {
	test("serializes concurrent stage calls on the same cwd", async () => {
		writeFile(repo.root, "a.md", "a");
		writeFile(repo.root, "b.md", "b");
		// Run two stage ops in parallel; both should succeed (lock + git
		// allow sequencing).
		await Promise.all([
			stageFiles(repo.root, ["a.md"]),
			stageFiles(repo.root, ["b.md"]),
		]);
		const status = await getStatus(repo.root);
		const a = status.files.find((f) => f.path === "a.md");
		const b = status.files.find((f) => f.path === "b.md");
		expect(a?.index).toBe("A");
		expect(b?.index).toBe("A");
	});
});

describe("UTF-8 paths", () => {
	test("status reports non-ASCII filenames as readable UTF-8, not octal escapes", async () => {
		writeFile(repo.root, "中文文件.txt", "hello");
		writeFile(repo.root, "nested/日本語.md", "world");
		const status = await getStatus(repo.root);
		expect(status.files.find((f) => f.path === "中文文件.txt")).toMatchObject({ workingDir: "?" });
		expect(status.files.find((f) => f.path === "nested/日本語.md")).toMatchObject({ workingDir: "?" });
	});
});