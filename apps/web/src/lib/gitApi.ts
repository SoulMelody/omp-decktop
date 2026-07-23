/**
 * Typed wrapper around `api.git*` methods. Centralizes the return-type
 * pattern so components don't have to repeat `if (!r.ok) throw r.error`
 * everywhere — most callers only care about the happy path.
 *
 * Each mutator returns a `GitOpResult<T>` that distinguishes success,
 * recoverable failure (conflict / network), and programmatic failure
 * (auth / 4xx). The Git UI branches on these to surface the right
 * recovery affordance (push -f confirm, conflict dialog, etc.).
 */

import { api } from "./api";

export type GitOpResult<T> =
	| { kind: "ok"; value: T }
	| { kind: "conflict"; message: string }
	| { kind: "rejected"; message: string }
	| { kind: "error"; message: string; code?: string };

export interface GitErrorBody {
	ok?: false;
	error?: string;
	code?: string;
}

/**
 * Extract an error message from a server response that may be `{ ok: false, error }`,
 * `{ error }`, or a generic thrown Error.
 */
function errMsg(body: unknown, fallback = "operation failed"): string {
	if (body && typeof body === "object") {
		const obj = body as Record<string, unknown>;
		if (typeof obj.error === "string") return obj.error;
	}
	return fallback;
}

function asGitError(body: unknown): { message: string; code?: string } {
	if (body && typeof body === "object") {
		const obj = body as Record<string, unknown>;
		return { message: typeof obj.error === "string" ? obj.error : "operation failed", code: typeof obj.code === "string" ? obj.code : undefined };
	}
	return { message: "operation failed" };
}

async function withGitResult<T>(fn: () => Promise<unknown>): Promise<GitOpResult<T>> {
	try {
		const r = await fn();
		if (r && typeof r === "object" && "ok" in r && (r as { ok: boolean }).ok) {
			return { kind: "ok", value: (r as { ok: true } & Record<string, unknown>) as unknown as T };
		}
		const e = asGitError(r);
		if (e.code === "conflict") return { kind: "conflict", message: e.message };
		if (e.code === "rejected" || /non-fast-forward|fetch first/i.test(e.message)) {
			return { kind: "rejected", message: e.message };
		}
		return { kind: "error", message: e.message, code: e.code };
	} catch (err) {
		// The api wrapper throws `Error("HTTP <code> <path>: <body>")` for
		// 4xx/5xx. The body is JSON; try to parse it.
		const msg = (err as Error)?.message ?? "";
		const jsonStart = msg.indexOf("{");
		if (jsonStart >= 0) {
			try {
				const parsed = JSON.parse(msg.slice(jsonStart)) as GitErrorBody;
				const message = parsed.error ?? msg;
				if (parsed.code === "conflict") return { kind: "conflict", message };
				if (parsed.code === "rejected" || /non-fast-forward|fetch first/i.test(message)) {
					return { kind: "rejected", message };
				}
				return { kind: "error", message, code: parsed.code };
			} catch {
				// fall through
			}
		}
		return { kind: "error", message: msg || "operation failed" };
	}
}

export const gitApi = {
	check(cwd: string): Promise<{ isRepo: boolean; toplevel?: string } | null> {
		return api.gitCheck(cwd).then((r) => (r.ok ? { isRepo: r.isRepo, toplevel: r.toplevel } : null)).catch(() => null);
	},

	status(cwd: string): Promise<import("@omp-deck/protocol").GitStatusResponse | null> {
		return api.gitStatus(cwd).catch(() => null);
	},

	diff(cwd: string, opts: { path?: string; staged?: boolean } = {}) {
		return api.gitDiff(cwd, opts).catch((err) => ({ ok: false, error: errMsg(err) } as { ok: false; error: string }));
	},

	fileDiff(cwd: string, path: string, staged = false) {
		return api.gitFileDiff(cwd, path, staged).catch((err) => ({ ok: false, original: "", modified: "", isBinary: false, error: errMsg(err) }));
	},

	stage(cwd: string, paths: string[]): Promise<GitOpResult<void>> {
		return withGitResult(() => api.gitStage(cwd, paths));
	},

	unstage(cwd: string, paths: string[]): Promise<GitOpResult<void>> {
		return withGitResult(() => api.gitUnstage(cwd, paths));
	},

	revert(cwd: string, path: string, scope: "all" | "working" = "working"): Promise<GitOpResult<void>> {
		return withGitResult(() => api.gitRevert(cwd, path, scope));
	},

	commit(cwd: string, message: string, opts: { stageFiles?: string[]; signOff?: boolean; pushAfter?: boolean } = {}): Promise<GitOpResult<{ sha: string; pushed?: boolean }>> {
		return withGitResult<{ sha: string; pushed?: boolean }>(() => api.gitCommit(cwd, message, opts)).then((r) => {
			if (r.kind === "ok") return { kind: "ok", value: { sha: r.value.sha, pushed: r.value.pushed ?? false } };
			return r;
		});
	},

	push(cwd: string, opts: { remote?: string; branch?: string; force?: "lease" | "no"; confirm?: boolean } = {}): Promise<GitOpResult<{ setUpstream?: boolean; rejected?: boolean; reason?: string }>> {
		return withGitResult<{ setUpstream?: boolean; rejected?: boolean; reason?: string }>(() => api.gitPush(cwd, opts)).then((result) => {
			if (result.kind === "ok" && result.value.rejected) {
				return { kind: "rejected", message: result.value.reason ?? "push rejected" };
			}
			return result;
		});
	},

	pull(cwd: string, opts: { remote?: string; branch?: string; rebase?: boolean; allowMergeCommit?: boolean } = {}): Promise<GitOpResult<void>> {
		return withGitResult(() => api.gitPull(cwd, opts));
	},

	fetch(cwd: string, opts: { remote?: string; prune?: boolean } = {}): Promise<GitOpResult<void>> {
		return withGitResult(() => api.gitFetch(cwd, opts));
	},

	branches(cwd: string): Promise<{ local: import("@omp-deck/protocol").GitBranchInfo[]; remote: import("@omp-deck/protocol").GitBranchInfo[] } | null> {
		return api.gitBranches(cwd).then((r) => (r.ok ? { local: r.local, remote: r.remote } : null)).catch(() => null);
	},

	createBranch(cwd: string, name: string, opts: { startPoint?: string; checkout?: boolean } = {}): Promise<GitOpResult<{ branch: string; checkedOut: boolean }>> {
		return withGitResult(() => api.gitCreateBranch(cwd, name, opts));
	},

	deleteBranch(cwd: string, name: string, opts: { force?: boolean; confirm?: boolean } = {}): Promise<GitOpResult<void>> {
		return withGitResult(() => api.gitDeleteBranch(cwd, name, opts));
	},

	renameBranch(cwd: string, oldName: string, newName: string): Promise<GitOpResult<{ name: string }>> {
		return withGitResult(() => api.gitRenameBranch(cwd, oldName, newName));
	},

	checkout(cwd: string, branch: string, opts: { autoStash?: boolean } = {}): Promise<GitOpResult<void>> {
		return withGitResult(() => api.gitCheckout(cwd, branch, opts));
	},

	log(cwd: string, opts: { maxCount?: number; cursor?: string; path?: string } = {}): Promise<import("@omp-deck/protocol").GitLogResponse | null> {
		return api.gitLog(cwd, opts).catch(() => null);
	},

	commitFiles(cwd: string, sha: string) {
		return api.gitCommitFiles(cwd, sha).catch((err) => ({ ok: false, files: [], error: errMsg(err) }));
	},

	stashes(cwd: string): Promise<import("@omp-deck/protocol").GitStashEntry[]> {
		return api.gitStashes(cwd).then((r) => (r.ok ? r.entries : [])).catch(() => []);
	},

	stashPush(cwd: string, opts: { message?: string; includeUntracked?: boolean } = {}): Promise<GitOpResult<{ ref: string }>> {
		return withGitResult(() => api.gitStashPush(cwd, opts));
	},

	stashApply(cwd: string, ref: string): Promise<GitOpResult<{ ref: string }>> {
		return withGitResult(() => api.gitStashApply(cwd, ref));
	},

	stashPop(cwd: string, ref: string): Promise<GitOpResult<{ ref: string }>> {
		return withGitResult(() => api.gitStashPop(cwd, ref));
	},

	stashDrop(cwd: string, ref: string): Promise<GitOpResult<{ ref: string }>> {
		return withGitResult(() => api.gitStashDrop(cwd, ref));
	},

	merge(cwd: string, branch: string, opts: { noFf?: boolean; message?: string } = {}): Promise<GitOpResult<void>> {
		return withGitResult(() => api.gitMerge(cwd, branch, opts));
	},

	mergeAbort(cwd: string): Promise<GitOpResult<void>> {
		return withGitResult(() => api.gitMergeAbort(cwd));
	},

	mergeContinue(cwd: string, message?: string): Promise<GitOpResult<void>> {
		return withGitResult(() => api.gitMergeContinue(cwd, message));
	},

	rebase(cwd: string, onto: string): Promise<GitOpResult<void>> {
		return withGitResult(() => api.gitRebase(cwd, onto));
	},

	rebaseAbort(cwd: string): Promise<GitOpResult<void>> {
		return withGitResult(() => api.gitRebaseAbort(cwd));
	},

	rebaseContinue(cwd: string): Promise<GitOpResult<void>> {
		return withGitResult(() => api.gitRebaseContinue(cwd));
	},

	cherryPick(cwd: string, sha: string, opts: { noCommit?: boolean } = {}): Promise<GitOpResult<void>> {
		return withGitResult(() => api.gitCherryPick(cwd, sha, opts));
	},

	revertCommit(cwd: string, sha: string, opts: { noCommit?: boolean } = {}): Promise<GitOpResult<{ sha: string }>> {
		return withGitResult(() => api.gitRevertCommit(cwd, sha, opts));
	},

	resetToCommit(cwd: string, sha: string, mode: "soft" | "mixed" | "hard", confirm = false): Promise<GitOpResult<void>> {
		return withGitResult(() => api.gitResetToCommit(cwd, sha, mode, confirm));
	},

	worktrees(cwd: string): Promise<import("@omp-deck/protocol").GitWorktreeInfo[]> {
		return api.gitWorktrees(cwd).then((r) => (r.ok ? r.worktrees : [])).catch(() => []);
	},

	createWorktree(cwd: string, input: { path: string; mode: "new" | "existing"; branch?: string; startRef?: string }): Promise<GitOpResult<{ head: string; name: string; branch: string; path: string }>> {
		return withGitResult(() => api.gitCreateWorktree(cwd, input));
	},

	deleteWorktree(cwd: string, path: string, opts: { deleteBranch?: boolean; confirm?: boolean } = {}): Promise<GitOpResult<void>> {
		return withGitResult(() => api.gitDeleteWorktree(cwd, path, opts));
	},

	remotes(cwd: string) {
		return api.gitRemotes(cwd).then((r) => (r.ok ? r.remotes : [])).catch(() => []);
	},

	addRemote(cwd: string, name: string, url: string): Promise<GitOpResult<void>> {
		return withGitResult(() => api.gitAddRemote(cwd, name, url));
	},

	removeRemote(cwd: string, name: string): Promise<GitOpResult<void>> {
		return withGitResult(() => api.gitRemoveRemote(cwd, name));
	},

	deleteRemoteBranch(cwd: string, branch: string, remote?: string): Promise<GitOpResult<void>> {
		return withGitResult(() => api.gitDeleteRemoteBranch(cwd, branch, remote));
	},

	globalIdentity() {
		return api.gitGlobalIdentity().catch(() => ({ userName: null, userEmail: null, sshCommand: null }));
	},

	currentIdentity(cwd: string) {
		return api.gitCurrentIdentity(cwd).catch(() => ({ userName: null, userEmail: null, source: "global" as const }));
	},

	setIdentity(cwd: string, profile: { userName: string; userEmail: string; sshKeyPath?: string }): Promise<GitOpResult<void>> {
		return withGitResult(() => api.gitSetIdentity(cwd, profile));
	},

	identities(): Promise<import("@omp-deck/protocol").GitIdentity[]> {
		return api.gitIdentities().then((r) => (r.ok ? r.identities : [])).catch(() => []);
	},

	saveIdentity(identity: import("@omp-deck/protocol").GitIdentity): Promise<GitOpResult<import("@omp-deck/protocol").GitIdentity>> {
		return withGitResult(() => api.gitSaveIdentity(identity));
	},

	deleteIdentity(id: string): Promise<GitOpResult<void>> {
		return withGitResult(() => api.gitDeleteIdentity(id));
	},
};

/**
 * Poll git status on an interval. The hook owns the timer and stops on
 * unmount. The user can manually call `refresh()` to bypass the schedule
 * (used after every successful mutation).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { GitStatusResponse } from "@omp-deck/protocol";

export function useGitStatus(cwd: string, opts: { pollMs?: number; enabled?: boolean } = {}): {
	status: GitStatusResponse | null;
	loading: boolean;
	error: string | null;
	refresh: () => Promise<void>;
} {
	const [status, setStatus] = useState<GitStatusResponse | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const requestId = useRef(0);

	const fetchOnce = useCallback(async () => {
		if (!cwd) return;
		const id = ++requestId.current;
		setLoading(true);
		try {
			const r = await api.gitStatus(cwd);
			if (id !== requestId.current) return;
			setStatus(r);
			setError(null);
		} catch (err) {
			if (id !== requestId.current) return;
			setError((err as Error)?.message ?? "status failed");
		} finally {
			if (id === requestId.current) setLoading(false);
		}
	}, [cwd]);

	const refresh = useCallback(() => fetchOnce(), [fetchOnce]);

	useEffect(() => {
		// Never render status from the previous workspace while the new request
		// is in flight. Invalidating the request id also prevents a late response
		// from the old cwd from replacing the current repository state.
		requestId.current += 1;
		setStatus(null);
		setError(null);
		setLoading(false);
		if (!cwd || opts.enabled === false) return;

		void fetchOnce();
		const pollMs = opts.pollMs ?? 5_000;
		const intervalId = window.setInterval(() => {
			if (document.visibilityState === "visible") void fetchOnce();
		}, pollMs);
		return () => {
			window.clearInterval(intervalId);
			requestId.current += 1;
		};
	}, [cwd, opts.pollMs, opts.enabled, fetchOnce]);

	return { status, loading, error, refresh };
}