import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { FileTree } from "@/components/files/FileTree";
import { FileTabs } from "@/components/files/FileTabs";
import { FilePreview } from "@/components/files/FilePreview";
import { FileDialog, type FileDialogVariant } from "@/components/files/FileDialog";
import { FileSearchPalette } from "@/components/files/FileSearchPalette";
import type { FileMenuAction } from "@/components/files/FileContextMenu";
import type { FsEntryMeta } from "@omp-deck/protocol";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api";
import { basename, dirname, joinPath } from "@/lib/fs-paths";
import { gitApi, useGitStatus } from "@/lib/gitApi";
import { FolderOpen } from "lucide-react";

export interface FileTab {
	id: string;
	filePath: string;
	cwd: string;
	label: string;
}

const MAX_TABS = 15;

function makeTabId(cwd: string, filePath: string): string {
	return `${cwd}::${filePath}`;
}

export function FilesView() {
	const defaultCwd = useStore((s) => s.defaultCwd);
	const selectedCwd = useStore((s) => s.selectedWorkspaceCwd);
	const pushLocalNotification = useStore((s) => s.pushLocalNotification);
	const [params, setParams] = useSearchParams();
	const cwd = selectedCwd || defaultCwd;
	const [gitEnabled, setGitEnabled] = useState(false);
	useEffect(() => {
		let cancelled = false;
		setGitEnabled(false);
		void gitApi.check(cwd).then((result) => {
			if (!cancelled) setGitEnabled(result?.isRepo === true);
		});
		return () => { cancelled = true; };
	}, [cwd]);
	const { status: gitStatus } = useGitStatus(cwd, { enabled: gitEnabled, pollMs: 5_000 });

	const [tabs, setTabs] = useState<FileTab[]>([]);
	const [activeTabId, setActiveTabId] = useState<string | null>(null);

	// File dialog state. `null` = closed.
	const [dialog, setDialog] = useState<{
		variant: FileDialogVariant;
		path: string;
		defaultName?: string;
		currentName?: string;
	} | null>(null);

	// Quick-open palette visibility.
	const [paletteOpen, setPaletteOpen] = useState(false);

	// Refresh-trigger for the tree. Bumped after every successful fs op so
	// newly created / deleted / renamed nodes show up.
	const [treeRefresh, setTreeRefresh] = useState(0);
	const bumpTree = useCallback(() => setTreeRefresh((n) => n + 1), []);

	// Auto-open from ?path= URL param
	useEffect(() => {
		const urlPath = params.get("path");
		if (!urlPath) return;
		const id = makeTabId(cwd, urlPath);
		setTabs((prev) => {
			if (prev.some((t) => t.id === id)) return prev;
			const tab: FileTab = { id, filePath: urlPath, cwd, label: basename(urlPath) };
			return prev.length >= MAX_TABS ? [...prev.slice(1), tab] : [...prev, tab];
		});
		setActiveTabId(id);
		const next = new URLSearchParams(params);
		next.delete("path");
		setParams(next, { replace: true });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const openFile = useCallback(
		(filePath: string) => {
			const id = makeTabId(cwd, filePath);
			setTabs((prev) => {
				if (prev.some((t) => t.id === id)) return prev;
				const tab: FileTab = { id, filePath, cwd, label: basename(filePath) };
				return prev.length >= MAX_TABS ? [...prev.slice(1), tab] : [...prev, tab];
			});
			setActiveTabId(id);
		},
		[cwd],
	);

	const closeTab = useCallback((id: string) => {
		setTabs((prev) => {
			const idx = prev.findIndex((t) => t.id === id);
			if (idx < 0) return prev;
			const next = prev.filter((t) => t.id !== id);
			const fallbackIdx = Math.min(idx, next.length - 1);
			setActiveTabId(next[fallbackIdx]?.id ?? null);
			return next;
		});
	}, []);

	const reorderTabs = useCallback((fromId: string, toId: string) => {
		setTabs((prev) => {
			const fromIdx = prev.findIndex((t) => t.id === fromId);
			const toIdx = prev.findIndex((t) => t.id === toId);
			if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return prev;
			const next = prev.slice();
			const [moved] = next.splice(fromIdx, 1);
			if (!moved) return prev;
			next.splice(toIdx, 0, moved);
			return next;
		});
	}, []);

	const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

	// Global keyboard shortcut: Cmd/Ctrl+P toggles the palette.
	useEffect(() => {
		function onKey(e: KeyboardEvent): void {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p") {
				e.preventDefault();
				setPaletteOpen((v) => !v);
			}
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	// Context-menu dispatch from the tree.
	function handleContextAction(action: FileMenuAction, target: FsEntryMeta): void {
		const parent = target.isDir ? target.path : dirname(target.path);
		switch (action.kind) {
			case "create-file":
				setDialog({ variant: "create-file", path: parent, defaultName: "untitled.ts" });
				return;
			case "create-folder":
				setDialog({ variant: "create-folder", path: parent, defaultName: "new-folder" });
				return;
			case "rename":
				setDialog({ variant: "rename", path: target.path, currentName: target.name });
				return;
			case "delete":
				setDialog({ variant: "delete", path: target.path, currentName: target.name });
				return;
			case "copy-path":
				void navigator.clipboard?.writeText(target.path).then(
					() => pushLocalNotification({ level: "info", title: "Path copied", body: target.path }),
					() => pushLocalNotification({ level: "error", title: "Copy failed" }),
				);
				return;
			case "reveal":
				void (async () => {
					const r = await api.revealPath(cwd, target.path, "browser");
					if (r.ok && r.hint === "browser") {
						window.open(api.readRawUrl(cwd, target.path.replace(/\/$/, "/")), "_blank");
					}
				})();
				return;
		}
	}

	// Drag-and-drop upload handler — writes each dropped file at the target dir.
	async function handleUpload(files: FileList, targetDir: string): Promise<void> {
		for (let i = 0; i < files.length; i++) {
			const f = files.item(i);
			if (!f) continue;
			try {
				const buf = await f.arrayBuffer();
				const content = new TextDecoder("utf-8").decode(buf);
				const result = await api.writeFile(cwd, joinPath(targetDir, f.name), content, { encoding: "utf-8" });
				if (!result.ok) {
					pushLocalNotification({
						level: "error",
						title: `Upload failed: ${f.name}`,
						body: result.error,
					});
				}
			} catch (err) {
				pushLocalNotification({
					level: "error",
					title: `Upload failed: ${f.name}`,
					body: (err as Error).message,
				});
			}
		}
		bumpTree();
		pushLocalNotification({ level: "info", title: `Uploaded ${files.length} file(s)` });
	}

	// Dialog submission dispatcher.
	async function handleDialogSubmit(input: { name: string; parent: string }): Promise<void> {
		if (!dialog) return;
		const { variant, path } = dialog;
		try {
			if (variant === "create-file" || variant === "create-folder") {
				const target = joinPath(input.parent, input.name);
				const r = variant === "create-folder"
					? await api.mkdir(cwd, target, true)
					: await api.writeFile(cwd, target, "");
				if (!r.ok) throw new Error(r.error);
				if (variant === "create-file") openFile(target);
				pushLocalNotification({
					level: "info",
					title: variant === "create-file" ? "File created" : "Folder created",
					body: target,
				});
			} else if (variant === "rename") {
				const r = await api.renamePath(cwd, path, joinPath(dirname(path), input.name));
				if (!r.ok) throw new Error(r.error);
				// If the renamed file is open in a tab, move the tab too.
				const renamedTab = tabs.find((t) => t.filePath === path);
				if (renamedTab) {
					const newPath = joinPath(dirname(path), input.name);
					setTabs((prev) =>
						prev.map((t) =>
							t.id === renamedTab.id
								? { ...t, filePath: newPath, label: basename(newPath), id: makeTabId(cwd, newPath) }
								: t,
						),
					);
				}
				pushLocalNotification({ level: "info", title: "Renamed", body: input.name });
			} else if (variant === "delete") {
				const r = await api.deletePath(cwd, path, false);
				if (!r.ok) throw new Error(r.error);
				// Close any tabs pointing at the deleted path.
				const id = makeTabId(cwd, path);
				closeTab(id);
				pushLocalNotification({ level: "info", title: "Deleted", body: path });
			}
			bumpTree();
		} catch (err) {
			pushLocalNotification({ level: "error", title: "Operation failed", body: (err as Error).message });
			throw err;
		}
	}

	return (
		<Layout
			sidebar={
				<FileTree
					key={`tree-${cwd}-${treeRefresh}`}
					cwd={cwd}
					onOpenFile={openFile}
					activeFilePath={activeTab?.filePath ?? null}
					onAction={handleContextAction}
					onUpload={handleUpload}
					gitStatus={gitStatus?.files}
				/>
			}
			main={
				<div className="flex h-full min-h-0 flex-col">
					<FileTabs
						tabs={tabs}
						activeTabId={activeTabId}
						onSelectTab={setActiveTabId}
						onCloseTab={closeTab}
						onReorder={reorderTabs}
					/>
					<FilePreview tab={activeTab} />
					{dialog ? (
						<FileDialog
							open
							variant={dialog.variant}
							path={dialog.path}
							defaultName={dialog.defaultName}
							currentName={dialog.currentName}
							onClose={() => setDialog(null)}
							onSubmit={handleDialogSubmit}
						/>
					) : null}
					<FileSearchPalette
						cwd={cwd}
						open={paletteOpen}
						onClose={() => setPaletteOpen(false)}
						onOpenFile={openFile}
					/>
				</div>
			}
			inspector={null}
			topBar={
				<div className="flex items-center gap-2 px-3 py-1.5 border-b border-line bg-paper text-xs text-ink-2">
					<FolderOpen className="h-3.5 w-3.5" />
					<span className="font-mono text-2xs truncate">{cwd}</span>
					<span className="ml-auto text-2xs text-ink-4">
						<kbd className="font-mono">⌘P</kbd> to quick-open
					</span>
				</div>
			}
		/>
	);
}