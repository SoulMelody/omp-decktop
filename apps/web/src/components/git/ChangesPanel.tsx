import { useMemo } from "react";
import type { GitStatusFile } from "@omp-deck/protocol";
import { ChangeRow } from "./ChangeRow";

/**
 * Two-section changes panel. Staged rows come from rows with a non-empty
 * `index`; unstaged rows come from rows with a non-empty `workingDir` or
 * `?` (untracked). A row that has BOTH codes appears in both sections so
 * the user can stage/unstage independently. Headers collapse when their
 * section is empty.
 */

interface Props {
	files: GitStatusFile[];
	selectedPath: string | null;
	diffLoadingFor: string | null;
	onOpenDiff: (path: string, staged: boolean) => void;
	onStage: (paths: string[]) => Promise<void>;
	onUnstage: (paths: string[]) => Promise<void>;
	onRevert: (path: string, scope: "working" | "all") => Promise<void>;
}

export function ChangesPanel({ files, selectedPath, diffLoadingFor, onOpenDiff, onStage, onUnstage, onRevert }: Props) {
	const staged = useMemo(() => files.filter((f) => f.index !== " " && f.index !== "?"), [files]);
	const unstaged = useMemo(() => files.filter((f) => f.workingDir !== " "), [files]);

	if (files.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center p-8 text-2xs text-ink-3">
				Working tree is clean.
			</div>
		);
	}

	return (
		<div className="flex-1 overflow-y-auto">
			{staged.length > 0 ? (
				<Section title={`Staged (${staged.length})`}>
					{staged.map((row) => (
						<ChangeRow
							key={`s-${row.path}`}
							row={row}
							diffPatch={null}
							diffLoading={diffLoadingFor === row.path}
							showIndex={false}
							onOpenDiff={() => onOpenDiff(row.path, true)}
							onUnstage={() => void onUnstage([row.path])}
							onRevertStaged={() => void onRevert(row.path, "all")}
						/>
					))}
				</Section>
			) : null}
			{unstaged.length > 0 ? (
				<Section title={`Changes (${unstaged.length})`}>
					{unstaged.map((row) => (
						<ChangeRow
							key={`u-${row.path}`}
							row={row}
							diffPatch={null}
							diffLoading={diffLoadingFor === row.path}
							showIndex={true}
							onOpenDiff={() => onOpenDiff(row.path, false)}
							onStage={() => void onStage([row.path])}
							onRevert={() => void onRevert(row.path, "working")}
						/>
					))}
				</Section>
			) : null}
			{selectedPath ? null : null /* placeholder for future actions footer */}
		</div>
	);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section>
			<header className="sticky top-0 z-[1] flex items-center gap-2 border-b border-line bg-paper px-2 py-1 text-2xs font-medium text-ink-3">
				{title}
			</header>
			<div className="divide-y divide-line">{children}</div>
		</section>
	);
}