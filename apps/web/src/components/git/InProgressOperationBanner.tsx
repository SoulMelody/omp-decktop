import { AlertTriangle, X, Check } from "lucide-react";
import type { GitStatusResponse } from "@omp-deck/protocol";
import { cn } from "@/lib/utils";

/**
 * Persistent banner shown above the changes panel whenever the workspace is
 * in the middle of a merge, rebase, or cherry-pick. Provides Abort and
 * Continue actions so the user doesn't have to remember the CLI incantation.
 */

interface Props {
	status: GitStatusResponse;
	onAbort(): void;
	onContinue(): void;
}

export function InProgressOperationBanner({ status, onAbort, onContinue }: Props) {
	const kind = status.mergeInProgress ? "merge" : status.rebaseInProgress ? "rebase" : null;
	if (!kind) return null;
	const title = kind === "merge" ? "Merge in progress" : "Rebase in progress";
	return (
		<div className={cn("flex items-center gap-2 border-b border-rose-300 bg-rose-50 px-3 py-1.5 text-2xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200")}>
			<AlertTriangle className="h-3 w-3" />
			<span className="flex-1">
				<strong className="font-semibold">{title}.</strong>{" "}
				Resolve conflicts and stage changes, then continue.
			</span>
			<button
				type="button"
				className="flex items-center gap-1 rounded-md border border-rose-300 bg-rose-100 px-2 py-0.5 text-2xs hover:bg-rose-200 dark:bg-rose-900/40"
				onClick={onAbort}
			>
				<X className="h-3 w-3" /> Abort
			</button>
			<button
				type="button"
				className="flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-2xs font-medium text-white hover:opacity-90"
				onClick={onContinue}
			>
				<Check className="h-3 w-3" /> Continue
			</button>
		</div>
	);
}