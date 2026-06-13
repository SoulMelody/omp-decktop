import { useMemo, useState } from "react";
import { cn, truncate } from "@/lib/utils";

export interface QuickHistoryItem {
	id: string;
	label: string;
	caption: string;
	kind: "user" | "assistant" | "notice" | "compaction";
}

interface Props {
	items: QuickHistoryItem[];
	activeId?: string;
	onJump: (id: string) => void;
}

export function QuickHistoryRail({ items, activeId, onJump }: Props) {
	const [hoveredId, setHoveredId] = useState<string | null>(null);
	const [focusedId, setFocusedId] = useState<string | null>(null);

	const previewId = hoveredId ?? focusedId;
	const previewItem = useMemo(
		() => items.find((item) => item.id === previewId),
		[items, previewId],
	);

	if (items.length < 2) return null;

	return (
		<div className="pointer-events-none absolute inset-y-0 right-2 z-10 hidden items-center lg:flex">
			<div className="relative flex items-center gap-3">
				{previewItem ? (
					<div className="max-w-[220px] rounded-2xl border border-line/80 bg-paper-2/95 px-3 py-2 shadow-[0_10px_30px_-12px_rgba(26,24,20,0.32)] backdrop-blur">
						<div className="font-mono text-2xs uppercase tracking-meta text-ink-3">
							{previewItem.caption}
						</div>
						<div className="mt-1 text-sm leading-snug text-ink">
							{truncate(previewItem.label, 120)}
						</div>
					</div>
				) : null}

				<div className="pointer-events-auto flex max-h-[72vh] min-h-[180px] flex-col items-end justify-center gap-2 px-1 py-3">
					{items.map((item) => {
						const isActive = item.id === activeId;
						const isPreview = item.id === previewId;
						return (
							<button
								key={item.id}
								type="button"
								onClick={() => onJump(item.id)}
								onMouseEnter={() => setHoveredId(item.id)}
								onMouseLeave={() => setHoveredId((current) => (current === item.id ? null : current))}
								onFocus={() => setFocusedId(item.id)}
								onBlur={() => setFocusedId((current) => (current === item.id ? null : current))}
								className="group relative block h-4 w-11 rounded-full focus:outline-none"
								aria-label={`${item.caption}: ${item.label}`}
								aria-current={isActive ? "true" : undefined}
								title={item.label}
							>
								<span
									className={cn(
										"absolute right-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full transition-all duration-150",
										isActive && "w-11 bg-accent shadow-[0_0_0_1px_rgba(154,52,18,0.12)]",
										!isActive && isPreview && "w-8 bg-accent/65",
										!isActive && !isPreview && item.kind === "notice" && "w-6 bg-warn/45",
										!isActive && !isPreview && item.kind === "compaction" && "w-5 bg-thinking/40",
										!isActive && !isPreview && (item.kind === "user" || item.kind === "assistant") && "w-4 bg-ink/25 group-hover:w-8 group-hover:bg-accent/55 group-focus:bg-accent/55",
									)}
								/>
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
}
