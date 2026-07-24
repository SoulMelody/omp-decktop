/**
 * Single source of truth for every `git` invocation. All git commands funnel
 * through `runGit` so we get one consistent env, one timeout policy, and one
 * error-mapping path. Mirrors `hermes-webui`'s `_run_git` helper and
 * openchamber's `runGitCommand` / `runGitCommandOrThrow`.
 *
 * Behaviour notes:
 *   - LC_ALL=C + GIT_TERMINAL_PROMPT=0: keeps output stable for parsing and
 *     prevents git from blocking on credential prompts (which would deadlock
 *     the request thread).
 *   - Timeouts abort the process group; the partial output so far is kept
 *     so callers can surface "killed by timeout" alongside any buffered text.
 *   - Errors are mapped to a `GitError` with a stable `code` string so the
 *     route layer can branch on `code === 'not-a-repo'` / `'conflict'` / etc.
 *     without parsing git's localized prose.
 */

import { spawn } from "node:child_process";
import { logger } from "../log.ts";

const log = logger("git");

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 600_000;
const MIN_TIMEOUT_MS = 100;

export interface RunGitOptions {
	cwd: string;
	/** Args after `git`. Always pass them as an array — never a single shell string. */
	args: string[];
	/** Hard timeout in ms. Default 30s; max 600s. */
	timeoutMs?: number;
	/** Override env. Defaults to a hardened git-friendly env. */
	env?: Record<string, string>;
	/** Optional label for log lines. */
	label?: string;
	/** When true, stdin is piped so callers can write to it; default false. */
	stdinPiped?: boolean;
}

export interface RunGitOk {
	ok: true;
	stdout: string;
	stderr: string;
	exitCode: number;
}

export interface RunGitErr {
	ok: false;
	code: string;
	message: string;
	stdout: string;
	stderr: string;
	exitCode: number | null;
}

export type RunGitResult = RunGitOk | RunGitErr;

export class GitError extends Error {
	readonly code: string;
	readonly stderr: string;
	readonly stdout: string;
	readonly exitCode: number | null;

	constructor(code: string, message: string, stderr: string, stdout: string, exitCode: number | null) {
		super(message);
		this.code = code;
		this.stderr = stderr;
		this.stdout = stdout;
		this.exitCode = exitCode;
	}
}

/**
 * Run `git <args>` in `cwd` and return the result. Never throws — failures
 * are returned as `{ ok: false, code, message, ... }`. Use `runGitOrThrow`
 * when the caller prefers an exception.
 */
export function runGit(opts: RunGitOptions): Promise<RunGitResult> {
	return new Promise<RunGitResult>((resolve) => {
		const timeoutMs = clampTimeout(opts.timeoutMs);
		const env = buildEnv(opts.env);

		const proc = spawn("git", ["-c", "core.quotepath=false", ...opts.args], {
			cwd: opts.cwd,
			env,
			stdio: ["pipe", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";
		let resolved = false;
		const done = (r: RunGitResult) => {
			if (resolved) return;
			resolved = true;
			resolve(r);
		};

		proc.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString("utf-8");
		});
		proc.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString("utf-8");
		});
		proc.on("error", (err) => {
			done({
				ok: false,
				code: classifySpawnError(err),
				message: err.message,
				stdout,
				stderr,
				exitCode: null,
			});
		});

		const timer = setTimeout(() => {
			try {
				proc.kill("SIGKILL");
			} catch {
				/* already dead */
			}
			done({
				ok: false,
				code: "timeout",
				message: `git ${opts.label ?? opts.args.join(" ")} timed out after ${timeoutMs}ms`,
				stdout,
				stderr,
				exitCode: null,
			});
		}, timeoutMs);

		proc.on("close", (code) => {
			clearTimeout(timer);
			const exitCode = typeof code === "number" ? code : null;
			if (exitCode === 0) {
				done({ ok: true, stdout, stderr, exitCode });
				return;
			}
			const errCode = classifyGitError(stderr, opts.args);
			log.warn(
				`git ${opts.label ?? opts.args[0] ?? ""} failed: code=${errCode} exit=${exitCode} stderr="${stderr.slice(0, 200)}"`,
			);
			done({
				ok: false,
				code: errCode,
				message: stderr.trim() || `git exited with code ${exitCode}`,
				stdout,
				stderr,
				exitCode,
			});
		});
	});
}

/**
 * Variant that throws `GitError` on failure. Convenient for internal helpers
 * that already know they want exception-style error handling.
 */
export async function runGitOrThrow(opts: RunGitOptions): Promise<RunGitOk> {
	const r = await runGit(opts);
	if (r.ok) return r;
	throw new GitError(r.code, r.message, r.stderr, r.stdout, r.exitCode);
}

/**
 * Map a git error string to a stable code that the rest of the server can
 * branch on without parsing localized prose. The list mirrors the codes
 * hermes-webui surfaces in `workspace_git.py._classify_git_error`.
 */
export function classifyGitError(stderr: string, args: string[] = []): string {
	const s = (stderr || "").toLowerCase();
	if (!stderr.trim()) return "git_failed";
	if (s.includes("not a git repository")) return "not_a_repo";
	if (s.includes("permission denied")) return "permission_denied";
	if (s.includes("merge conflict")) return "conflict";
	if (s.includes("rebase in progress")) return "rebase_in_progress";
	if (s.includes("merge in progress")) return "merge_in_progress";
	if (s.includes("nothing to commit")) return "nothing_to_commit";
	if (s.includes("no such file or directory")) return "path_not_found";
	if (s.includes("already exists") || s.includes("already up to date")) return "already_exists";
	if (s.includes("not fully merged") || s.includes("not merged")) return "branch_unmerged";
	if (s.includes("could not read username") || s.includes("terminal prompts disabled")) return "auth_required";
	if (s.includes("connection refused") || s.includes("could not resolve host")) return "network_error";
	if (args[0] === "checkout" && s.includes("your local changes")) return "dirty_worktree";
	return "git_failed";
}

function classifySpawnError(err: NodeJS.ErrnoException): string {
	if (err.code === "ENOENT") return "git_not_installed";
	if (err.code === "EACCES") return "permission_denied";
	return "spawn_failed";
}

function buildEnv(extra?: Record<string, string>): Record<string, string> {
	const base: Record<string, string> = {
		...process.env,
		LC_ALL: "C",
		LANG: "C",
		GIT_TERMINAL_PROMPT: "0",
		GIT_OPTIONAL_LOCKS: "0",
		// Prevent ssh-agent issues from blocking — let SSH fall back to keys.
		GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? "ssh -o BatchMode=yes",
	};
	if (extra) {
		for (const [k, v] of Object.entries(extra)) base[k] = v;
	}
	return base;
}

function clampTimeout(raw: number | undefined): number {
	if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return DEFAULT_TIMEOUT_MS;
	return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, Math.trunc(raw)));
}