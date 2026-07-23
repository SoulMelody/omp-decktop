/**
 * `/api/git/*` route registration. Wires every endpoint in the git-integration
 * spec. Read endpoints pass through git-service results; mutating endpoints
 * translate `GitError` into 4xx via `classifyGitError`.
 */

import { Hono } from "hono";
import {
	addRemote,
	checkoutBranch,
	cherryPick,
	commit as gitCommit,
	createBranch,
	createWorktree,
	deleteBranch,
	deleteRemoteBranch,
	fetch as gitFetch,
	getBranches,
	getCommitFiles,
	getDiff,
	getFileDiff,
	getLog,
	getMergeInProgress,
	getRebaseInProgress,
	getRemotes,
	getRangeDiff,
	getStatus,
	getToplevel,
	getWorktrees,
	isGitRepository,
	listStashes,
	merge,
	pull,
	push as gitPush,
	removeRemote,
	removeWorktree,
	renameBranch,
	resetToCommit,
	revertCommit,
	revertFile as gitRevertFile,
	stageFiles,
	unstageFiles,
	stashPush,
	stashApply,
	stashPop,
	stashDrop,
	abortMerge,
	abortRebase,
	continueMerge,
	continueRebase,
	rebase as gitRebase,
} from "./git-service.ts";
import {
	getGlobalIdentity,
	getLocalIdentity,
	listIdentities,
	saveIdentity,
	deleteIdentity,
	validateSshKey,
	setLocalIdentity,
} from "./identity-storage.ts";
import type { Config } from "../config.ts";
import { logger } from "../log.ts";
import { GitError } from "./runGit.ts";

const log = logger("git-routes");

export function buildGitRouter(config: Config): Hono {
	const app = new Hono();
	const allowedRoots = [config.defaultCwd, ...config.extraWorkspaces];

	// ─── repository detection ───────────────────────────────────────────

	app.get("/git/check", async (c) => {
		const cwd = c.req.query("cwd");
		if (!cwd) return c.json({ ok: false, error: "missing cwd" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try {
			const isRepo = await isGitRepository(cwd);
			const toplevel = isRepo ? await getToplevel(cwd) : undefined;
			return c.json({ ok: true, isRepo, toplevel });
		} catch (err) {
			return c.json({ ok: false, error: errMsg(err) }, 500);
		}
	});

	app.get("/git/toplevel", async (c) => {
		const cwd = c.req.query("cwd");
		if (!cwd) return c.json({ ok: false, error: "missing cwd" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try {
			const toplevel = await getToplevel(cwd);
			return c.json({ ok: true, toplevel });
		} catch (err) {
			return c.json({ ok: true, toplevel: null });
		}
	});

	app.get("/git/status", async (c) => {
		const cwd = c.req.query("cwd");
		if (!cwd) return c.json({ ok: false, error: "missing cwd" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try {
			const status = await getStatus(cwd);
			const merge = await getMergeInProgress(cwd);
			const rebase = await getRebaseInProgress(cwd);
			return c.json({ ...status, mergeInProgress: merge ?? undefined, rebaseInProgress: rebase ?? undefined });
		} catch (err) {
			return gitErrorResponse(c, err, "status");
		}
	});

	app.get("/git/diff", async (c) => {
		const cwd = c.req.query("cwd");
		const path = c.req.query("path");
		const staged = c.req.query("staged") === "true";
		if (!cwd) return c.json({ ok: false, error: "missing cwd" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try {
			return c.json(await getDiff(cwd, { path, staged }));
		} catch (err) {
			return gitErrorResponse(c, err, "diff");
		}
	});

	app.get("/git/range-diff", async (c) => {
		const cwd = c.req.query("cwd");
		const base = c.req.query("base");
		const head = c.req.query("head");
		const path = c.req.query("path");
		if (!cwd || !base || !head) return c.json({ ok: false, error: "missing cwd/base/head" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try {
			return c.json(await getRangeDiff(cwd, { base, head, path }));
		} catch (err) {
			return gitErrorResponse(c, err, "range-diff");
		}
	});

	app.get("/git/file-diff", async (c) => {
		const cwd = c.req.query("cwd");
		const path = c.req.query("path");
		const staged = c.req.query("staged") === "true";
		if (!cwd || !path) return c.json({ ok: false, error: "missing cwd or path" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try {
			const r = await getFileDiff(cwd, path, { staged });
			return c.json({ ok: true, ...r });
		} catch (err) {
			return gitErrorResponse(c, err, "file-diff");
		}
	});

	// ─── mutations ──────────────────────────────────────────────────────

	app.post("/git/stage", async (c) => {
		const body = await c.req.json().catch(() => null);
		const { cwd, paths } = body ?? {};
		if (!cwd || !Array.isArray(paths)) return c.json({ ok: false, error: "missing cwd or paths" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try {
			await stageFiles(cwd, paths);
			return c.json({ ok: true });
		} catch (err) { return gitErrorResponse(c, err, "stage"); }
	});

	app.post("/git/unstage", async (c) => {
		const body = await c.req.json().catch(() => null);
		const { cwd, paths } = body ?? {};
		if (!cwd || !Array.isArray(paths)) return c.json({ ok: false, error: "missing cwd or paths" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try {
			await unstageFiles(cwd, paths);
			return c.json({ ok: true });
		} catch (err) { return gitErrorResponse(c, err, "unstage"); }
	});

	app.post("/git/revert", async (c) => {
		const body = await c.req.json().catch(() => null);
		const { cwd, path, scope, confirm } = body ?? {};
		if (!cwd || !path) return c.json({ ok: false, error: "missing cwd or path" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		if (!confirm) return c.json({ ok: false, error: "confirm required" }, 400);
		try {
			await gitRevertFile(cwd, path, scope === "all" ? "all" : "working");
			return c.json({ ok: true });
		} catch (err) { return gitErrorResponse(c, err, "revert"); }
	});

	app.post("/git/commit", async (c) => {
		const body = await c.req.json().catch(() => null);
		const { cwd, message, stageFiles: onlyStage, signOff, pushAfter } = body ?? {};
		if (!cwd || typeof message !== "string") return c.json({ ok: false, error: "missing cwd or message" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try {
			const result = await gitCommit(cwd, message, { signOff, stageFiles: onlyStage });
			let pushed = false;
			if (pushAfter) {
				try { await gitPush(cwd); pushed = true; } catch { pushed = false; }
			}
			return c.json({ ok: true, sha: result.sha, pushed });
		} catch (err) { return gitErrorResponse(c, err, "commit"); }
	});

	app.post("/git/push", async (c) => {
		const body = await c.req.json().catch(() => null);
		const { cwd, remote, branch, force, confirm } = body ?? {};
		if (!cwd) return c.json({ ok: false, error: "missing cwd" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		if (force === "lease" && confirm !== true) {
			return c.json({ ok: false, error: "confirm required for force push" }, 400);
		}
		try {
			const r = await gitPush(cwd, { remote, branch, force: force ?? "no" });
			return c.json({ ok: true, setUpstream: r.setUpstream ?? false, rejected: r.rejected ?? false, reason: r.reason });
		} catch (err) { return gitErrorResponse(c, err, "push"); }
	});

	app.post("/git/pull", async (c) => {
		const body = await c.req.json().catch(() => null);
		const { cwd, remote, branch, rebase, allowMergeCommit } = body ?? {};
		if (!cwd) return c.json({ ok: false, error: "missing cwd" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try {
			await pull(cwd, { remote, branch, rebase, allowMergeCommit });
			return c.json({ ok: true });
		} catch (err) { return gitErrorResponse(c, err, "pull"); }
	});

	app.post("/git/fetch", async (c) => {
		const body = await c.req.json().catch(() => null);
		const { cwd, remote, prune } = body ?? {};
		if (!cwd) return c.json({ ok: false, error: "missing cwd" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try {
			await gitFetch(cwd, { remote, prune });
			return c.json({ ok: true });
		} catch (err) { return gitErrorResponse(c, err, "fetch"); }
	});

	// ─── branches ──────────────────────────────────────────────────────

	app.get("/git/branches", async (c) => {
		const cwd = c.req.query("cwd");
		if (!cwd) return c.json({ ok: false, error: "missing cwd" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try {
			return c.json({ ok: true, ...(await getBranches(cwd)) });
		} catch (err) { return gitErrorResponse(c, err, "branches"); }
	});

	app.post("/git/branches", async (c) => {
		const body = await c.req.json().catch(() => null);
		const { cwd, name, startPoint, checkout } = body ?? {};
		if (!cwd || !name) return c.json({ ok: false, error: "missing cwd or name" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try {
			const r = await createBranch(cwd, name, { startPoint, checkout });
			return c.json({ ok: true, ...r });
		} catch (err) { return gitErrorResponse(c, err, "branch-create"); }
	});

	app.delete("/git/branches", async (c) => {
		const body = await c.req.json().catch(() => null);
		const { cwd, name, force, confirm } = body ?? {};
		if (!cwd || !name) return c.json({ ok: false, error: "missing cwd or name" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		if (force && !confirm) return c.json({ ok: false, error: "confirm required for force-delete" }, 400);
		try {
			await deleteBranch(cwd, name, { force });
			return c.json({ ok: true });
		} catch (err) {
			// Surface "branch_unmerged" as 400 with a stable error so the UI
			// can offer to retry with force.
			if (err instanceof GitError && err.code === "branch_unmerged") {
				return c.json({ ok: false, error: err.message, code: err.code }, 400);
			}
			return gitErrorResponse(c, err, "branch-delete");
		}
	});

	app.put("/git/branches/rename", async (c) => {
		const body = await c.req.json().catch(() => null);
		const { cwd, oldName, newName } = body ?? {};
		if (!cwd || !oldName || !newName) return c.json({ ok: false, error: "missing cwd, oldName, or newName" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try {
			const r = await renameBranch(cwd, oldName, newName);
			return c.json({ ok: true, ...r });
		} catch (err) { return gitErrorResponse(c, err, "branch-rename"); }
	});

	app.post("/git/checkout", async (c) => {
		const body = await c.req.json().catch(() => null);
		const { cwd, branch, autoStash } = body ?? {};
		if (!cwd || !branch) return c.json({ ok: false, error: "missing cwd or branch" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try {
			await checkoutBranch(cwd, branch, { autoStash });
			return c.json({ ok: true });
		} catch (err) { return gitErrorResponse(c, err, "checkout"); }
	});

	// ─── log ────────────────────────────────────────────────────────────

	app.get("/git/log", async (c) => {
		const cwd = c.req.query("cwd");
		const maxCount = Number(c.req.query("maxCount") ?? 50);
		const from = c.req.query("from") ?? undefined;
		const to = c.req.query("to") ?? undefined;
		const path = c.req.query("path") ?? undefined;
		const cursor = c.req.query("cursor") ?? undefined;
		if (!cwd) return c.json({ ok: false, error: "missing cwd" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try {
			return c.json(await getLog(cwd, { maxCount, from, to, path, cursor }));
		} catch (err) { return gitErrorResponse(c, err, "log"); }
	});

	app.get("/git/commit-files", async (c) => {
		const cwd = c.req.query("cwd");
		const sha = c.req.query("sha");
		if (!cwd || !sha) return c.json({ ok: false, error: "missing cwd or sha" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try {
			const r = await getCommitFiles(cwd, sha);
			return c.json({ ok: true, ...r });
		} catch (err) { return gitErrorResponse(c, err, "commit-files"); }
	});

	app.get("/git/commit-file-diff", async (c) => {
		const cwd = c.req.query("cwd");
		const sha = c.req.query("sha");
		const path = c.req.query("path");
		if (!cwd || !sha || !path) return c.json({ ok: false, error: "missing cwd, sha, or path" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try {
			const head = await getToplevel(cwd);
			if (!head) return c.json({ ok: false, error: "not a repo" }, 400);
			const [orig, mod] = await Promise.all([
				runShow(cwd, `${sha}^:${path}`),
				runShow(cwd, `${sha}:${path}`),
			]);
			return c.json({ ok: true, original: orig, modified: mod, isBinary: false });
		} catch (err) { return gitErrorResponse(c, err, "commit-file-diff"); }
	});

	// ─── stash ──────────────────────────────────────────────────────────

	app.get("/git/stashes", async (c) => {
		const cwd = c.req.query("cwd");
		if (!cwd) return c.json({ ok: false, error: "missing cwd" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try {
			return c.json({ ok: true, ...(await listStashes(cwd)) });
		} catch (err) { return gitErrorResponse(c, err, "stashes"); }
	});

	app.post("/git/stash", async (c) => {
		const body = await c.req.json().catch(() => null);
		const { cwd, message, includeUntracked } = body ?? {};
		if (!cwd) return c.json({ ok: false, error: "missing cwd" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try {
			const r = await stashPush(cwd, { message, includeUntracked });
			return c.json({ ok: true, ref: r.ref });
		} catch (err) { return gitErrorResponse(c, err, "stash-push"); }
	});

	app.post("/git/stash/apply", async (c) => {
		const body = await c.req.json().catch(() => null);
		const { cwd, ref } = body ?? {};
		if (!cwd || !ref) return c.json({ ok: false, error: "missing cwd or ref" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try { await stashApply(cwd, ref); return c.json({ ok: true, ref }); }
		catch (err) { return gitErrorResponse(c, err, "stash-apply"); }
	});

	app.post("/git/stash/pop", async (c) => {
		const body = await c.req.json().catch(() => null);
		const { cwd, ref } = body ?? {};
		if (!cwd || !ref) return c.json({ ok: false, error: "missing cwd or ref" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try { await stashPop(cwd, ref); return c.json({ ok: true, ref }); }
		catch (err) { return gitErrorResponse(c, err, "stash-pop"); }
	});

	app.post("/git/stash/drop", async (c) => {
		const body = await c.req.json().catch(() => null);
		const { cwd, ref } = body ?? {};
		if (!cwd || !ref) return c.json({ ok: false, error: "missing cwd or ref" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try { await stashDrop(cwd, ref); return c.json({ ok: true, ref }); }
		catch (err) { return gitErrorResponse(c, err, "stash-drop"); }
	});

	// ─── merge / rebase / cherry-pick ──────────────────────────────────

	app.post("/git/merge", async (c) => {
		const body = await c.req.json().catch(() => null);
		const { cwd, branch, noFf, message } = body ?? {};
		if (!cwd || !branch) return c.json({ ok: false, error: "missing cwd or branch" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try { await merge(cwd, branch, { noFf, message }); return c.json({ ok: true }); }
		catch (err) {
			if (err instanceof GitError && err.code === "conflict") return conflictResponse(c, err, "merge");
			return gitErrorResponse(c, err, "merge");
		}
	});

	app.post("/git/merge/abort", async (c) => {
		const body = await c.req.json().catch(() => null);
		const { cwd } = body ?? {};
		if (!cwd) return c.json({ ok: false, error: "missing cwd" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try { await abortMerge(cwd); return c.json({ ok: true }); }
		catch (err) { return gitErrorResponse(c, err, "merge-abort"); }
	});

	app.post("/git/merge/continue", async (c) => {
		const body = await c.req.json().catch(() => null);
		const { cwd, message } = body ?? {};
		if (!cwd) return c.json({ ok: false, error: "missing cwd" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try { await continueMerge(cwd, { message }); return c.json({ ok: true }); }
		catch (err) { return gitErrorResponse(c, err, "merge-continue"); }
	});

	app.post("/git/rebase", async (c) => {
		const body = await c.req.json().catch(() => null);
		const { cwd, onto } = body ?? {};
		if (!cwd || !onto) return c.json({ ok: false, error: "missing cwd or onto" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try { await gitRebase(cwd, onto); return c.json({ ok: true }); }
		catch (err) {
			if (err instanceof GitError && err.code === "conflict") return conflictResponse(c, err, "rebase");
			return gitErrorResponse(c, err, "rebase");
		}
	});

	app.post("/git/rebase/abort", async (c) => {
		const body = await c.req.json().catch(() => null);
		const { cwd } = body ?? {};
		if (!cwd) return c.json({ ok: false, error: "missing cwd" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try { await abortRebase(cwd); return c.json({ ok: true }); }
		catch (err) { return gitErrorResponse(c, err, "rebase-abort"); }
	});

	app.post("/git/rebase/continue", async (c) => {
		const body = await c.req.json().catch(() => null);
		const { cwd } = body ?? {};
		if (!cwd) return c.json({ ok: false, error: "missing cwd" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try { await continueRebase(cwd); return c.json({ ok: true }); }
		catch (err) { return gitErrorResponse(c, err, "rebase-continue"); }
	});

	app.post("/git/cherry-pick", async (c) => {
		const body = await c.req.json().catch(() => null);
		const { cwd, sha, noCommit } = body ?? {};
		if (!cwd || !sha) return c.json({ ok: false, error: "missing cwd or sha" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try { await cherryPick(cwd, sha, { noCommit }); return c.json({ ok: true }); }
		catch (err) {
			if (err instanceof GitError && err.code === "conflict") return conflictResponse(c, err, "cherry-pick");
			return gitErrorResponse(c, err, "cherry-pick");
		}
	});

	app.post("/git/revert-commit", async (c) => {
		const body = await c.req.json().catch(() => null);
		const { cwd, sha, noCommit } = body ?? {};
		if (!cwd || !sha) return c.json({ ok: false, error: "missing cwd or sha" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try {
			const r = await revertCommit(cwd, sha, { noCommit });
			return c.json({ ok: true, sha: r.sha });
		} catch (err) {
			if (err instanceof GitError && err.code === "conflict") return conflictResponse(c, err, "revert");
			return gitErrorResponse(c, err, "revert-commit");
		}
	});

	app.post("/git/reset-to-commit", async (c) => {
		const body = await c.req.json().catch(() => null);
		const { cwd, sha, mode, confirm } = body ?? {};
		if (!cwd || !sha || !mode) return c.json({ ok: false, error: "missing cwd, sha, or mode" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		if (mode === "hard" && !confirm) return c.json({ ok: false, error: "confirm required for hard reset" }, 400);
		try { await resetToCommit(cwd, sha, mode); return c.json({ ok: true }); }
		catch (err) { return gitErrorResponse(c, err, "reset"); }
	});

	// ─── worktrees ──────────────────────────────────────────────────────

	app.get("/git/worktrees", async (c) => {
		const cwd = c.req.query("cwd");
		if (!cwd) return c.json({ ok: false, error: "missing cwd" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try { return c.json({ ok: true, ...(await getWorktrees(cwd)) }); }
		catch (err) { return gitErrorResponse(c, err, "worktrees"); }
	});

	app.post("/git/worktrees", async (c) => {
		const body = await c.req.json().catch(() => null);
		const { cwd, path, mode, branch, startRef, upstream } = body ?? {};
		if (!cwd || !path || !mode) return c.json({ ok: false, error: "missing cwd, path, or mode" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try {
			const r = await createWorktree(cwd, { path, mode, branch, startRef });
			return c.json({ ok: true, ...r, head: r.head });
		} catch (err) { return gitErrorResponse(c, err, "worktree-create"); }
	});

	app.delete("/git/worktrees", async (c) => {
		const body = await c.req.json().catch(() => null);
		const { cwd, path, deleteBranch, confirm } = body ?? {};
		if (!cwd || !path) return c.json({ ok: false, error: "missing cwd or path" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		if (deleteBranch && !confirm) return c.json({ ok: false, error: "confirm required to delete branch" }, 400);
		try { await removeWorktree(cwd, { path, deleteBranch }); return c.json({ ok: true }); }
		catch (err) { return gitErrorResponse(c, err, "worktree-remove"); }
	});

	// ─── remotes ────────────────────────────────────────────────────────

	app.get("/git/remotes", async (c) => {
		const cwd = c.req.query("cwd");
		if (!cwd) return c.json({ ok: false, error: "missing cwd" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try { return c.json({ ok: true, ...(await getRemotes(cwd)) }); }
		catch (err) { return gitErrorResponse(c, err, "remotes"); }
	});

	app.post("/git/remotes", async (c) => {
		const body = await c.req.json().catch(() => null);
		const { cwd, name, url } = body ?? {};
		if (!cwd || !name || !url) return c.json({ ok: false, error: "missing cwd, name, or url" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try { await addRemote(cwd, name, url); return c.json({ ok: true }); }
		catch (err) { return gitErrorResponse(c, err, "remote-add"); }
	});

	app.delete("/git/remotes", async (c) => {
		const body = await c.req.json().catch(() => null);
		const { cwd, name } = body ?? {};
		if (!cwd || !name) return c.json({ ok: false, error: "missing cwd or name" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try { await removeRemote(cwd, name); return c.json({ ok: true }); }
		catch (err) {
			if (err instanceof GitError && err.code === "cannot_remove_origin") {
				return c.json({ ok: false, error: err.message }, 400);
			}
			return gitErrorResponse(c, err, "remote-remove");
		}
	});

	app.delete("/git/remote-branches", async (c) => {
		const body = await c.req.json().catch(() => null);
		const { cwd, branch, remote } = body ?? {};
		if (!cwd || !branch) return c.json({ ok: false, error: "missing cwd or branch" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try { await deleteRemoteBranch(cwd, branch, remote ?? "origin"); return c.json({ ok: true }); }
		catch (err) { return gitErrorResponse(c, err, "remote-branch-delete"); }
	});

	// ─── identity ───────────────────────────────────────────────────────

	app.get("/git/global-identity", async (c) => {
		const id = await getGlobalIdentity();
		return c.json(id);
	});

	app.get("/git/current-identity", async (c) => {
		const cwd = c.req.query("cwd");
		if (!cwd) return c.json({ error: "missing cwd" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ error: "cwd not allowed" }, 403);
		const local = await import("./identity-storage.ts").then((m) => m.getLocalIdentity(cwd));
		return c.json({ ...local, source: local.userName ? "local" : "global" });
	});

	app.post("/git/set-identity", async (c) => {
		const body = await c.req.json().catch(() => null);
		const { cwd, userName, userEmail, sshKeyPath } = body ?? {};
		if (!cwd || !userName || !userEmail) return c.json({ ok: false, error: "missing cwd, userName, or userEmail" }, 400);
		if (!isAllowed(cwd, allowedRoots)) return c.json({ ok: false, error: "cwd not allowed" }, 403);
		try {
			await setLocalIdentity(cwd, { userName, userEmail, sshKeyPath });
			return c.json({ ok: true });
		} catch (err) { return gitErrorResponse(c, err, "set-identity"); }
	});

	app.get("/git/identities", async (c) => {
		const list = await listIdentities(config.agentDir);
		return c.json({ ok: true, identities: list });
	});

	app.post("/git/identities", async (c) => {
		const body = await c.req.json().catch(() => null);
		const { id, userName, userEmail, authType, sshKeyPath, isGlobal } = body ?? {};
		if (!id || !userName || !userEmail || !authType) {
			return c.json({ ok: false, error: "missing required fields" }, 400);
		}
		if (authType === "ssh" && sshKeyPath) {
			const ok = await validateSshKey(sshKeyPath);
			if (!ok) return c.json({ ok: false, error: "ssh key not readable or not an OpenSSH key" }, 400);
		}
		const saved = await saveIdentity(config.agentDir, { id, userName, userEmail, authType, sshKeyPath, isGlobal: !!isGlobal });
		return c.json({ ok: true, identity: saved });
	});

	app.delete("/git/identities/:id", async (c) => {
		const id = c.req.param("id");
		const ok = await deleteIdentity(config.agentDir, id);
		if (!ok) return c.json({ ok: false, error: "not found" }, 404);
		return c.json({ ok: true });
	});

	return app;
}

// ─── helpers ───────────────────────────────────────────────────────────────

import { isCwdAllowed } from "../fs-allow.ts";

function isAllowed(cwd: string, allowedRoots: string[]): boolean {
	return isCwdAllowed(cwd, allowedRoots);
}

function errMsg(err: unknown): string {
	return (err as Error)?.message ?? String(err);
}

/**
 * Translate a `GitError` into an HTTP status code via the stable `code`
 * classifier. Network / not-a-repo / etc. map to clean 4xx/5xx so the
 * client can branch without parsing prose.
 */
function gitErrorResponse(c: import("hono").Context, err: unknown, label: string) {
	if (err instanceof GitError) {
		const status = statusForCode(err.code);
		log.warn(`git ${label} failed: code=${err.code} status=${status}`);
		return c.json({ ok: false, error: err.message, code: err.code }, status as 200 | 400 | 403 | 404 | 408 | 409 | 500);
	}
	log.error(`git ${label} crashed`, err);
	return c.json({ ok: false, error: errMsg(err) }, 500);
}

function conflictResponse(c: import("hono").Context, err: GitError, operation: "merge" | "rebase" | "cherry-pick" | "revert") {
	return c.json({
		ok: false,
		error: err.message,
		code: "conflict",
		conflicts: { operation, head: "", files: [] },
	}, 409);
}

function statusForCode(code: string): number {
	switch (code) {
		case "not_a_repo": return 400;
		case "permission_denied":
		case "cannot_remove_origin": return 403;
		case "path_not_found": return 404;
		case "conflict":
		case "branch_unmerged":
		case "rebase_in_progress":
		case "merge_in_progress":
		case "already_exists":
		case "nothing_to_commit": return 409;
		case "auth_required":
		case "network_error":
		case "git_failed":
		case "spawn_failed":
		case "git_not_installed": return 500;
		case "timeout": return 408; // Hono rejects 504; 408 (request timeout) is the closest legal code.
		default: return 500;
	}
}

/**
 * Best-effort `git show <object>`. Returns the file content as text on
 * success, or an empty string when the path doesn't exist in that revision
 * (root commit / renamed / deleted edge cases).
 */
async function runShow(cwd: string, spec: string): Promise<string> {
	const r = await import("./runGit.ts").then((m) => m.runGit({ cwd, args: ["show", spec], label: "show" }));
	if (!r.ok) return "";
	return r.stdout;
}