import { ArrowDown, ArrowUp, GitBranch, Loader2 } from "lucide-react";
import type { GitStatusResponse } from "@omp-deck/protocol";
import { cn } from "@/lib/utils";

/**
 * Top-of-GitView strip. Shows the current branch (with a small icon), the
 * tracking status (ahead/behind badges), and the in-progress flag if a
 * merge/rebase is currently paused. Sync actions (fetch / pull / push) live
 * in their own <SyncActions/> component so this stays focused on read-only
 * state.
 */

interface Props {
	status: GitStatusResponse | null;
	loading: boolean;
}

export function GitHeader({ status, loading }: Props) {
	if (!status) {
		return (
			<div className="flex h-9 items-center gap-2 border-b border-line bg-paper px-3 text-2xs text-ink-3">
				{loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitBranch className="h-3 w-3 text-ink-4" />}
				<span>git status</span>
			</div>
		);
	}
	const ahead = status.tracking?.ahead ?? 0;
	const behind = status.tracking?.behind ?? 0;
	const inProgress = status.mergeInProgress ?? status.rebaseInProgress;
	return (
		<div className="flex h-9 items-center gap-2 border-b border-line bg-paper px-3 text-2xs text-ink-3">
			{loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitBranch className="h-3 w-3 text-accent" />}
			<span className="font-mono text-ink">{status.branch}</span>
			{status.tracking ? (
				<span className="font-mono text-ink-4">{status.tracking.remote}/{status.tracking.branch}</span>
			) : null}
			{ahead > 0 ? (
				<span className={cn("flex items-center gap-0.5 rounded px-1 font-mono", "text-emerald-700 dark:text-emerald-300")}>
					<ArrowUp className="h-3 w-3" /> {ahead}
				</span>
			) : null}
			{behind > 0 ? (
				<span className={cn("flex items-center gap-0.5 rounded px-1 font-mono", "text-amber-700 dark:text-amber-300")}>
					<ArrowDown className="h-3 w-3" /> {behind}
				</span>
			) : null}
			{inProgress ? (
				<span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 font-mono text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
					{status.mergeInProgress ? "MERGING" : "REBASING"}
				</span>
			) : null}
			<span className="ml-auto text-2xs text-ink-4">
				{status.isClean ? "clean" : `${status.files.length} change${status.files.length === 1 ? "" : "s"}`}
			</span>
		</div>
	);
}