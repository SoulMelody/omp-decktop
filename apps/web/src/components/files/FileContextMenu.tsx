import { useEffect, useRef } from "react";
import { ChevronRight, Copy, FilePlus, FolderPlus, Pencil, Trash2, Eye } from "lucide-react";
import type { FsEntryMeta } from "@omp-deck/protocol";

import { cn } from "@/lib/utils";

/**
 * Right-click menu for a single tree node (file or directory). Anchors at the
 * mouse position and self-closes on outside click / Esc. The parent owns the
 * `open` flag and the dispatch — this component is purely presentational.
 */

export type FileMenuAction =
	| { kind: "create-file" }
	| { kind: "create-folder" }
	| { kind: "rename" }
	| { kind: "delete" }
	| { kind: "copy-path" }
	| { kind: "reveal" };

interface Props {
	entry: FsEntryMeta;
	x: number;
	y: number;
	onAction: (action: FileMenuAction) => void;
	onClose: () => void;
}

interface MenuItem {
	action: FileMenuAction;
	label: string;
	Icon: typeof FilePlus;
	destructive?: boolean;
	/** Hide this item when the entry is a file. */
	dirOnly?: boolean;
	/** Hide this item when the entry is a directory. */
	fileOnly?: boolean;
}

const ITEMS: MenuItem[] = [
	{ action: { kind: "create-file" },  label: "New File",   Icon: FilePlus,  dirOnly: true },
	{ action: { kind: "create-folder" }, label: "New Folder", Icon: FolderPlus, dirOnly: true },
	{ action: { kind: "rename" },       label: "Rename",     Icon: Pencil },
	{ action: { kind: "delete" },       label: "Delete",     Icon: Trash2,    destructive: true },
	{ action: { kind: "copy-path" },    label: "Copy Path",  Icon: Copy },
	{ action: { kind: "reveal" },       label: "Reveal in Shell", Icon: Eye },
];

export function FileContextMenu({ entry, x, y, onAction, onClose }: Props) {
	const ref = useRef<HTMLDivElement>(null);

	// Clamp the menu position so it doesn't overflow the viewport.
	const style: React.CSSProperties = {
		position: "fixed",
		left: clamp(x, 8, window.innerWidth - 220),
		top: clamp(y, 8, window.innerHeight - 240),
		zIndex: 60,
	};

	useEffect(() => {
		function onPointer(e: PointerEvent): void {
			if (!ref.current) return;
			if (!ref.current.contains(e.target as Node)) onClose();
		}
		function onKey(e: KeyboardEvent): void {
			if (e.key === "Escape") onClose();
		}
		// Defer attaching the pointer listener so the click that opened the
		// menu doesn't immediately close it.
		const t = window.setTimeout(() => {
			document.addEventListener("pointerdown", onPointer);
			document.addEventListener("keydown", onKey);
		}, 0);
		return () => {
			window.clearTimeout(t);
			document.removeEventListener("pointerdown", onPointer);
			document.removeEventListener("keydown", onKey);
		};
	}, [onClose]);

	const items = ITEMS.filter((item) => {
		if (item.dirOnly && !entry.isDir) return false;
		if (item.fileOnly && entry.isDir) return false;
		return true;
	});

	return (
		<div
			ref={ref}
			style={style}
			role="menu"
			className="flex w-48 flex-col rounded-md border border-line bg-paper py-1 text-2xs shadow-[0_12px_32px_-8px_rgba(26,24,20,0.4)]"
		>
			{items.map((item) => {
				const Icon = item.Icon;
				return (
					<button
						key={item.label}
						type="button"
						role="menuitem"
						className={cn(
							"flex w-full items-center gap-2 px-2 py-1 text-left transition-colors",
							item.destructive
								? "text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
								: "text-ink-2 hover:bg-paper-2",
						)}
						onClick={() => {
							onAction(item.action);
							onClose();
						}}
					>
						<Icon className="h-3.5 w-3.5 shrink-0" />
						<span className="flex-1 truncate">{item.label}</span>
					</button>
				);
			})}
			<div className="mt-1 border-t border-line px-2 pt-1 text-2xs text-ink-4">
				<span className="flex items-center gap-1">
					<ChevronRight className="h-3 w-3 -rotate-90" />
					<span className="truncate font-mono">{entry.path || entry.name}</span>
				</span>
			</div>
		</div>
	);
}

function clamp(n: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, n));
}