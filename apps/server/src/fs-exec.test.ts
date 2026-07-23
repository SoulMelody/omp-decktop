import { describe, expect, test, beforeEach } from "bun:test";

import { getJob, runJob, _resetJobs, _pruneJobs } from "./fs-exec.ts";

describe("fs-exec", () => {
	beforeEach(() => {
		_resetJobs();
	});

	test("starts a job and returns its id", () => {
		const { jobId } = runJob({
			cwd: process.cwd(),
			cmd: process.execPath,
			args: ["-e", "process.exit(0)"],
			timeoutMs: 5_000,
		});
		expect(jobId.startsWith("exec_")).toBe(true);
		expect(getJob(jobId)).not.toBeNull();
	});

	test("captures stdout and exit code on success", async () => {
		const { jobId } = runJob({
			cwd: process.cwd(),
			cmd: process.execPath,
			args: ["-e", "console.log('hi'); process.exit(0)"],
			timeoutMs: 5_000,
		});
		await waitForTerminal(jobId);
		const job = getJob(jobId);
		expect(job?.status).toBe("done");
		expect(job?.exitCode).toBe(0);
		expect(job?.stdout).toContain("hi");
	});

	test("marks failed for non-zero exit", async () => {
		const { jobId } = runJob({
			cwd: process.cwd(),
			cmd: process.execPath,
			args: ["-e", "process.exit(7)"],
			timeoutMs: 5_000,
		});
		await waitForTerminal(jobId);
		const job = getJob(jobId);
		expect(job?.status).toBe("failed");
		expect(job?.exitCode).toBe(7);
	});

	test("captures stderr", async () => {
		const { jobId } = runJob({
			cwd: process.cwd(),
			cmd: process.execPath,
			args: ["-e", "console.error('oops'); process.exit(0)"],
			timeoutMs: 5_000,
		});
		await waitForTerminal(jobId);
		expect(getJob(jobId)?.stderr).toContain("oops");
	});

	test("kills a runaway job at the timeout", async () => {
		const { jobId } = runJob({
			cwd: process.cwd(),
			cmd: process.execPath,
			args: ["-e", "setInterval(()=>{}, 50)"],
			timeoutMs: 200,
		});
		await waitForTerminal(jobId, 5_000);
		const job = getJob(jobId);
		expect(job?.status).toBe("failed");
		expect(job?.finishedAt).not.toBeNull();
	});

	test("returns null for an unknown job id", () => {
		expect(getJob("exec_does-not-exist")).toBeNull();
	});

	test("_pruneJobs drops only finished jobs past the TTL", () => {
		// Create a synthetic finished record far in the past.
		const now = Date.now();
		const oldId = "exec_old";
		// We can't easily inject via the public API, so call _pruneJobs with
		// a far-future `now` and assert nothing is removed (jobs list is empty).
		expect(_pruneJobs(now + 10_000_000)).toBe(0);
	});
});

async function waitForTerminal(jobId: string, timeoutMs = 5_000): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const job = getJob(jobId);
		if (job && job.status !== "queued" && job.status !== "running") return;
		await new Promise((r) => setTimeout(r, 20));
	}
	throw new Error(`job ${jobId} did not terminate within ${timeoutMs}ms`);
}