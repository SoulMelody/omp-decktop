import { GitCommit } from "lucide-react";
import type { GitCommitInfo } from "@omp-deck/protocol";
import { cn } from "@/lib/utils";

/**
 * Compact row in the commit log. Shows the short SHA, the first line of
 * the subject, the author + relative time, and an indicator for merge vs.
 * regular commits. Clicking the row opens the commit-detail side panel.
 */

interface Props {
	commit: GitCommitInfo;
	isCurrent?: boolean;
	onClick(): void;
}

export function HistoryCommitRow({ commit, onClick }: Props) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex w-full items-center gap-2 border-b border-line/50 px-2 py-1.5 text-left text-2xs transition-colors hover:bg-paper-2",
			)}
		>
			<GitCommit className="h-3 w-3 shrink-0 text-ink-4" />
			<span className="w-16 shrink-0 font-mono text-ink-3">{commit.shortSha}</span>
			<span className="flex-1 truncate text-ink-2">{commit.subject}</span>
			<span className="hidden shrink-0 text-2xs text-ink-4 sm:inline">{commit.author}</span>
			<span className="shrink-0 tabular-nums text-2xs text-ink-4">{commit.date.slice(0, 10)}</span>
		</button>
	);
}