/**
 * Background command runner for `POST /fs/exec` and `GET /fs/exec/:jobId`.
 *
 * Mirrors the exec-job pattern from openchamber's `routes.js` execJobs
 * (in-memory map with TTL pruning). Jobs are intentionally *not* persisted
 * — a server restart abandons any in-flight jobs and surfaces them as
 * `cancelled` to clients on their next poll.
 *
 * Security: the runner is OFF by default and gated by `config.enableFsExec`.
 * Even when on, args are passed as a separate argv array to `Bun.spawn` so
 * shell metacharacters can't be smuggled in through a single command string.
 */

import { randomUUID } from "node:crypto";
import { logger } from "./log.ts";

const log = logger("fs-exec");

export interface RunJobOptions {
	cwd: string;
	cmd: string;
	args?: string[];
	timeoutMs?: number;
	label?: string;
}

export type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export interface JobRecord {
	jobId: string;
	status: JobStatus;
	stdout: string;
	stderr: string;
	exitCode: number | null;
	startedAt: number;
	finishedAt: number | null;
	label?: string;
	error?: string;
}

const MAX_BUFFER_BYTES = 256 * 1024;
const MAX_TIMEOUT_MS = 600_000;
const MIN_TIMEOUT_MS = 100;
const DEFAULT_TIMEOUT_MS = 30_000;
/** Prune jobs older than 1 hour. */
const JOB_TTL_MS = 60 * 60 * 1000;

const jobs = new Map<string, JobRecord>();

/**
 * Start a background command. Returns immediately with a `jobId` that the
 * client can poll. The command runs with the supplied `cwd`; stdout/stderr
 * are buffered (UTF-8, truncated at 256 KB) and surfaced in `getJob`.
 */
export function runJob(opts: RunJobOptions): { jobId: string } {
	const jobId = `exec_${randomUUID()}`;
	const timeoutMs = clampTimeout(opts.timeoutMs);
	const record: JobRecord = {
		jobId,
		status: "queued",
		stdout: "",
		stderr: "",
		exitCode: null,
		startedAt: Date.now(),
		finishedAt: null,
		label: opts.label,
	};
	jobs.set(jobId, record);

	// Fire-and-forget; the run loop owns the record and updates it as it goes.
	void execute(jobId, record, opts, timeoutMs).catch((err) => {
		log.error(`job ${jobId} crashed: ${String(err)}`);
		record.status = "failed";
		record.error = String(err);
		record.finishedAt = Date.now();
	});

	return { jobId };
}

export function getJob(jobId: string): JobRecord | null {
	return jobs.get(jobId) ?? null;
}

/** Test/debug helper: drop all in-memory jobs. */
export function _resetJobs(): void {
	jobs.clear();
}

/** Test/debug helper: drop jobs older than `ttlMs`. */
export function _pruneJobs(now: number = Date.now(), ttlMs: number = JOB_TTL_MS): number {
	let removed = 0;
	for (const [id, record] of jobs) {
		if (record.finishedAt !== null && now - record.finishedAt > ttlMs) {
			jobs.delete(id);
			removed++;
		}
	}
	return removed;
}

// ─── internals ─────────────────────────────────────────────────────────────

async function execute(
	jobId: string,
	record: JobRecord,
	opts: RunJobOptions,
	timeoutMs: number,
): Promise<void> {
	const startedAt = Date.now();
	record.startedAt = startedAt;
	record.status = "running";

	const proc = Bun.spawn({
		cmd: [opts.cmd, ...(opts.args ?? [])],
		cwd: opts.cwd,
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, LC_ALL: "C" },
	});

	let stdoutBytes = 0;
	let stderrBytes = 0;
	const stdoutDecoder = new TextDecoder("utf-8");
	const stderrDecoder = new TextDecoder("utf-8");

	const stdoutStream = (async () => {
		if (!proc.stdout) return;
		const reader = proc.stdout.getReader();
		try {
			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				if (!value) continue;
				stdoutBytes += value.byteLength;
				if (stdoutBytes <= MAX_BUFFER_BYTES) {
					record.stdout += stdoutDecoder.decode(value, { stream: true });
				}
			}
		} finally {
			record.stdout += stdoutDecoder.decode();
		}
	})();

	const stderrStream = (async () => {
		if (!proc.stderr) return;
		const reader = proc.stderr.getReader();
		try {
			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				if (!value) continue;
				stderrBytes += value.byteLength;
				if (stderrBytes <= MAX_BUFFER_BYTES) {
					record.stderr += stderrDecoder.decode(value, { stream: true });
				}
			}
		} finally {
			record.stderr += stderrDecoder.decode();
		}
	})();

	// Race the process against a hard timeout.
	const timeoutHandle = setTimeout(() => {
		try {
			proc.kill();
		} catch {
			// already dead — nothing to do
		}
	}, timeoutMs);

	const [, , exitCode] = await Promise.all([stdoutStream, stderrStream, proc.exited]);
	clearTimeout(timeoutHandle);

	if (record.status === "running") {
		record.exitCode = exitCode;
		record.status = exitCode === 0 ? "done" : "failed";
		record.finishedAt = Date.now();
	}
	// If the timeout already flipped us to "failed" (kill), leave that alone.
}

function clampTimeout(raw: number | undefined): number {
	if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return DEFAULT_TIMEOUT_MS;
	return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, Math.trunc(raw)));
}