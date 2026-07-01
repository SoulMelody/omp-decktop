import { useCallback, useEffect, useState } from "react";
import { ChevronRight, File, Folder, FolderOpen, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import type { FsTreeEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
	cwd: string;
	onOpenFile: (filePath: string) => void;
	activeFilePath: string | null;
}

interface TreeNode {
	entry: FsTreeEntry;
	children: TreeNode[] | null;
	loading: boolean;
}

export function FileTree({ cwd, onOpenFile, activeFilePath }: Props) {
	const [roots, setRoots] = useState<TreeNode[]>([]);
	const [loading, setLoading] = useState(true);

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
			setRoots((prev) =>
				prev.map((n) => (n.entry.path === node.entry.path ? { ...n, children: null } : n)),
			);
			return;
		}
		setRoots((prev) =>
			prev.map((n) => (n.entry.path === node.entry.path ? { ...n, loading: true } : n)),
		);
		const entries = await loadDir(node.entry.path);
		setRoots((prev) =>
			prev.map((n) =>
				n.entry.path === node.entry.path
					? { ...n, loading: false, children: entries.map((e) => ({ entry: e, children: null, loading: false })) }
					: n,
			),
		);
	}

	function renderNode(node: TreeNode, depth: number): React.ReactNode {
		const isDir = node.entry.isDir;
		const isExpanded = node.children !== null;
		const cleanPath = node.entry.path.replace(/\/$/, "");
		const isActive = activeFilePath === cleanPath;

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
		<div className="h-full overflow-y-auto py-1">{roots.map((node) => renderNode(node, 0))}</div>
	);
}
