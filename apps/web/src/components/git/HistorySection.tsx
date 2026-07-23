import { useEffect, useState } from "react";
import { Clock, Loader2 } from "lucide-react";
import type { GitCommitInfo, GitLogResponse } from "@omp-deck/protocol";
import { gitApi } from "@/lib/gitApi";
import { HistoryCommitRow } from "./HistoryCommitRow";

/**
 * Paginated commit log. Loads the first page on mount; "Load more" hits
 * the server with the last-loaded SHA as a cursor. Clicking a row calls
 * `onSelect(commit)` so the parent can render a side-panel commit detail.
 */

interface Props {
	cwd: string;
	pageSize?: number;
	onSelect(commit: GitCommitInfo): void;
}

export function HistorySection({ cwd, pageSize = 30, onSelect }: Props) {
	const [commits, setCommits] = useState<GitCommitInfo[]>([]);
	const [cursor, setCursor] = useState<string | undefined>(undefined);
	const [loading, setLoading] = useState(false);
	const [hasMore, setHasMore] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!cwd) return;
		void load(undefined);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [cwd]);

	async function load(c: string | undefined): Promise<void> {
		setLoading(true);
		setError(null);
		const r: GitLogResponse | null = await gitApi.log(cwd, { maxCount: pageSize, cursor: c });
		setLoading(false);
		if (!r || !r.ok) {
			setError("log failed");
			return;
		}
		setCommits((prev) => (c ? [...prev, ...r.commits] : r.commits));
		setCursor(r.nextCursor);
		setHasMore(Boolean(r.nextCursor));
	}

	return (
		<div className="flex flex-1 flex-col min-h-0">
			<header className="flex items-center gap-2 border-b border-line bg-paper px-2 py-1 text-2xs font-medium text-ink-3">
				<Clock className="h-3 w-3" />
				<span>History ({commits.length}{hasMore ? "+" : ""})</span>
			</header>
			<div className="flex-1 overflow-y-auto">
				{error ? <p className="px-3 py-2 text-2xs text-rose-600">{error}</p> : null}
				{commits.map((c) => (
					<HistoryCommitRow key={c.sha} commit={c} onClick={() => onSelect(c)} />
				))}
			</div>
			{hasMore ? (
				<div className="border-t border-line p-2 text-center">
					<button
						type="button"
						className="rounded-md border border-line bg-paper px-3 py-1 text-2xs text-ink-2 hover:bg-paper-2 disabled:opacity-50"
						disabled={loading || !cursor}
						onClick={() => cursor && void load(cursor)}
					>
						{loading ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : null}
						Load more
					</button>
				</div>
			) : null}
		</div>
	);
}