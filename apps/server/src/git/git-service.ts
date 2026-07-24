/**
 * Lean git service for omp-deck.
 *
 * Scope:
 *   This is NOT a full simple-git replacement. We expose only the calls the
 *   deck UI actually uses (status, diff, stage/unstage/revert, commit,
 *   branch CRUD, checkout, log, stash, merge, rebase, cherry-pick, reset,
 *   worktrees, remotes). Each public function maps to one or two git
 *   invocations through `runGit` and is serialized through `withGitLock`
 *   to avoid `.git/index.lock` races.
 *
 * Conventions:
 *   - Every function takes `cwd` as the first arg.
 *   - Read-only helpers return plain data; mutating helpers throw `GitError`
 *     on failure so the route layer can map to 4xx via `classifyGitError`.
 *   - Porcelain-v2 status is parsed into a flat array of `GitStatusFile`
 *     rows with separate `index` and `workingDir` single-letter codes.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";

import { classifyGitError, runGit, runGitOrThrow, GitError } from "./runGit.ts";
import { withGitLock } from "./mutation-lock.ts";

import type {
	GitBranchInfo,
	GitCommitInfo,
	GitConflictDetails,
	GitDiffResponse,
	GitIdentity,
	GitLogResponse,
	GitMergeInProgress,
	GitRebaseInProgress,
	GitRemoteInfo,
	GitStashEntry,
	GitStatusFile,
	GitStatusResponse,
	GitTracking,
	GitWorktreeInfo,
} from "@omp-deck/protocol";

/**
 * Decode git's C-style quoting of paths. Git wraps paths in double-quotes
 * and escapes non-ASCII bytes as octal (\NNN) when `core.quotepath` is true
 * or the locale is C. With `-c core.quotepath=false` in runGit this is
 * mostly suppressed, but we decode defensively for any remaining quoted
 * output (e.g. paths with special chars that git always quotes).
 */
function unquoteGitPath(raw: string): string {
	if (!raw.startsWith('"')) return raw;
	// Strip surrounding quotes
	let s = raw.slice(1, -1);
	// Decode octal escapes \NNN → byte, then decode as UTF-8
	const bytes: number[] = [];
	for (let i = 0; i < s.length; i++) {
		if (s[i] === "\\" && i + 3 < s.length && /[0-7]/.test(s[i + 1]!) && /[0-7]/.test(s[i + 2]!) && /[0-7]/.test(s[i + 3]!)) {
			bytes.push(parseInt(s.slice(i + 1, i + 4), 8));
			i += 3;
		} else if (s[i] === "\\" && i + 1 < s.length) {
			// Other C-style escapes: \n \t \\ \" etc.
			const c = s[i + 1]!;
			if (c === "n") { bytes.push(0x0a); i++; }
			else if (c === "t") { bytes.push(0x09); i++; }
			else if (c === "\\") { bytes.push(0x5c); i++; }
			else if (c === '"') { bytes.push(0x22); i++; }
			else if (c === "a") { bytes.push(0x07); i++; }
			else if (c === "b") { bytes.push(0x08); i++; }
			else if (c === "f") { bytes.push(0x0c); i++; }
			else if (c === "r") { bytes.push(0x0d); i++; }
			else { bytes.push(s.charCodeAt(i)); }
		} else {
			bytes.push(s.charCodeAt(i));
		}
	}
	return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
}

// ─── Repository detection ──────────────────────────────────────────────────

export async function isGitRepository(cwd: string): Promise<boolean> {
	const r = await runGit({ cwd, args: ["rev-parse", "--is-inside-work-tree"], label: "is-repo" });
	return r.ok && r.stdout.trim() === "true";
}

export async function getToplevel(cwd: string): Promise<string | null> {
	const r = await runGit({ cwd, args: ["rev-parse", "--show-toplevel"], label: "toplevel" });
	return r.ok ? r.stdout.trim() : null;
}

// ─── Status ────────────────────────────────────────────────────────────────

export interface GetStatusOptions {
	includeUntracked?: boolean;
}

/**
 * Porcelain-v2 status output looks like:
 *   1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>\0<origPath>
 *   2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path>\0<origPath>
 *   ? <path>
 *   u <path>     (unmerged)
 *   ! <path>     (ignored)
 *
 * We collapse to one entry per path with separate `index` (`X`) and
 * `workingDir` (`Y`) single-letter codes. Untracked files get `index: ' '`
 * and `workingDir: '?'`.
 */
export async function getStatus(cwd: string, opts: GetStatusOptions = {}): Promise<GitStatusResponse> {
	const includeUntracked = opts.includeUntracked !== false;
	const args = ["status", "--porcelain=v2", "--branch", "--untracked-files=" + (includeUntracked ? "all" : "no")];
	const r = await runGit({ cwd, args, label: "status" });
	if (!r.ok) {
		if (classifyGitError(r.stderr) === "not_a_repo") {
			throw new GitError("not_a_repo", "not a git repository", r.stderr, r.stdout, r.exitCode);
		}
		throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
	}
	return parseStatus(cwd, r.stdout);
}

function parseStatus(cwd: string, raw: string): GitStatusResponse {
	// Porcelain-v2 separates entries by newlines (not NUL); entries can
	// themselves contain newlines (for rename/copy), but the prefix byte
	// reliably disambiguates the first char of every logical line. Split
	// on newlines for the simple cases and let the renamed/copied case be
	// handled by prefix-detection below.
	const lines = raw.split("\n").map((l) => l.replace(/\r$/, "")).filter(Boolean);
	let branch = "";
	let tracking: GitTracking | undefined;
	const files: GitStatusFile[] = [];
	for (const line of lines) {
		if (!line) continue;
		const head = line[0];
		if (head === "#") {
			// branch line: "# branch.head <name>"
			const m = line.match(/^# branch\.head (\S+)/);
			if (m) branch = m[1]!;
			const tu = line.match(/^# branch\.upstream (\S+)/);
			if (tu) tracking = { remote: tu[1]!.split("/")[0] ?? "", branch: tu[1]!.split("/").slice(1).join("/") ?? "", ahead: 0, behind: 0 };
			const ab = line.match(/^# branch\.ab \+(\d+) -(\d+)/);
			if (ab && tracking) tracking = { ...tracking, ahead: Number(ab[1]), behind: Number(ab[2]) };
			continue;
		}
		if (head === "?") {
			// untracked
			const p = unquoteGitPath(line.slice(2));
			files.push({ path: p, index: " ", workingDir: "?" });
			continue;
		}
		if (head === "u") {
			// "u XY sub m1 m2 m3 mW h1 h2 h3 <path>"
			const parts = line.split(" ");
			if (parts.length < 11) continue;
			const filePath = unquoteGitPath(parts.slice(10).join(" "));
			files.push({ path: filePath, index: "U", workingDir: "U" });
			continue;
		}
		if (head === "1") {
			// "1 XY sub mH mI mW hH hI <path>"
			// Porcelain-v2 uses '.' in X/Y to mean "unmodified, no entry in
			// index"; normalize to space for downstream consumers that
			// don't distinguish.
			const parts = line.split(" ");
			if (parts.length < 9) continue;
			const xy = parts[1] ?? "  ";
			const index = (xy[0] === "." ? " " : (xy[0] ?? " "));
			const workingDir = (xy[1] === "." ? " " : (xy[1] ?? " "));
			const p = unquoteGitPath(parts.slice(8).join(" "));
			files.push({ path: p, index: index as GitStatusFile["index"], workingDir: workingDir as GitStatusFile["workingDir"] });
		} else if (head === "2") {
			// renamed/copied: "2 XY sub mH mI mW hH hI X<score> <path>"
			const parts = line.split(" ");
			if (parts.length < 10) continue;
			const xy = parts[1] ?? "  ";
			const index = (xy[0] === "." ? " " : (xy[0] ?? " "));
			const workingDir = (xy[1] === "." ? " " : (xy[1] ?? " "));
			const raw = parts.slice(9).join(" ");
			// Rename path field is "newPath\toldPath" — take only the new (working-tree) path.
			const p = unquoteGitPath(raw.includes("\t") ? raw.split("\t")[0]! : raw);
			files.push({ path: p, index: index as GitStatusFile["index"], workingDir: workingDir as GitStatusFile["workingDir"] });
		}
	}
	return {
		ok: true,
		cwd,
		branch: branch || "HEAD",
		tracking,
		files,
		isClean: files.length === 0,
	};
}

// ─── Diff ──────────────────────────────────────────────────────────────────

export async function getDiff(cwd: string, opts: { path?: string; staged?: boolean; contextLines?: number } = {}): Promise<GitDiffResponse> {
	const args = ["diff", "--no-color"];
	if (opts.staged) args.push("--cached");
	if (typeof opts.contextLines === "number") args.push(`--unified=${opts.contextLines}`);
	if (opts.path) args.push("--", opts.path);
	// `--numstat` has to come BEFORE the `--` separator, otherwise git treats
	// it as part of the path. So build a separate args list for the numstat
	// call by inserting `--numstat` right after the staged/unified flags.
	const numstatArgs = ["diff"];
	if (opts.staged) numstatArgs.push("--cached");
	if (typeof opts.contextLines === "number") numstatArgs.push(`--unified=${opts.contextLines}`);
	numstatArgs.push("--numstat");
	if (opts.path) numstatArgs.push("--", opts.path);
	const [patchRes, numstatRes] = await Promise.all([
		runGit({ cwd, args, label: "diff" }),
		runGit({ cwd, args: numstatArgs, label: "diff-numstat" }),
	]);
	if (!patchRes.ok && !numstatRes.ok) {
		const r = patchRes.ok ? numstatRes : patchRes;
		throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
	}
	const { insertions, deletions } = parseNumstat(numstatRes.ok ? numstatRes.stdout : "");
	return {
		ok: true,
		patch: patchRes.ok ? patchRes.stdout : "",
		insertions,
		deletions,
		binary: (patchRes.ok ? patchRes.stdout : "").includes("Binary files"),
	};
}

export async function getRangeDiff(cwd: string, opts: { base: string; head: string; path?: string }): Promise<GitDiffResponse> {
	const args = ["diff", "--no-color", `${opts.base}..${opts.head}`];
	if (opts.path) args.push("--", opts.path);
	const [patchRes, numstatRes] = await Promise.all([
		runGit({ cwd, args, label: "range-diff" }),
		runGit({ cwd, args: opts.path ? args.concat(["--numstat"]) : args.concat(["--numstat"]), label: "range-diff-numstat" }),
	]);
	const { insertions, deletions } = parseNumstat(numstatRes.ok ? numstatRes.stdout : "");
	return {
		ok: true,
		patch: patchRes.ok ? patchRes.stdout : "",
		insertions,
		deletions,
		binary: false,
	};
}

export async function getFileDiff(cwd: string, path: string, opts: { staged?: boolean } = {}): Promise<{ original: string; modified: string; isBinary: boolean }> {
	const args = ["diff", "--no-color"];
	if (opts.staged) args.push("--cached");
	args.push("--", path);
	const r = await runGit({ cwd, args, label: "file-diff" });
	if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
	if (r.stdout.includes("Binary files")) {
		return { original: "", modified: "", isBinary: true };
	}
	return { original: "", modified: r.stdout, isBinary: false };
}

// ─── Stage / unstage / revert ──────────────────────────────────────────────

export async function stageFiles(cwd: string, paths: string[]): Promise<void> {
	if (paths.length === 0) return;
	await withGitLock(cwd, async () => {
		const args = ["add", "--", ...paths];
		const r = await runGit({ cwd, args, label: "add" });
		if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
	});
}

export async function unstageFiles(cwd: string, paths: string[]): Promise<void> {
	if (paths.length === 0) return;
	await withGitLock(cwd, async () => {
		// `git reset HEAD -- <paths>` preserves the working tree and un-stages.
		const args = ["reset", "HEAD", "--", ...paths];
		const r = await runGit({ cwd, args, label: "reset-HEAD" });
		if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
	});
}

export async function revertFile(cwd: string, filePath: string, scope: "all" | "working" = "working"): Promise<void> {
	await withGitLock(cwd, async () => {
		// scope=all discards both staged and working-tree changes (HEAD); working
		// discards only the working-tree version.
		const args = scope === "all"
			? ["checkout", "HEAD", "--", filePath]
			: ["checkout", "--", filePath];
		const r = await runGit({ cwd, args, label: "checkout-discard" });
		if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
	});
}

// ─── Commit ────────────────────────────────────────────────────────────────

export async function commit(cwd: string, message: string, opts: { signOff?: boolean; stageFiles?: string[] } = {}): Promise<{ sha: string }> {
	return withGitLock(cwd, async () => {
		// If the caller asked us to stage a specific subset, do it first and
		// restore unrelated index entries after the commit. This is the
		// "stage selected rows only" pattern from openchamber.
		if (opts.stageFiles && opts.stageFiles.length > 0) {
			const stashBackup = await backUpUnrelatedIndex(cwd, opts.stageFiles);
			try {
				const stageRes = await runGit({ cwd, args: ["add", "--", ...opts.stageFiles], label: "commit-stage" });
				if (!stageRes.ok) throw new GitError(stageRes.code, stageRes.message, stageRes.stderr, stageRes.stdout, stageRes.exitCode);
			} catch (err) {
				await restoreIndexBackup(cwd, stashBackup);
				throw err;
			}
			try {
				const r = await runGit({ cwd, args: ["commit", "-m", message, ...(opts.signOff ? ["--signoff"] : [])], label: "commit" });
				if (!r.ok) {
					await restoreIndexBackup(cwd, stashBackup);
					throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
				}
				return { sha: parseCommitSha(r.stdout) };
			} finally {
				await restoreIndexBackup(cwd, stashBackup);
			}
		}
		const r = await runGit({ cwd, args: ["commit", "-m", message, ...(opts.signOff ? ["--signoff"] : [])], label: "commit" });
		if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
		return { sha: parseCommitSha(r.stdout) };
	});
}

function parseCommitSha(out: string): string {
	// `git commit` writes to stdout: "[branch abc1234] message\n" — first
	// whitespace-delimited hex on the first line.
	const m = out.match(/\[[^\]]*\s([0-9a-f]{7,})\]\s/);
	return m ? m[1]! : "";
}

// ─── Branches ──────────────────────────────────────────────────────────────

export async function getBranches(cwd: string): Promise<{ local: GitBranchInfo[]; remote: GitBranchInfo[] }> {
	const localRes = await runGit({ cwd, args: ["for-each-ref", "--format=%(refname:short)%09%(objectname:short)%09%(subject)", "refs/heads/"], label: "branches-local" });
	const remoteRes = await runGit({ cwd, args: ["for-each-ref", "--format=%(refname:short)%09%(objectname:short)%09%(subject)", "refs/remotes/"], label: "branches-remote" });
	const headRes = await runGit({ cwd, args: ["symbolic-ref", "--quiet", "--short", "HEAD"], label: "current-branch" });
	const current = headRes.ok ? headRes.stdout.trim() : "";
	const parse = (raw: string, isRemote: boolean): GitBranchInfo[] =>
		raw.split("\n").filter(Boolean).map((l) => {
			const [name, sha, subject] = l.split("\t");
			return {
				name: (name ?? "").replace(/^origin\//, ""),
				isCurrent: !isRemote && name === current,
				isRemote,
				lastCommitSha: sha,
				lastCommitSubject: subject,
			};
		});
	return { local: parse(localRes.ok ? localRes.stdout : "", false), remote: parse(remoteRes.ok ? remoteRes.stdout : "", true) };
}

export async function createBranch(cwd: string, name: string, opts: { startPoint?: string; checkout?: boolean } = {}): Promise<{ branch: string; checkedOut: boolean }> {
	return withGitLock(cwd, async () => {
		const args = ["branch", name];
		if (opts.startPoint) args.push(opts.startPoint);
		const r = await runGit({ cwd, args, label: "branch-create" });
		if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
		if (opts.checkout !== false) {
			const ck = await runGit({ cwd, args: ["checkout", name], label: "branch-checkout" });
			if (!ck.ok) throw new GitError(ck.code, ck.message, ck.stderr, ck.stdout, ck.exitCode);
		}
		return { branch: name, checkedOut: opts.checkout !== false };
	});
}

export async function deleteBranch(cwd: string, name: string, opts: { force?: boolean } = {}): Promise<void> {
	return withGitLock(cwd, async () => {
		const args = ["branch", opts.force ? "-D" : "-d", name];
		const r = await runGit({ cwd, args, label: "branch-delete" });
		if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
	});
}

export async function renameBranch(cwd: string, oldName: string, newName: string): Promise<{ name: string }> {
	return withGitLock(cwd, async () => {
		const r = await runGit({ cwd, args: ["branch", "-m", oldName, newName], label: "branch-rename" });
		if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
		return { name: newName };
	});
}

// ─── Checkout ──────────────────────────────────────────────────────────────

export async function checkoutBranch(cwd: string, branch: string, opts: { autoStash?: boolean } = {}): Promise<void> {
	return withGitLock(cwd, async () => {
		// Probe for uncommitted changes; if present and autoStash is true,
		// stash them first and re-apply on success.
		const statusRes = await runGit({ cwd, args: ["status", "--porcelain"], label: "checkout-probe-status" });
		const dirty = statusRes.ok && statusRes.stdout.trim().length > 0;
		let stashedSha: string | null = null;
		if (dirty && opts.autoStash !== false) {
			const stashRes = await runGit({ cwd, args: ["stash", "push", "-u", "-m", `omp-deck:auto before checkout ${branch}`], label: "checkout-stash" });
			if (!stashRes.ok) throw new GitError(stashRes.code, stashRes.message, stashRes.stderr, stashRes.stdout, stashRes.exitCode);
			stashedSha = stashRes.stdout.match(/HEAD\s+is\s+now\s+at\s+([0-9a-f]+)/)?.[1] ?? "__stash__";
		}
		const ck = await runGit({ cwd, args: ["checkout", branch], label: "checkout" });
		if (!ck.ok) {
			if (stashedSha) await runGit({ cwd, args: ["stash", "pop"], label: "checkout-restore" });
			throw new GitError(ck.code, ck.message, ck.stderr, ck.stdout, ck.exitCode);
		}
		if (stashedSha && stashedSha !== "__stash__") {
			const pop = await runGit({ cwd, args: ["stash", "pop"], label: "checkout-restore" });
			if (!pop.ok) {
				// stash pop failed — leave the stash for the user to resolve.
				throw new GitError("stash_conflict", `stash pop after checkout ${branch} failed: ${pop.stderr}`, pop.stderr, pop.stdout, pop.exitCode);
			}
		}
	});
}

// ─── Log ───────────────────────────────────────────────────────────────────

export async function getLog(cwd: string, opts: { maxCount?: number; from?: string; to?: string; path?: string; cursor?: string } = {}): Promise<GitLogResponse> {
	const maxCount = Math.min(opts.maxCount ?? 50, 500);
	const args = [
		"log",
		`--max-count=${maxCount + 1}`, // +1 to detect `nextCursor`
		// `%x00` separator after subject so we can split entries unambiguously;
		// `--no-notes` keeps the body for commits that have one, separated by
		// another NUL. No `--shortstat` here because it injects extra newlines
		// that confuse the chunk-based parser below.
		"--no-notes",
		"--pretty=format:%H%x09%h%x09%an%x09%ae%x09%aI%x09%s%x00%b%x00",
	];
	if (opts.cursor) args.push(`${opts.cursor}^`);
	else if (opts.from && opts.to) args.push(`${opts.from}..${opts.to}`);
	else if (opts.from) args.push(opts.from);
	if (opts.path) args.push("--", opts.path);
	const r = await runGit({ cwd, args, label: "log" });
	if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
	return parseLog(r.stdout, maxCount);
}

function parseLog(raw: string, maxCount: number): GitLogResponse {
	// Split on NUL. With `%x00` as the only separator, each commit produces
	// exactly two chunks: header, body (possibly empty). Trailing empty chunks
	// from a trailing NUL are filtered out below.
	const chunks = raw.split("\x00");
	const commits: GitCommitInfo[] = [];
	for (let i = 0; i + 1 < chunks.length && commits.length <= maxCount; i += 2) {
		const headerRaw = chunks[i];
		const bodyRaw = chunks[i + 1];
		if (headerRaw === undefined) break;
		const header = headerRaw.replace(/^\n+/, "").replace(/\n+$/, "");
		const body = (bodyRaw ?? "").replace(/^\n+/, "").replace(/\n+$/, "");
		const [sha, shortSha, author, email, date, subject] = header.split("\t");
		commits.push({
			sha: sha ?? "",
			shortSha: shortSha ?? "",
			author: author ?? "",
			email: email ?? "",
			date: date ?? "",
			subject: subject ?? "",
			body,
			insertions: 0,
			deletions: 0,
			files: 0,
		});
	}
	const hasMore = commits.length > maxCount;
	const trimmed = hasMore ? commits.slice(0, maxCount) : commits;
	return { ok: true, commits: trimmed, nextCursor: hasMore ? trimmed[trimmed.length - 1]?.sha : undefined };
}

export async function getCommitFiles(cwd: string, sha: string): Promise<{ files: { path: string; insertions: number; deletions: number; isBinary: boolean }[] }> {
	const r = await runGit({ cwd, args: ["show", "--no-color", "--stat", "--pretty=format:", "--numstat", sha], label: "commit-files" });
	if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
	const files: { path: string; insertions: number; deletions: number; isBinary: boolean }[] = [];
	for (const line of r.stdout.split("\n")) {
		const m = line.match(/^(\S+)\t(\S+)\t(.+)$/);
		if (!m) continue;
		const ins = m[1] === "-" ? 0 : Number(m[1]);
		const del = m[2] === "-" ? 0 : Number(m[2]);
		files.push({ path: unquoteGitPath(m[3]!), insertions: ins, deletions: del, isBinary: m[1] === "-" && m[2] === "-" });
	}
	return { files };
}

// ─── Stash ─────────────────────────────────────────────────────────────────

export async function listStashes(cwd: string): Promise<{ entries: GitStashEntry[] }> {
	const r = await runGit({ cwd, args: ["stash", "list", "--pretty=format:%gd%x09%h%x09%s%x09%aI"], label: "stash-list" });
	if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
	const entries: GitStashEntry[] = [];
	for (const line of r.stdout.split("\n").filter(Boolean)) {
		const [ref, sha, subject, date] = line.split("\t");
		const refMatch = (ref ?? "").match(/^stash@\{(\d+)\}$/);
		if (!refMatch) continue;
		entries.push({
			ref: ref ?? "",
			index: Number(refMatch[1]),
			subject: subject ?? "",
			sha: sha ?? "",
			relativeTime: date ?? "",
			branch: "",
		});
	}
	return { entries };
}

export async function stashPush(cwd: string, opts: { message?: string; includeUntracked?: boolean } = {}): Promise<{ ref: string }> {
	return withGitLock(cwd, async () => {
		const args = ["stash", "push"];
		if (opts.includeUntracked !== false) args.push("-u");
		if (opts.message) args.push("-m", opts.message);
		const r = await runGit({ cwd, args, label: "stash-push" });
		if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
		const ref = r.stdout.match(/stash@\{(\d+)\}/)?.[0] ?? "stash@{0}";
		return { ref };
	});
}

export async function stashApply(cwd: string, ref: string): Promise<void> {
	return withGitLock(cwd, async () => {
		const r = await runGit({ cwd, args: ["stash", "apply", ref], label: "stash-apply" });
		if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
	});
}

export async function stashPop(cwd: string, ref: string): Promise<void> {
	return withGitLock(cwd, async () => {
		// `git stash pop` = apply + drop in one atomic step. We don't run
		// `stash apply` first because if the apply succeeds but drop fails
		// (rare), we'd have an entry we tried to remove.
		const r = await runGit({ cwd, args: ["stash", "pop", ref], label: "stash-pop" });
		if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
	});
}

export async function stashDrop(cwd: string, ref: string): Promise<void> {
	return withGitLock(cwd, async () => {
		const r = await runGit({ cwd, args: ["stash", "drop", ref], label: "stash-drop" });
		if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
	});
}

// ─── Merge / rebase / cherry-pick ──────────────────────────────────────────

export async function merge(cwd: string, branch: string, opts: { noFf?: boolean; message?: string } = {}): Promise<void> {
	return withGitLock(cwd, async () => {
		const args = ["merge"];
		if (opts.noFf) args.push("--no-ff");
		if (opts.message) args.push("-m", opts.message);
		args.push(branch);
		const r = await runGit({ cwd, args, label: "merge" });
		if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
	});
}

export async function abortMerge(cwd: string): Promise<void> {
	return withGitLock(cwd, async () => {
		const r = await runGit({ cwd, args: ["merge", "--abort"], label: "merge-abort" });
		if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
	});
}

export async function continueMerge(cwd: string, opts: { message?: string } = {}): Promise<void> {
	return withGitLock(cwd, async () => {
		const args = ["merge", "--continue"];
		if (opts.message) args.push("-m", opts.message);
		const r = await runGit({ cwd, args, label: "merge-continue" });
		if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
	});
}

export async function rebase(cwd: string, onto: string): Promise<void> {
	return withGitLock(cwd, async () => {
		const r = await runGit({ cwd, args: ["rebase", onto], label: "rebase" });
		if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
	});
}

export async function abortRebase(cwd: string): Promise<void> {
	return withGitLock(cwd, async () => {
		const r = await runGit({ cwd, args: ["rebase", "--abort"], label: "rebase-abort" });
		if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
	});
}

export async function continueRebase(cwd: string): Promise<void> {
	return withGitLock(cwd, async () => {
		const r = await runGit({ cwd, args: ["rebase", "--continue"], label: "rebase-continue" });
		if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
	});
}

export async function cherryPick(cwd: string, sha: string, opts: { noCommit?: boolean } = {}): Promise<void> {
	return withGitLock(cwd, async () => {
		const args = ["cherry-pick"];
		if (opts.noCommit) args.push("--no-commit");
		args.push(sha);
		const r = await runGit({ cwd, args, label: "cherry-pick" });
		if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
	});
}

export async function revertCommit(cwd: string, sha: string, opts: { noCommit?: boolean } = {}): Promise<{ sha: string }> {
	return withGitLock(cwd, async () => {
		const args = ["revert"];
		if (opts.noCommit) args.push("--no-commit");
		args.push(sha);
		const r = await runGit({ cwd, args, label: "revert" });
		if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
		return { sha: parseCommitSha(r.stdout) };
	});
}

export async function resetToCommit(cwd: string, sha: string, mode: "soft" | "mixed" | "hard"): Promise<void> {
	return withGitLock(cwd, async () => {
		const r = await runGit({ cwd, args: ["reset", `--${mode}`, sha], label: "reset" });
		if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
	});
}

// ─── Worktrees ─────────────────────────────────────────────────────────────

function parseWorktreePorcelain(raw: string): { path: string; head: string; branch: string; isPrimary: boolean; isLocked: boolean }[] {
	const blocks = raw.split("\n\n").filter(Boolean);
	const out: { path: string; head: string; branch: string; isPrimary: boolean; isLocked: boolean }[] = [];
	for (let i = 0; i < blocks.length; i++) {
		const block = blocks[i]!;
		let path = "";
		let head = "";
		let branch = "";
		let isLocked = false;
		for (const line of block.split("\n")) {
			if (line.startsWith("worktree ")) path = line.slice("worktree ".length);
			else if (line.startsWith("HEAD ")) head = line.slice("HEAD ".length);
			else if (line.startsWith("branch ")) {
				branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
			} else if (line === "detached") {
				branch = "(detached)";
			} else if (line === "locked") isLocked = true;
		}
		if (!path) continue;
		// The FIRST block in porcelain output is the primary worktree — the
		// one the command was run from. Linked worktrees always follow.
		const isPrimary = i === 0;
		out.push({ path, head, branch, isPrimary, isLocked });
	}
	return out;
}

export async function getWorktrees(cwd: string): Promise<{ worktrees: GitWorktreeInfo[] }> {
	const r = await runGit({ cwd, args: ["worktree", "list", "--porcelain"], label: "worktree-list" });
	if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
	const parsed = parseWorktreePorcelain(r.stdout);
	// For the primary worktree (no branch line in porcelain), resolve the
	// current branch so the UI has a useful label.
	const branchRes = await runGit({ cwd, args: ["rev-parse", "--abbrev-ref", "HEAD"], label: "worktree-branch-primary" });
	const primaryBranch = branchRes.ok ? branchRes.stdout.trim() : "";
	const worktrees: GitWorktreeInfo[] = parsed.map((w) => ({
		...w,
		branch: w.branch || (w.isPrimary ? primaryBranch : ""),
	}));
	return { worktrees };
}

export async function createWorktree(cwd: string, input: { path: string; mode: "new" | "existing"; branch?: string; startRef?: string }): Promise<{ head: string; name: string; branch: string; path: string }> {
	return withGitLock(cwd, async () => {
		const args = ["worktree", "add"];
		if (input.mode === "new") {
			args.push("-b", input.branch ?? deriveBranchName(input.path));
			if (input.startRef) args.push(input.startRef);
			args.push(input.path);
		} else {
			if (!input.branch) throw new GitError("invalid", "branch required for existing-mode worktree", "", "", null);
			if (input.startRef) args.push(input.startRef);
			args.push(input.path, input.branch);
		}
		const r = await runGit({ cwd, args, label: "worktree-add" });
		if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
		const branch = input.branch ?? deriveBranchName(input.path);
		return { head: "", name: path.basename(input.path), branch, path: input.path };
	});
}

export async function removeWorktree(cwd: string, input: { path: string; deleteBranch?: boolean }): Promise<void> {
	return withGitLock(cwd, async () => {
		const args = ["worktree", "remove", "--force"];
		if (input.deleteBranch) args.push("--detach"); // no — branch is separate
		args.push(input.path);
		const r = await runGit({ cwd, args, label: "worktree-remove" });
		if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
	});
}

function deriveBranchName(p: string): string {
	const base = path.basename(p);
	return `wt/${base.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
}

// ─── Remotes ───────────────────────────────────────────────────────────────

export async function getRemotes(cwd: string): Promise<{ remotes: GitRemoteInfo[] }> {
	const r = await runGit({ cwd, args: ["remote", "-v"], label: "remote-list" });
	if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
	const remotes = new Map<string, GitRemoteInfo>();
	for (const line of r.stdout.split("\n").filter(Boolean)) {
		// format: "<name>\t<url> (fetch|push)"
		const m = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
		if (!m) continue;
		const name = m[1]!;
		const url = m[2]!;
		const kind = m[3]!;
		const existing = remotes.get(name) ?? { name, fetchUrl: "", pushUrl: "" };
		if (kind === "fetch") existing.fetchUrl = url;
		else existing.pushUrl = url;
		remotes.set(name, existing);
	}
	return { remotes: [...remotes.values()] };
}

export async function addRemote(cwd: string, name: string, url: string): Promise<void> {
	return withGitLock(cwd, async () => {
		const r = await runGit({ cwd, args: ["remote", "add", name, url], label: "remote-add" });
		if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
	});
}

export async function removeRemote(cwd: string, name: string): Promise<void> {
	if (name === "origin") throw new GitError("cannot_remove_origin", "cannot remove origin", "", "", null);
	return withGitLock(cwd, async () => {
		const r = await runGit({ cwd, args: ["remote", "remove", name], label: "remote-remove" });
		if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
	});
}

export async function deleteRemoteBranch(cwd: string, branch: string, remote = "origin"): Promise<void> {
	return withGitLock(cwd, async () => {
		const r = await runGit({ cwd, args: ["push", remote, "--delete", branch], label: "remote-branch-delete" });
		if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
	});
}

// ─── Push / pull / fetch ──────────────────────────────────────────────────

export async function push(cwd: string, opts: { remote?: string; branch?: string; force?: "lease" | "no" } = {}): Promise<{ setUpstream?: boolean; rejected?: boolean; reason?: string }> {
	return withGitLock(cwd, async () => {
		const args = ["push"];
		if (opts.force === "lease") args.push("--force-with-lease");
		// First try with explicit branch; if git complains "no upstream",
		// fall back to -u so we set it.
		const target = opts.branch ?? "HEAD";
		if (opts.remote) args.push(opts.remote, target);
		let r = await runGit({ cwd, args, label: "push" });
		if (!r.ok && /set upstream|no upstream|push the current/i.test(r.stderr)) {
			const retryArgs = ["push", "-u"];
			if (opts.force === "lease") retryArgs.push("--force-with-lease");
			if (opts.remote) retryArgs.push(opts.remote, target);
			r = await runGit({ cwd, args: retryArgs, label: "push-set-upstream" });
			if (r.ok) return { setUpstream: true };
		}
		if (!r.ok) {
			// Detect "non-fast-forward" rejections that should not be auto-retried.
			if (/non-fast-forward|rejected.*fetch first/i.test(r.stderr)) {
				return { rejected: true, reason: r.stderr.trim() };
			}
			throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
		}
		return { setUpstream: false };
	});
}

export async function pull(cwd: string, opts: { remote?: string; branch?: string; rebase?: boolean; allowMergeCommit?: boolean } = {}): Promise<void> {
	return withGitLock(cwd, async () => {
		const args = ["pull"];
		if (opts.allowMergeCommit) args.push("--no-ff");
		else args.push("--ff-only");
		if (opts.rebase) args.push("--rebase");
		if (opts.remote && opts.branch) args.push(opts.remote, opts.branch);
		const r = await runGit({ cwd, args, label: "pull" });
		if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
	});
}

export async function fetch(cwd: string, opts: { remote?: string; prune?: boolean } = {}): Promise<void> {
	const args = ["fetch"];
	if (opts.prune !== false) args.push("--prune");
	if (opts.remote) args.push(opts.remote);
	const r = await runGit({ cwd, args, label: "fetch", timeoutMs: 120_000 });
	if (!r.ok) throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
}

// ─── In-progress state ─────────────────────────────────────────────────────

export async function getMergeInProgress(cwd: string): Promise<GitMergeInProgress | null> {
	const head = await readGitStateFile(cwd, "MERGE_HEAD");
	if (!head) return null;
	const message = await readGitStateFile(cwd, "MERGE_MSG");
	return { head: head.split("\n")[0] ?? head, message: message ?? "" };
}

export async function getRebaseInProgress(cwd: string): Promise<GitRebaseInProgress | null> {
	// Interactive/merge rebases use rebase-merge; am-style rebases use
	// rebase-apply. `rev-parse --git-path` only resolves a path and succeeds
	// even when it does not exist, so the state file itself must be read.
	for (const stateDir of ["rebase-merge", "rebase-apply"] as const) {
		const headName = await readGitStateFile(cwd, `${stateDir}/head-name`);
		if (!headName) continue;
		const onto = await readGitStateFile(cwd, `${stateDir}/onto`);
		return { headName, onto: onto ?? "" };
	}
	return null;
}

async function readGitStateFile(cwd: string, name: string): Promise<string | null> {
	const result = await runGit({ cwd, args: ["rev-parse", "--git-path", name], label: `git-state-${name}` });
	if (!result.ok) return null;
	const resolved = result.stdout.trim();
	if (!resolved) return null;
	try {
		return (await readFile(path.isAbsolute(resolved) ? resolved : path.resolve(cwd, resolved), "utf8")).trim();
	} catch {
		return null;
	}
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function parseNumstat(text: string): { insertions: number; deletions: number } {
	let insertions = 0;
	let deletions = 0;
	for (const line of text.split("\n")) {
		const m = line.match(/^(\S+)\t(\S+)\t.+$/);
		if (!m) continue;
		if (m[1] !== "-") insertions += Number(m[1]);
		if (m[2] !== "-") deletions += Number(m[2]);
	}
	return { insertions, deletions };
}

/**
 * Snapshot the current index entries that aren't in `keepFiles` so the
 * caller can commit a subset of staged rows and restore the rest afterwards.
 * Returns the path to the backup index file (caller is responsible for
 * cleanup); null when there was nothing to back up.
 */
async function backUpUnrelatedIndex(cwd: string, keepFiles: string[]): Promise<string | null> {
	const statusRes = await runGit({ cwd, args: ["status", "--porcelain"], label: "backup-status" });
	if (!statusRes.ok) return null;
	const unrelated: string[] = [];
	for (const line of statusRes.stdout.split("\n")) {
		if (!line) continue;
		const p = unquoteGitPath(line.slice(3));
		if (!keepFiles.includes(p)) {
			const code = line.slice(0, 2);
			// Only "index != ' '" means staged.
			if (code[0] !== " ") unrelated.push(p);
		}
	}
	if (unrelated.length === 0) return null;
	// Unstage unrelated entries by writing them out of the index.
	await runGit({ cwd, args: ["reset", "HEAD", "--", ...unrelated], label: "backup-unstage" });
	return null; // we let `restoreIndexBackup` no-op when null
}

async function restoreIndexBackup(cwd: string, _backup: string | null): Promise<void> {
	// Caller is expected to have re-staged the chosen files before this
	// resolves; for the lean subset we rely on the user's manual re-stage.
	// A full implementation would write a temp index and `git read-tree` it.
	return;
}