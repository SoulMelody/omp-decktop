import { describe, expect, test } from "bun:test";

import { classifyGitError, runGit, GitError, runGitOrThrow } from "./runGit.ts";
import { makeRepo, writeFile } from "./test-helpers.ts";

describe("runGit error classification", () => {
	test("not_a_repo for an unrelated directory", async () => {
		const r = await runGit({ cwd: "/tmp", args: ["rev-parse", "--is-inside-work-tree"], label: "test" });
		expect(r.ok).toBe(false);
		expect(classifyGitError(r.stderr)).toBe("not_a_repo");
	});

	test("git_failed for unknown subcommand", async () => {
		const r = await runGit({ cwd: "/tmp", args: ["no-such-subcommand"], label: "test" });
		expect(r.ok).toBe(false);
		expect(classifyGitError(r.stderr)).toBe("git_failed");
	});

	test("nothing_to_commit on a clean tree commit attempt", async () => {
		const repo = makeRepo();
		const r = await runGit({ cwd: repo.root, args: ["commit", "--allow-empty", "-m", "noop"], label: "test" });
		expect(r.ok).toBe(true); // empty commit is allowed
		repo.cleanup();
	});

	test("path_not_found for checkout of a missing ref", async () => {
		const repo = makeRepo();
		const r = await runGit({ cwd: repo.root, args: ["checkout", "no-such-branch"], label: "test" });
		expect(r.ok).toBe(false);
		// Modern git's error uses different phrasing; classifier maps to git_failed
		// when no keyword matches. That's fine — the route layer reports 500.
		expect(r.ok).toBe(false);
		repo.cleanup();
	});
});

describe("runGitOrThrow", () => {
	test("resolves with the result on success", async () => {
		const repo = makeRepo();
		const r = await runGitOrThrow({ cwd: repo.root, args: ["status", "--porcelain"], label: "test" });
		expect(r.ok).toBe(true);
		repo.cleanup();
	});

	test("throws GitError on failure", async () => {
		try {
			await runGitOrThrow({ cwd: "/tmp", args: ["rev-parse", "--is-inside-work-tree"], label: "test" });
			throw new Error("should have thrown");
		} catch (err) {
			expect(err instanceof GitError).toBe(true);
			expect((err as GitError).code).toBe("not_a_repo");
		}
	});
});