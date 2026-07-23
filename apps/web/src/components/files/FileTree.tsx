import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, File, Folder, FolderOpen, Loader2 } from "lucide-react";
import type { FsEntryMeta, GitStatusFile } from "@omp-deck/protocol";

import { api } from "@/lib/api";
import type { FsTreeEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

import { FileContextMenu, type FileMenuAction } from "./FileContextMenu";

interface Props {
	cwd: string;
	onOpenFile: (filePath: string) => void;
	activeFilePath: string | null;
	onAction?: (action: FileMenuAction, target: FsEntryMeta) => void;
	onUpload?: (files: FileList, targetDir: string) => void;
	/** Optional git status rows keyed by repo-relative path. When supplied,
	 *  each tree node shows a small badge (M/A/D/?) next to its name. */
	gitStatus?: GitStatusFile[];
}

interface TreeNode {
	entry: FsTreeEntry;
	children: TreeNode[] | null;
	loading: boolean;
}

export function updateTreeNode(nodes: TreeNode[], path: string, update: (node: TreeNode) => TreeNode): TreeNode[] {
	return nodes.map((node) => {
		if (node.entry.path === path) return update(node);
		if (!node.children) return node;
		const children = updateTreeNode(node.children, path, update);
		return children === node.children ? node : { ...node, children };
	});
}

export function FileTree({ cwd, onOpenFile, activeFilePath, onAction, onUpload, gitStatus }: Props) {
	const [roots, setRoots] = useState<TreeNode[]>([]);
	const [loading, setLoading] = useState(true);
	const [menu, setMenu] = useState<{ entry: FsEntryMeta; x: number; y: number } | null>(null);

	// Index the git status rows by path for O(1) lookup during render.
	const gitStatusByPath = useMemo(() => {
		const map = new Map<string, GitStatusFile>();
		for (const row of gitStatus ?? []) map.set(row.path, row);
		return map;
	}, [gitStatus]);

	const loadDir = useCallback(
		async (dirPath?: string): Promise<FsTreeEntry[]> => {
			const res = await api.listTree(cwd, dirPath);
			if (!res.ok) return [];
			return res.entries;
		},
		[cwd],
	);

	useEffect(() => {
		setLoading(true);
		loadDir().then((entries) => {
			setRoots(entries.map((e) => ({ entry: e, children: null, loading: false })));
			setLoading(false);
		});
	}, [cwd, loadDir]);

	async function toggleExpand(node: TreeNode) {
		if (node.children !== null) {
			setRoots((prev) => updateTreeNode(prev, node.entry.path, (current) => ({ ...current, children: null })));
			return;
		}
		setRoots((prev) => updateTreeNode(prev, node.entry.path, (current) => ({ ...current, loading: true })));
		const entries = await loadDir(node.entry.path);
		setRoots((prev) => updateTreeNode(prev, node.entry.path, (current) => ({
			...current,
			loading: false,
			children: entries.map((entry) => ({ entry, children: null, loading: false })),
		})));
	}

	// Adapt FsTreeEntry → FsEntryMeta for the context menu. The shapes overlap
	// heavily; we only need the additional `isFile` / `isSymlink` flags.
	function toFsEntryMeta(e: FsTreeEntry): FsEntryMeta {
		return {
			name: e.name,
			path: e.path.replace(/\/$/, ""),
			isDir: e.isDir,
			isFile: !e.isDir,
			isSymlink: false,
		};
	}

	function renderNode(node: TreeNode, depth: number): React.ReactNode {
		const isDir = node.entry.isDir;
		const isExpanded = node.children !== null;
		const cleanPath = node.entry.path.replace(/\/$/, "");
		const isActive = activeFilePath === cleanPath;
		const meta = toFsEntryMeta(node.entry);

		return (
			<div key={node.entry.path}>
				<button
					type="button"
					className={cn(
						"flex w-full items-center gap-1 py-0.5 pr-2 text-left text-2xs hover:bg-paper-2 transition-colors",
						isActive && "bg-paper-3 text-accent",
						!isActive && "text-ink-2",
					)}
					style={{ paddingLeft: 8 + depth * 14 + "px" }}
					onClick={() => {
						isDir ? toggleExpand(node) : onOpenFile(cleanPath);
					}}
					onContextMenu={(e) => {
						e.preventDefault();
						setMenu({ entry: meta, x: e.clientX, y: e.clientY });
					}}
					onDragOver={(e) => {
						if (isDir && onUpload) {
							e.preventDefault();
							e.dataTransfer.dropEffect = "copy";
						}
					}}
					onDrop={(e) => {
						if (!isDir || !onUpload) return;
						e.preventDefault();
						const files = e.dataTransfer.files;
						if (files && files.length > 0) onUpload(files, cleanPath);
					}}
				>
					{isDir ? (
						<>
							<ChevronRight
								className={cn(
									"h-3 w-3 shrink-0 text-ink-4 transition-transform",
									isExpanded && "rotate-90",
								)}
							/>
							{node.loading ? (
								<Loader2 className="h-3 w-3 shrink-0 animate-spin text-ink-4" />
							) : isExpanded ? (
								<FolderOpen className="h-3 w-3 shrink-0 text-amber-500" />
							) : (
								<Folder className="h-3 w-3 shrink-0 text-amber-500" />
							)}
						</>
					) : (
						<>
							<span className="w-3 shrink-0" />
							<File className="h-3 w-3 shrink-0 text-ink-4" />
						</>
					)}
					<span className="truncate">{node.entry.name}</span>
					{(() => {
						const status = gitStatusByPath.get(cleanPath);
						if (!status) return null;
						const code = status.index !== " " ? status.index : status.workingDir;
						if (code === " " || code === undefined) return null;
						return (
							<span
								className={cn(
									"ml-1 inline-flex h-4 w-4 items-center justify-center rounded font-mono text-2xs",
									code === "?" && "bg-slate-500/20 text-slate-600",
									code === "M" && "bg-amber-500/20 text-amber-700",
									code === "A" && "bg-emerald-500/20 text-emerald-700",
									code === "D" && "bg-rose-500/20 text-rose-700",
									code === "U" && "bg-fuchsia-500/20 text-fuchsia-700",
								)}
								title={`git: ${code === "?" ? "untracked" : code === "M" ? "modified" : code === "A" ? "added" : code === "D" ? "deleted" : "unmerged"}`}
							>
								{code}
							</span>
						);
					})()}
				</button>
				{isExpanded && node.children?.map((child) => renderNode(child, depth + 1))}
			</div>
		);
	}

	if (loading) {
		return (
			<div className="flex items-center gap-2 p-3 text-2xs text-ink-3">
				<Loader2 className="h-3 w-3 animate-spin" /> Loading files...
			</div>
		);
	}

	return (
		<div className="h-full overflow-y-auto py-1">
			{roots.map((node) => renderNode(node, 0))}
			{menu ? (
				<FileContextMenu
					entry={menu.entry}
					x={menu.x}
					y={menu.y}
					onAction={(action) => onAction?.(action, menu.entry)}
					onClose={() => setMenu(null)}
				/>
			) : null}
		</div>
	);
}