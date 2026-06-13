import { useMemo, useState, useEffect } from "react";
import { useStore, selectActiveSession } from "@/lib/store";
import { formatClockTime, truncate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { ChevronRight, List, X } from "lucide-react";
import type { ChatMessage, UserMsg, AssistantMsg } from "@/lib/types";

/* ────────────────────────────────────────────────────────── */
/*  Outline entry                                              */
/* ────────────────────────────────────────────────────────── */

interface OutlineEntry {
	msgId: string;
	prompt: string;
	response: string;
	time: string;
	role: "user" | "assistant";
}

function extractOutlineEntries(messages: ChatMessage[]): OutlineEntry[] {
	const entries: OutlineEntry[] = [];

	for (const m of messages) {
		if (m.role === "user") {
			const um = m as UserMsg;
			entries.push({
				msgId: um.id,
				prompt: truncate(um.text.replace(/\n/g, " ").trim(), 48),
				response: "",
				time: formatClockTime(um.timestamp),
				role: "user",
			});
		} else if (m.role === "assistant") {
			const am = m as AssistantMsg;
			const firstText = am.blocks.find((b) => b.type === "text");
			const snippet =
				firstText && firstText.type === "text"
					? truncate(firstText.text.replace(/\n/g, " ").trim(), 56)
					: am.blocks.find((b) => b.type === "toolCall")
						? `[tool: ${(am.blocks.find((b) => b.type === "toolCall") as any)?.name ?? "?"}]`
						: "";
			entries.push({
				msgId: am.id,
				prompt: "",
				response: snippet,
				time: formatClockTime(am.timestamp),
				role: "assistant",
			});
		}
	}
	return entries;
}

/* ────────────────────────────────────────────────────────── */
/*  Scroll-to-message helper                                   */
/* ────────────────────────────────────────────────────────── */

function dispatchScrollTo(msgId: string): void {
	window.dispatchEvent(
		new CustomEvent("omp:scroll-to-message", { detail: { msgId } }),
	);
}

/* ────────────────────────────────────────────────────────── */
/*  ChatOutline component                                      */
/* ────────────────────────────────────────────────────────── */

export function ChatOutline() {
	const session = useStore(selectActiveSession);
	const [expanded, setExpanded] = useState(false);

	const messages = session?.messages ?? [];
	const entries = useMemo(() => extractOutlineEntries(messages), [messages]);

	/* Keyboard shortcut: Ctrl+Shift+O toggles the outline */
	useEffect(() => {
		function onKey(e: KeyboardEvent): void {
			if (e.ctrlKey && e.shiftKey && e.key === "O") {
				e.preventDefault();
				setExpanded((v) => !v);
			}
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	/* No session or no messages — render nothing */
	if (!session || entries.length === 0) return null;

	return (
		<>
			{/* ── Toggle tab (always visible) ── */}
			<button
				type="button"
				className={cn(
					"absolute right-0 top-1/2 z-20 -translate-y-1/2",
					"flex h-10 w-5 items-center justify-center rounded-l-md",
					"bg-paper-2 border border-r-0 border-line",
					"text-ink-4 hover:text-ink-2 hover:bg-paper-3",
					"transition-all duration-200",
					expanded && "opacity-0 pointer-events-none",
				)}
				onClick={() => setExpanded(true)}
				aria-label="Open outline (Ctrl+Shift+O)"
				title="Open outline (Ctrl+Shift+O)"
			>
				<List className="h-3 w-3" />
			</button>

			{/* ── Expanded panel ── */}
			<div
				className={cn(
					"absolute inset-y-0 right-0 z-30",
					"w-[220px] bg-paper border-l border-line shadow-[-2px_0_8px_-2px_rgba(0,0,0,0.08)]",
					"flex flex-col",
					"transition-transform duration-200 ease-out",
					expanded ? "translate-x-0" : "translate-x-full",
				)}
			>
				{/* Header */}
				<div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
					<span className="meta">outline</span>
					<span className="meta text-ink-4 ml-auto">{entries.length}</span>
					<button
						type="button"
						className="btn-ghost h-6 w-6 p-0"
						onClick={() => setExpanded(false)}
						aria-label="Close outline"
					>
						<X className="h-3 w-3" />
					</button>
				</div>

				{/* Scrollable list */}
				<div className="flex-1 overflow-y-auto overflow-x-hidden">
					{entries.map((entry) => (
						<button
							key={entry.msgId}
							type="button"
							className={cn(
								"w-full text-left px-3 py-2 border-b border-line/50",
								"hover:bg-paper-2 transition-colors group",
								"flex flex-col gap-0.5",
							)}
							onClick={() => dispatchScrollTo(entry.msgId)}
							title={entry.role === "user" ? entry.prompt : entry.response}
						>
							<div className="flex items-center gap-1.5">
								{/* Turn marker */}
								<span
									className={cn(
										"inline-flex h-4 min-w-[16px] items-center justify-center rounded px-0.5",
										"font-mono text-[9px] leading-none",
										entry.role === "user"
											? "bg-accent/15 text-accent"
											: "bg-paper-3 text-ink-3",
									)}
								>
									{entry.role === "user" ? "Q" : "A"}
								</span>

								{/* Time */}
								{entry.time ? (
									<span className="font-mono text-[9px] text-ink-4">
										{entry.time}
									</span>
								) : null}

								{/* Arrow indicator on hover */}
								<ChevronRight className="ml-auto h-3 w-3 text-ink-4 opacity-0 group-hover:opacity-100 transition-opacity" />
							</div>

							{/* Content snippet */}
							<span
								className={cn(
									"block truncate text-[11px] leading-tight",
									entry.role === "user"
										? "text-ink font-medium"
										: "text-ink-2",
								)}
							>
								{entry.role === "user" ? entry.prompt : entry.response}
							</span>
						</button>
					))}
				</div>

				{/* Footer */}
				<div className="flex h-7 shrink-0 items-center border-t border-line px-3">
					<span className="font-mono text-[9px] text-ink-4">
						{entries.filter((e) => e.role === "user").length} turns
					</span>
					<span className="ml-auto font-mono text-[9px] text-ink-4">
						Ctrl+Shift+O
					</span>
				</div>
			</div>
		</>
	);
}
