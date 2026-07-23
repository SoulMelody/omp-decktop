/**
 * Helper for spinning up a fresh, isolated git repository in a temp dir.
 * Used by `git-service.test.ts` and `routes-git.test.ts` so we can exercise
 * every primitive end-to-end without polluting the host filesystem.
 */

import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TestRepo {
	root: string;
	cleanup: () => void;
}

/** Initialize a brand-new repo at `root` with an initial commit on `main`. */
export function initRepo(root: string, opts: { initialBranch?: string; commitMessage?: string; userName?: string; userEmail?: string } = {}): void {
	const branch = opts.initialBranch ?? "main";
	mkdirSync(root, { recursive: true });
	execSync("git init -q -b " + branch, { cwd: root });
	if (opts.userName) execFileSync("git", ["config", "user.name", opts.userName], { cwd: root });
	if (opts.userEmail) execFileSync("git", ["config", "user.email", opts.userEmail], { cwd: root });
	writeFileSync(join(root, "README.md"), "# test repo\n");
	execFileSync("git", ["add", "."], { cwd: root });
	execFileSync("git", ["commit", "-m", opts.commitMessage ?? "initial commit"], { cwd: root });
}

/** Create a new repo rooted at a fresh tmpdir. */
export function makeRepo(): TestRepo {
	const root = join(tmpdir(), `git-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
	initRepo(root);
	return {
		root,
		cleanup: () => {
			if (existsSync(root)) rmSync(root, { recursive: true, force: true });
		},
	};
}

/** Write `content` to `path` (relative to `root`) and return the absolute path. */
export function writeFile(root: string, relPath: string, content: string): string {
	const abs = join(root, relPath);
	mkdirSync(join(abs, ".."), { recursive: true });
	writeFileSync(abs, content);
	return abs;
}

/** Stage + commit everything currently in the repo with `message`. */
export function commitAll(root: string, message: string): void {
	execFileSync("git", ["add", "-A"], { cwd: root });
	execFileSync("git", ["commit", "-m", message, "--allow-empty"], { cwd: root });
}