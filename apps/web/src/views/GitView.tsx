import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Archive, GitBranch } from "lucide-react";
import type { GitCommitInfo } from "@omp-deck/protocol";

import { Layout } from "@/components/Layout";
import { GitHeader } from "@/components/git/GitHeader";
import { BranchSelector } from "@/components/git/BranchSelector";
import { SyncActions } from "@/components/git/SyncActions";
import { ChangesPanel } from "@/components/git/ChangesPanel";
import { CommitSection } from "@/components/git/CommitSection";
import { HistorySection } from "@/components/git/HistorySection";
import { GitEmptyState } from "@/components/git/GitEmptyState";
import { InProgressOperationBanner } from "@/components/git/InProgressOperationBanner";
import { ConflictDialog } from "@/components/git/ConflictDialog";
import { StashesDialog } from "@/components/git/StashesDialog";
import { StashDialog } from "@/components/git/StashDialog";
import { DiffViewer } from "@/components/files/renderers/DiffViewer";
import { gitApi, useGitStatus } from "@/lib/gitApi";
import { useStore } from "@/lib/store";

/**
 * Top-level Git workspace. Three columns: branch header (left), changes +
 * commit (center), history (right). Owns the polling loop, the diff viewer
 * for the currently-selected file, and all the dialog state.
 */
export function GitView() {
	const defaultCwd = useStore((s) => s.defaultCwd);
	const selectedCwd = useStore((s) => s.selectedWorkspaceCwd);
	const pushLocalNotification = useStore((s) => s.pushLocalNotification);
	const [params] = useSearchParams();
	const cwd = selectedCwd || defaultCwd;

	const [repoState, setRepoState] = useState<boolean | null>(null);
	useEffect(() => {
		let cancelled = false;
		setRepoState(null);
		void gitApi.check(cwd).then((r) => { if (!cancelled) setRepoState(r?.isRepo ?? false); });
		return () => { cancelled = true; };
	}, [cwd]);

	const { status, refresh: refreshStatus } = useGitStatus(cwd, { enabled: repoState === true, pollMs: 5_000 });
	const [branches, setBranches] = useState<{ local: import("@omp-deck/protocol").GitBranchInfo[]; remote: import("@omp-deck/protocol").GitBranchInfo[] }>({ local: [], remote: [] });
	const [stashes, setStashes] = useState<import("@omp-deck/protocol").GitStashEntry[]>([]);

	const reloadBranches = useCallback(async () => {
		const r = await gitApi.branches(cwd);
		setBranches(r ?? { local: [], remote: [] });
	}, [cwd]);
	const reloadStashes = useCallback(async () => {
		setStashes(await gitApi.stashes(cwd));
	}, [cwd]);

	useEffect(() => { void reloadBranches(); }, [reloadBranches]);
	useEffect(() => { void reloadStashes(); }, [reloadStashes]);

	const onChange = useCallback(() => {
		void refreshStatus();
		void reloadBranches();
		void reloadStashes();
	}, [refreshStatus, reloadBranches, reloadStashes]);

	// Selected file diff state.
	const [selected, setSelected] = useState<{ path: string; staged: boolean } | null>(null);
	const [diffText, setDiffText] = useState<string>("");
	const [diffLoading, setDiffLoading] = useState(false);
	useEffect(() => {
		if (!selected) { setDiffText(""); return; }
		setDiffLoading(true);
		void gitApi.diff(cwd, { path: selected.path, staged: selected.staged })
			.then((d) => {
				if (d && "patch" in d) setDiffText(d.patch);
				else setDiffText("");
			})
			.finally(() => setDiffLoading(false));
	}, [cwd, selected]);

	// Conflict + stash dialog state.
	const [conflictState, setConflictState] = useState<{ open: boolean; operation: "merge" | "rebase" | "cherry-pick" | "revert"; files: { path: string; oursLabel: string; theirsLabel: string; hunks: number }[] } | null>(null);
	const [stashesOpen, setStashesOpen] = useState(false);
	const [stashOpen, setStashOpen] = useState(false);

	// Auto-open URL ?commit=<sha>
	useEffect(() => {
		const sha = params.get("commit");
		if (!sha) return;
		void gitApi.log(cwd, { maxCount: 1, cursor: undefined }).then((r) => {
			if (!r || !r.ok) return;
			const found = r.commits.find((c) => c.sha.startsWith(sha));
			if (found) setSelectedCommit(found);
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// ─── Action handlers ─────────────────────────────────────────────────

	const onStage = useCallback(async (paths: string[]) => {
		const r = await gitApi.stage(cwd, paths);
		if (r.kind === "ok") onChange();
		else pushLocalNotification({ level: "error", title: "Stage failed", body: (r as { message: string }).message });
	}, [cwd, onChange, pushLocalNotification]);

	const onUnstage = useCallback(async (paths: string[]) => {
		const r = await gitApi.unstage(cwd, paths);
		if (r.kind === "ok") onChange();
		else pushLocalNotification({ level: "error", title: "Unstage failed", body: (r as { message: string }).message });
	}, [cwd, onChange, pushLocalNotification]);

	const onRevert = useCallback(async (path: string, scope: "working" | "all") => {
		if (!window.confirm(`Discard changes to ${path}? This cannot be undone.`)) return;
		const r = await gitApi.revert(cwd, path, scope);
		if (r.kind === "ok") onChange();
		else pushLocalNotification({ level: "error", title: "Revert failed", body: (r as { message: string }).message });
	}, [cwd, onChange, pushLocalNotification]);

	const onCommit = useCallback(async (message: string, pushAfter: boolean) => {
		const r = await gitApi.commit(cwd, message, { pushAfter });
		if (r.kind === "ok") {
			pushLocalNotification({ level: "info", title: "Committed", body: r.value.sha.slice(0, 7) });
			onChange();
		} else {
			pushLocalNotification({ level: "error", title: "Commit failed", body: (r as { message: string }).message });
			throw new Error((r as { message: string }).message);
		}
	}, [cwd, onChange, pushLocalNotification]);

	const onAbortMerge = useCallback(async () => {
		const r = await gitApi.mergeAbort(cwd);
		if (r.kind === "ok") { setConflictState(null); onChange(); }
		else pushLocalNotification({ level: "error", title: "Abort failed", body: (r as { message: string }).message });
	}, [cwd, onChange, pushLocalNotification]);
	const onAbortRebase = useCallback(async () => {
		const r = await gitApi.rebaseAbort(cwd);
		if (r.kind === "ok") { setConflictState(null); onChange(); }
		else pushLocalNotification({ level: "error", title: "Abort failed", body: (r as { message: string }).message });
	}, [cwd, onChange, pushLocalNotification]);
	const onContinueMerge = useCallback(async () => {
		const r = await gitApi.mergeContinue(cwd);
		if (r.kind === "ok") { setConflictState(null); onChange(); }
		else pushLocalNotification({ level: "error", title: "Continue failed", body: (r as { message: string }).message });
	}, [cwd, onChange, pushLocalNotification]);
	const onContinueRebase = useCallback(async () => {
		const r = await gitApi.rebaseContinue(cwd);
		if (r.kind === "ok") { setConflictState(null); onChange(); }
		else pushLocalNotification({ level: "error", title: "Continue failed", body: (r as { message: string }).message });
	}, [cwd, onChange, pushLocalNotification]);

	// Open the conflict dialog only when the operation has actual unmerged
	// paths. A merge can legitimately be in progress without conflicts while
	// waiting for its commit, in which case the persistent banner is enough.
	const lastConflictKey = useRef("");
	useEffect(() => {
		if (!status) return;
		const operation = status.mergeInProgress ? "merge" : status.rebaseInProgress ? "rebase" : null;
		const paths = status.files
			.filter((file) => file.index === "U" || file.workingDir === "U")
			.map((file) => file.path);
		const key = operation && paths.length > 0 ? `${operation}:${paths.join("\0")}` : "";
		if (key === lastConflictKey.current) return;
		lastConflictKey.current = key;
		if (!operation || paths.length === 0) {
			setConflictState(null);
			return;
		}
		setConflictState({
			open: true,
			operation,
			files: paths.map((path) => ({ path, oursLabel: "ours", theirsLabel: "theirs", hunks: 0 })),
		});
	}, [status]);

	// ─── Render ─────────────────────────────────────────────────────────

	const [selectedCommit, setSelectedCommit] = useState<GitCommitInfo | null>(null);
	const sidebar = (
		<div className="flex h-full flex-col">
			<div className="flex items-center gap-2 border-b border-line bg-paper px-2 py-1.5 text-2xs">
				<GitBranch className="h-3 w-3 text-ink-4" />
				<span className="flex-1 truncate font-mono text-ink-2">{cwd}</span>
			</div>
			{repoState === true && status ? (
				<>
					<div className="flex items-center gap-2 border-b border-line bg-paper-2 px-2 py-1 text-2xs">
						<BranchSelector cwd={cwd} current={status.branch} branches={branches} onChange={onChange} />
						<SyncActions cwd={cwd} />
					</div>
					<div className="flex items-center gap-2 border-b border-line bg-paper px-2 py-1 text-2xs">
						<button
							type="button"
							className="flex items-center gap-1 rounded-md border border-line bg-paper px-2 py-0.5 text-ink-2 hover:bg-paper-2"
							onClick={() => setStashOpen(true)}
						>
							<Archive className="h-3 w-3" /> Stash
						</button>
						<button
							type="button"
							className="flex items-center gap-1 rounded-md border border-line bg-paper px-2 py-0.5 text-ink-2 hover:bg-paper-2"
							onClick={() => setStashesOpen(true)}
						>
							Stashes ({stashes.length})
						</button>
					</div>
				</>
			) : null}
			{repoState === true && status ? <InProgressOperationBanner status={status} onAbort={status.mergeInProgress ? onAbortMerge : onAbortRebase} onContinue={status.mergeInProgress ? onContinueMerge : onContinueRebase} /> : null}
			{repoState === true && status ? (
				<ChangesPanel
					files={status.files}
					selectedPath={selected?.path ?? null}
					diffLoadingFor={diffLoading ? selected?.path ?? null : null}
					onOpenDiff={(path, staged) => setSelected({ path, staged })}
					onStage={onStage}
					onUnstage={onUnstage}
					onRevert={onRevert}
				/>
			) : null}
		</div>
	);

	const main = (
		<div className="flex h-full min-h-0 flex-col">
			{repoState === true ? <GitHeader status={status} loading={!status} /> : null}
			<div className="flex flex-1 min-h-0">
				<div className="flex flex-1 flex-col">
					{selected ? (
						<div className="flex h-full min-h-0 flex-col">
							<div className="flex items-center gap-2 border-b border-line bg-paper-2 px-2 py-1 text-2xs text-ink-3">
								<span className="font-mono">{selected.path}</span>
								<span className="rounded bg-paper-3 px-1 font-mono text-2xs">{selected.staged ? "INDEX" : "WORKING"}</span>
								<button type="button" className="ml-auto rounded-md border border-line bg-paper px-2 py-0.5 text-2xs hover:bg-paper-2" onClick={() => setSelected(null)}>Close</button>
							</div>
							<div className="flex-1 overflow-auto">
								<DiffViewer content={diffText} fileName={selected.path} />
							</div>
						</div>
					) : selectedCommit ? (
						<div className="flex h-full min-h-0 flex-col p-2 text-2xs">
							<div className="flex items-center gap-2">
								<span className="font-mono text-ink-2">{selectedCommit.shortSha}</span>
								<span className="text-ink-3">{selectedCommit.subject}</span>
								<button type="button" className="ml-auto rounded-md border border-line bg-paper px-2 py-0.5 hover:bg-paper-2" onClick={() => setSelectedCommit(null)}>Close</button>
							</div>
							<p className="mt-1 text-ink-4">by {selectedCommit.author} on {selectedCommit.date}</p>
							{selectedCommit.body ? <pre className="mt-2 whitespace-pre-wrap text-2xs text-ink-3">{selectedCommit.body}</pre> : null}
						</div>
					) : repoState === false ? (
						<GitEmptyState cwd={cwd} />
					) : (
						<div className="flex flex-1 items-center justify-center p-4 text-center text-2xs text-ink-4">
							{repoState === null ? "Checking repository…" : "Select a file in the changes panel to see its diff."}
						</div>
					)}
				</div>
				{repoState === true ? (
					<aside className="hidden w-80 shrink-0 border-l border-line lg:flex lg:flex-col">
						<HistorySection cwd={cwd} onSelect={setSelectedCommit} />
					</aside>
				) : null}
			</div>
			{repoState === true && status ? (
				<CommitSection
					disabled={!status.files.some((f) => f.index !== " " && f.index !== "?")}
					busy={false}
					onCommit={async (message, pushAfter) => {
						await onCommit(message, pushAfter);
					}}
				/>
			) : null}
			{conflictState ? (
				<ConflictDialog
					open={conflictState.open}
					operation={conflictState.operation}
					files={conflictState.files}
					onClose={() => setConflictState(null)}
					onAbort={conflictState.operation === "merge" ? onAbortMerge : onAbortRebase}
					onContinue={conflictState.operation === "merge" ? onContinueMerge : onContinueRebase}
				/>
			) : null}
			{stashesOpen ? (
				<StashesDialog
					open
					cwd={cwd}
					entries={stashes}
					onClose={() => setStashesOpen(false)}
					onChange={onChange}
				/>
			) : null}
			{stashOpen ? (
				<StashDialog open cwd={cwd} onClose={() => setStashOpen(false)} onDone={() => { setStashOpen(false); onChange(); }} />
			) : null}
		</div>
	);

	return (
		<Layout sidebar={sidebar} main={main} inspector={null} />
	);
}