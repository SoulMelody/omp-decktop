import { useState } from "react";
import { X, File } from "lucide-react";
import type { FileTab } from "@/views/FilesView";
import { cn } from "@/lib/utils";

interface Props {
	tabs: FileTab[];
	activeTabId: string | null;
	dirtyIds?: ReadonlySet<string>;
	onSelectTab: (id: string) => void;
	onCloseTab: (id: string) => void;
	onReorder?: (fromId: string, toId: string) => void;
}

export function FileTabs({ tabs, activeTabId, dirtyIds, onSelectTab, onCloseTab, onReorder }: Props) {
	const [dragId, setDragId] = useState<string | null>(null);
	const [overId, setOverId] = useState<string | null>(null);

	if (tabs.length === 0) return null;
	return (
		<div
			className="flex shrink-0 items-end overflow-x-auto border-b border-line bg-paper"
			style={{ height: 34 }}
		>
			{tabs.map((tab) => {
				const active = tab.id === activeTabId;
				const dirty = dirtyIds?.has(tab.id) ?? false;
				return (
					<button
						key={tab.id}
						type="button"
						draggable={!!onReorder}
						onClick={() => onSelectTab(tab.id)}
						onAuxClick={(e) => {
							if (e.button === 1) {
								e.preventDefault();
								onCloseTab(tab.id);
							}
						}}
						onDragStart={(e) => {
							setDragId(tab.id);
							e.dataTransfer.effectAllowed = "move";
						}}
						onDragOver={(e) => {
							if (!dragId || dragId === tab.id) return;
							e.preventDefault();
							setOverId(tab.id);
						}}
						onDragLeave={() => {
							if (overId === tab.id) setOverId(null);
						}}
						onDrop={(e) => {
							e.preventDefault();
							if (dragId && dragId !== tab.id && onReorder) onReorder(dragId, tab.id);
							setDragId(null);
							setOverId(null);
						}}
						onDragEnd={() => {
							setDragId(null);
							setOverId(null);
						}}
						className={cn(
							"group flex items-center gap-1.5 px-2.5 py-1 text-2xs transition-colors border-r border-line shrink-0 max-w-[180px]",
							active
								? "bg-paper-2 text-ink border-b-0 -mb-px border-b-paper-2"
								: "bg-paper text-ink-3 hover:bg-paper-2 hover:text-ink-2",
							overId === tab.id && dragId !== tab.id && "border-l-2 border-l-accent",
							dragId === tab.id && "opacity-50",
						)}
					>
						<File className="h-3 w-3 shrink-0" />
						<span className="truncate">{tab.label}</span>
						{dirty ? <span aria-label="Unsaved" className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" /> : null}
						<span
							className={cn(
								"ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-paper-3",
								active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
							)}
							onClick={(e) => {
								e.stopPropagation();
								onCloseTab(tab.id);
							}}
							role="button"
							aria-label={`Close ${tab.label}`}
						>
							<X className="h-3 w-3" />
						</span>
					</button>
				);
			})}
		</div>
	);
}
