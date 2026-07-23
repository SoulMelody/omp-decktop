/**
 * Per-cwd async mutex for git mutations.
 *
 * Git uses a single `.git/index.lock` file to serialize index updates; if two
 * mutations run in parallel (e.g. user clicks "Stage" while an agent is
 * committing) the second one fails with "Another git process seems to be
 * running" — a confusing error for the user. This module serializes every
 * mutation through a per-cwd Promise chain so the operations are guaranteed
 * to run one after the other.
 *
 * Stale-lock detection:
 *   When we go to acquire the lock, if the per-cwd chain is empty AND we
 *   still hit an `index.lock` error from git (someone outside this process
 *   holds it), we wait 3 seconds and check whether the lock's size + mtime
 *   are byte-for-byte identical. If yes, the lock is stale and we delete
 *   it before retrying. If the lock changes during the wait we leave it
 *   alone — a real git process is using it.
 */

const STALE_LOCK_MS = 3_000;
const POLL_MS = 250;

interface CwdQueue {
	chain: Promise<unknown>;
	/** True while a mutation is currently being executed for this cwd. */
	busy: boolean;
}

const queues = new Map<string, CwdQueue>();

/**
 * Acquire the lock for `cwd`, run `fn`, and release the lock — whether the
 * function resolved or threw. Returns whatever `fn` returns.
 */
export async function withGitLock<T>(cwd: string, fn: () => Promise<T>): Promise<T> {
	const queue = getOrCreate(cwd);
	const next = queue.chain.then(async () => {
		queue.busy = true;
		try {
			return await fn();
		} finally {
			queue.busy = false;
		}
	});
	// Update the chain to the new tail; swallow rejection on the chain so
	// a failed task doesn't poison subsequent calls.
	queue.chain = next.catch(() => undefined);
	return next;
}

/** Test/debug helper: number of cwds currently tracked. */
export function _trackedCwdCount(): number {
	return queues.size;
}

/** Test/debug helper: drop all queues. */
export function _resetLocks(): void {
	queues.clear();
}

function getOrCreate(cwd: string): CwdQueue {
	let q = queues.get(cwd);
	if (!q) {
		q = { chain: Promise.resolve(), busy: false };
		queues.set(cwd, q);
	}
	return q;
}

/**
 * Wait for a stale `.git/index.lock` to either disappear or remain
 * byte-identical. Returns `true` when the lock is stale (caller should
 * delete it), `false` when it's a real lock or absent.
 *
 * Exposed separately so tests can exercise it without going through git.
 */
export async function detectStaleLock(
	readLock: () => { size: number; mtimeMs: number } | null,
	waitMs: number = STALE_LOCK_MS,
	pollMs: number = POLL_MS,
): Promise<{ stale: boolean; final: { size: number; mtimeMs: number } | null }> {
	const first = readLock();
	if (!first) return { stale: false, final: null };
	const deadline = Date.now() + waitMs;
	while (Date.now() < deadline) {
		await new Promise((r) => setTimeout(r, pollMs));
		const next = readLock();
		if (!next) return { stale: false, final: null };
		if (next.size !== first.size || next.mtimeMs !== first.mtimeMs) {
			// Lock changed — a real process is using it.
			return { stale: false, final: next };
		}
	}
	return { stale: true, final: first };
}