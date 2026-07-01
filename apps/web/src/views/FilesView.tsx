import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { FileTree } from "@/components/files/FileTree";
import { FileTabs } from "@/components/files/FileTabs";
import { FilePreview } from "@/components/files/FilePreview";
import { useStore } from "@/lib/store";
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

function basename(fp: string): string {
	const parts = fp.replace(/\\/g, "/").split("/");
	return parts[parts.length - 1] || fp;
}

export function FilesView() {
	const defaultCwd = useStore((s) => s.defaultCwd);
	const selectedCwd = useStore((s) => s.selectedWorkspaceCwd);
	const [params, setParams] = useSearchParams();
	const cwd = selectedCwd || defaultCwd;

	const [tabs, setTabs] = useState<FileTab[]>([]);
	const [activeTabId, setActiveTabId] = useState<string | null>(null);

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
			// if the closed tab was active, switch to neighbor
			const fallbackIdx = Math.min(idx, next.length - 1);
			setActiveTabId(next[fallbackIdx]?.id ?? null);
			return next;
		});
	}, []);

	const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

	return (
		<Layout
			sidebar={
				<FileTree cwd={cwd} onOpenFile={openFile} activeFilePath={activeTab?.filePath ?? null} />
			}
			main={
				<div className="flex h-full min-h-0 flex-col">
					<FileTabs
						tabs={tabs}
						activeTabId={activeTabId}
						onSelectTab={setActiveTabId}
						onCloseTab={closeTab}
					/>
					<FilePreview tab={activeTab} />
				</div>
			}
			inspector={null}
			topBar={
				<div className="flex items-center gap-2 px-3 py-1.5 border-b border-line bg-paper text-xs text-ink-2">
					<FolderOpen className="h-3.5 w-3.5" />
					<span className="font-mono text-2xs truncate">{cwd}</span>
				</div>
			}
		/>
	);
}
