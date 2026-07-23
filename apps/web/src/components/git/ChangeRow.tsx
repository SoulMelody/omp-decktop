import { File, Loader2 } from "lucide-react";
import type { GitStatusFile } from "@omp-deck/protocol";
import { cn } from "@/lib/utils";

const CODE_MAP: Record<string, string> = {
	"": " ",
	" ": " ",
	M: "M",
	A: "A",
	D: "D",
	R: "R",
	C: "C",
	U: "U",
	"?": "?",
};

function badgeClass(code: string, scope: "index" | "workingDir"): string {
	if (code === " ") return "opacity-0";
	const colorByScope = {
		index: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
		workingDir: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
	} as const;
	if (code === "?") return "bg-slate-500/20 text-slate-600 dark:text-slate-400";
	if (code === "U") return "bg-rose-500/20 text-rose-700 dark:text-rose-300";
	return colorByScope[scope];
}

interface Props {
	row: GitStatusFile;
	diffPatch: string | null;
	diffLoading: boolean;
	showIndex: boolean;
	onStage?: () => void;
	onUnstage?: () => void;
	onRevert?: () => void;
	onRevertStaged?: () => void;
	onOpenDiff: () => void;
}

/**
 * One row in the changes panel. Renders the file path with two small badges
 * for the index and working-tree porcelain codes. Hovering reveals the
 * action cluster (Stage / Unstage / Discard). Clicking the row body loads
 * the diff into the inspector pane.
 */
export function ChangeRow({ row, diffLoading, showIndex, onStage, onUnstage, onRevert, onRevertStaged, onOpenDiff }: Props) {
	const canStage = row.workingDir !== " " && onStage !== undefined;
	const canUnstage = row.index !== " " && row.index !== "?" && onUnstage !== undefined;
	const canRevertWorking = row.workingDir !== " " && row.workingDir !== "?" && onRevert !== undefined;
	const canRevertStaged = row.index !== " " && row.index !== "?" && onRevertStaged !== undefined;
	return (
		<div
			className={cn(
				"group flex items-center gap-2 px-2 py-1 text-2xs hover:bg-paper-2",
			)}
		>
			<button
				type="button"
				className="flex flex-1 items-center gap-2 truncate text-left"
				onClick={onOpenDiff}
			>
				{diffLoading ? <Loader2 className="h-3 w-3 shrink-0 animate-spin text-ink-4" /> : <File className="h-3 w-3 shrink-0 text-ink-4" />}
				<span className="truncate font-mono text-ink-2">{row.path}</span>
			</button>
			<div className="flex items-center gap-1">
				{showIndex ? (
					<span className={cn("rounded px-1 font-mono text-2xs", badgeClass(row.index, "index"))}>
						{CODE_MAP[row.index] ?? row.index}
					</span>
				) : null}
				<span className={cn("rounded px-1 font-mono text-2xs", badgeClass(row.workingDir, "workingDir"))}>
					{CODE_MAP[row.workingDir] ?? row.workingDir}
				</span>
			</div>
			<div className="hidden items-center gap-1 group-hover:flex">
				{canStage ? (
					<button type="button" onClick={onStage} className="rounded border border-line px-1.5 py-0.5 text-2xs hover:bg-paper-2">Stage</button>
				) : null}
				{canUnstage ? (
					<button type="button" onClick={onUnstage} className="rounded border border-line px-1.5 py-0.5 text-2xs hover:bg-paper-2">Unstage</button>
				) : null}
				{canRevertWorking ? (
					<button type="button" onClick={onRevert} className="rounded border border-rose-300 px-1.5 py-0.5 text-2xs text-rose-700 hover:bg-rose-50" title="Discard working-tree changes">
						Discard
					</button>
				) : null}
				{canRevertStaged ? (
					<button type="button" onClick={onRevertStaged} className="rounded border border-rose-300 px-1.5 py-0.5 text-2xs text-rose-700 hover:bg-rose-50" title="Unstage + discard index changes">
						Reset
					</button>
				) : null}
			</div>
		</div>
	);
}