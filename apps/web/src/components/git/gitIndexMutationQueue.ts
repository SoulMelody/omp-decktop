/**
 * Optimistic mutation queue for git operations on a single cwd. Mirrors
 * `openchamber/packages/ui/src/components/views/git/gitIndexMutationQueue.ts`
 * at a lean subset: queue stage/unstage/revert operations so the UI can
 * reflect changes immediately and roll back when the server rejects.
 *
 * The store is intentionally tiny — no persistence, no time-travel. The
 * goal is to make rapid-fire stage/unstage feel instant without races on
 * `.git/index.lock`. The server already serializes mutations per-cwd via
 * `withGitLock`, so this layer's only job is the UI side.
 */

export type MutationKind = "stage" | "unstage" | "revert" | "commit" | "stash";

export interface Mutation {
	id: string;
	kind: MutationKind;
	paths?: string[];
	message?: string;
	/** When set, the queue drives a per-row `optimisticIndex` patch. */
	optimisticIndex?: Record<string, { index: string; workingDir: string }>;
}

interface QueueEntry {
	mutation: Mutation;
	resolve(): void;
	reject(err: unknown): void;
}

export class GitIndexMutationQueue {
	private pending: QueueEntry[] = [];
	private running: QueueEntry | null = null;

	constructor(
		private readonly cwd: string,
		private readonly run: (m: Mutation) => Promise<void>,
	) {}

	enqueue(m: Mutation): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this.pending.push({ mutation: m, resolve, reject });
			this.tick();
		});
	}

	pendingCount(): number {
		return this.pending.length + (this.running ? 1 : 0);
	}

	private async tick(): Promise<void> {
		if (this.running) return;
		const next = this.pending.shift();
		if (!next) return;
		this.running = next;
		try {
			await this.run(next.mutation);
			next.resolve();
		} catch (err) {
			next.reject(err);
		} finally {
			this.running = null;
			this.tick();
		}
	}
}