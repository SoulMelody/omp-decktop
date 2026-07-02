import { useEffect, useMemo, useRef } from "react";
import type { SlashCommandScope } from "@omp-deck/protocol";
import type { SlashCompletionGroup, SlashCompletionItem } from "@/lib/composer-slash-completion";
import { cn } from "@/lib/utils";

const SCOPE_STYLE: Record<SlashCommandScope | "skill", { className: string; label: string; title: string }> = {
	deck: {
		className: "bg-accent/15 text-accent",
		label: "deck",
		title: "Deck-native command — operates on the kanban/inbox without a model round-trip",
	},
	builtin: {
		className: "bg-ink/10 text-ink-2",
		label: "builtin",
		title: "Built-in omp slash command",
	},
	project: {
		className: "bg-accent-soft text-accent",
		label: "project",
		title: "Project-local override",
	},
	user: {
		className: "bg-paper-3 text-ink-3",
		label: "user",
		title: "User-global command",
	},
	skill: {
		className: "bg-thinking/15 text-thinking",
		label: "skill",
		title: "Installed skill — inserted as /skill <name>",
	},
};

interface Props {
	groups: SlashCompletionGroup[];
	selectedIndex: number;
	onPick: (item: SlashCompletionItem) => void;
	onSelectionChange: (index: number) => void;
}

/**
 * Grouped autocomplete dropdown anchored above the composer textarea when the
 * draft starts with `/`. Commands and skills are rendered as separate sections;
 * selection is flattened so the textarea keeps one keyboard owner.
 */
export function SlashCommandPicker({
	groups,
	selectedIndex,
	onPick,
	onSelectionChange,
}: Props) {
	const listRef = useRef<HTMLDivElement>(null);
	const items = useMemo(() => groups.flatMap((group) => group.items), [groups]);

	// Keep the active row visible when keyboard nav moves it offscreen.
	useEffect(() => {
		const el = listRef.current?.querySelector(`[data-option-index="${selectedIndex}"]`) as HTMLElement | undefined;
		el?.scrollIntoView({ block: "nearest" });
	}, [selectedIndex]);

	if (items.length === 0) return null;

	return (
		<div
			role="listbox"
			aria-label="Slash completions"
			className={cn(
				"absolute bottom-full left-0 right-0 mb-1 max-h-[320px] overflow-y-auto",
				"rounded-md border border-line bg-paper-2 shadow-[0_8px_24px_-8px_rgba(26,24,20,0.25)]",
				"font-mono text-[13px]",
			)}
		>
			<div ref={listRef}>
				{groups.map((group) => (
					<div key={group.kind}>
						<div className="border-b border-line/60 bg-paper px-3 py-1 font-mono text-2xs uppercase tracking-meta text-ink-3">
							{group.label}
						</div>
						{group.items.map((item) => {
							const flatIndex = items.indexOf(item);
							const active = flatIndex === selectedIndex;
							const scope = item.kind === "skill" ? "skill" : item.command?.scope ?? "user";
							const style = SCOPE_STYLE[scope];
							return (
								<button
									key={`${item.kind}:${item.value}`}
									type="button"
									role="option"
									aria-selected={active}
									data-option-index={flatIndex}
									onClick={() => onPick(item)}
									onMouseEnter={() => onSelectionChange(flatIndex)}
									// Prevent the textarea blur that would dismiss the picker before onClick fires.
									onMouseDown={(e) => e.preventDefault()}
									className={cn(
										"flex w-full items-start gap-2 px-3 py-2 text-left",
										active ? "bg-accent-soft/60" : "hover:bg-paper-3/60",
									)}
								>
									<div className="min-w-0 flex-1">
										<div className="flex items-baseline gap-1.5">
											<span className={cn("font-medium", active ? "text-accent" : "text-ink")}>{item.label}</span>
											{item.kind === "command" && item.command?.argumentHint ? (
												<span className="font-mono text-2xs text-ink-3">{item.command.argumentHint}</span>
											) : null}
										</div>
										{item.description ? (
											<div className="mt-0.5 truncate font-sans text-xs text-ink-3">{item.description}</div>
										) : null}
									</div>
									<span
										className={cn(
											"shrink-0 self-center rounded px-1.5 py-0.5 font-mono text-2xs uppercase tracking-meta",
											style.className,
										)}
										title={item.kind === "skill" && item.meta ? item.meta : style.title}
									>
										{item.kind === "skill" ? item.skill?.providerLabel ?? style.label : style.label}
									</span>
								</button>
							);
						})}
					</div>
				))}
			</div>
			<div className="border-t border-line bg-paper px-3 py-1 font-mono text-2xs text-ink-3">
				↑↓ navigate · enter pick · esc dismiss
			</div>
		</div>
	);
}
