import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { useStore, selectActiveSession } from "@/lib/store";
import type { ChatMessage, TodoPhase } from "@/lib/types";
import { cn, truncate } from "@/lib/utils";
import { ChatHeader } from "./chat/ChatHeader";
import { QuickHistoryRail, type QuickHistoryItem } from "./chat/QuickHistoryRail";
import { SessionPicker } from "./chat/SessionPicker";
import { TodoPanel } from "./todos/TodoPanel";
import { UserMessage } from "./messages/UserMessage";
import { AssistantMessage } from "./messages/AssistantMessage";
import { Notice } from "./messages/Notice";
import { CompactionLine } from "./messages/CompactionLine";
import { TtsrLine } from "./messages/TtsrLine";
import { IrcLine } from "./messages/IrcLine";
import { QueuedMessage } from "./messages/QueuedMessage";
import { PlanApproval } from "./messages/PlanApproval";

export function isScrollToBottomAffordanceVisible(fromBottom: number): boolean {
	return fromBottom > 100;
}

export function getScrollToBottomTarget({ scrollHeight }: { scrollHeight: number }): { scrollTop: number; sticky: true } {
	return { scrollTop: scrollHeight, sticky: true };
}

export function shouldRenderPinnedTodosPanel({
	todoPanelOpen,
	todoPhases,
}: {
	todoPanelOpen: boolean;
	todoPhases: TodoPhase[];
}): boolean {
	return todoPanelOpen && todoPhases.length > 0;
}

export function Chat() {
	const session = useStore(selectActiveSession);
	const scrollRef = useRef<HTMLDivElement>(null);
	const stickyRef = useRef(true);
	const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
	const [activeAnchorId, setActiveAnchorId] = useState<string | undefined>(undefined);
	const [showScrollButton, setShowScrollButton] = useState(false);

	const messages = session?.messages ?? [];
	const toolCalls = session?.toolCalls ?? {};
	const queuedPrompts = session?.queuedPrompts ?? [];
	const todoPanelOpen = useStore((s) => s.todoPanelOpen);
	const todoPhases = session?.todoPhases ?? [];

	// A "busy but nothing visible yet" indicator. Covers the silent windows
	// where the agent is working but no live content is on screen: right after
	// submit ("preparing"), and the time-to-first-token gap between `turn_start`
	// and the first streamed output. Suppressed once an assistant message is
	// actively streaming or a tool is running, since those render their own
	// live state — avoids a redundant second spinner.
	const lastMessage = messages[messages.length - 1];
	const tailIsLiveAssistant =
		lastMessage != null && lastMessage.role === "assistant" && lastMessage.isStreaming === true;
	const anyToolRunning = Object.values(toolCalls).some((t) => t.status === "running");
	const busyHint =
		session?.status === "preparing"
			? "preparing…"
			: session?.status === "streaming" && !tailIsLiveAssistant && !anyToolRunning
				? "working…"
				: null;
	const railItems = useMemo(() => buildRailItems(messages), [messages]);
	const railAnchorIds = useMemo(() => new Set(railItems.map((item) => item.id)), [railItems]);

	const syncActiveAnchor = useCallback(() => {
		const el = scrollRef.current;
		if (!el || railItems.length === 0) return;
		const probe = el.scrollTop + el.clientHeight * 0.18;
		let nextId = railItems[0]?.id;

		for (const item of railItems) {
			const node = messageRefs.current[item.id];
			if (!node) continue;
			if (node.offsetTop <= probe) nextId = item.id;
			else break;
		}

		setActiveAnchorId((current) => (current === nextId ? current : nextId));
	}, [railItems]);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		if (stickyRef.current) {
			el.scrollTop = el.scrollHeight;
		}
		syncActiveAnchor();
	}, [messages, queuedPrompts, syncActiveAnchor, toolCalls, session?.status]);

	useEffect(() => {
		syncActiveAnchor();
	}, [syncActiveAnchor]);

	function handleScroll(): void {
		const el = scrollRef.current;
		if (!el) return;
		const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
		const showButton = isScrollToBottomAffordanceVisible(fromBottom);
		stickyRef.current = !showButton;
		setShowScrollButton(showButton);
		syncActiveAnchor();
	}

	function scrollToBottom(): void {
		const el = scrollRef.current;
		if (!el) return;
		const target = getScrollToBottomTarget({ scrollHeight: el.scrollHeight });
		el.scrollTop = target.scrollTop;
		stickyRef.current = target.sticky;
		setShowScrollButton(false);
		syncActiveAnchor();
	}

	const jumpToMessage = useCallback((id: string) => {
		const el = scrollRef.current;
		const node = messageRefs.current[id];
		if (!el || !node) return;
		stickyRef.current = false;
		el.scrollTo({ top: Math.max(0, node.offsetTop - 24), behavior: "smooth" });
		setActiveAnchorId(id);
	}, []);

	// No active session — show the picker as the main pane instead of a
	// dead-end "go to sidebar" message.
	if (!session) {
		return <SessionPicker />;
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			<ChatHeader />
			{shouldRenderPinnedTodosPanel({ todoPanelOpen, todoPhases }) ? (
				<div className="max-h-[40vh] shrink-0 overflow-y-auto">
					<TodoPanel phases={todoPhases} />
				</div>
			) : null}
			<div className="relative flex-1 min-h-0">
				<div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto">
					<div className="mx-auto flex max-w-[760px] flex-col gap-7 px-6 py-10 lg:pr-20">
					{messages.length === 0 ? (
						<div className="text-center font-mono text-2xs uppercase tracking-meta text-ink-3">
							Empty session — send a prompt below.
						</div>
					) : null}

					{messages.map((m) => {
						const isActiveAnchor = activeAnchorId === m.id && railAnchorIds.has(m.id);
						const wrapperClassName = cn(
							"scroll-mt-6 transition-[background-color,box-shadow,padding,margin] duration-200",
							isActiveAnchor && "-mx-3 rounded-2xl bg-paper-2/70 px-3 py-2 shadow-[inset_0_0_0_1px_rgba(164,160,151,0.18)]",
						);
						switch (m.role) {
							case "user":
								return (
									<div
										key={m.id}
										ref={(node) => {
											messageRefs.current[m.id] = node;
										}}
										className={wrapperClassName}
									>
										<UserMessage msg={m} />
									</div>
								);
							case "assistant":
								return (
									<div
										key={m.id}
										ref={(node) => {
											messageRefs.current[m.id] = node;
										}}
										className={wrapperClassName}
									>
										<AssistantMessage msg={m} toolCalls={toolCalls} sessionId={session.sessionId} />
									</div>
								);
							case "notice":
								return (
									<div
										key={m.id}
										ref={(node) => {
											messageRefs.current[m.id] = node;
										}}
										className={wrapperClassName}
									>
										<Notice msg={m} />
									</div>
								);
							case "compaction":
								return (
									<div
										key={m.id}
										ref={(node) => {
											messageRefs.current[m.id] = node;
										}}
										className={wrapperClassName}
									>
										<CompactionLine msg={m} />
									</div>
								);
							case "ttsr":
								return (
									<div
										key={m.id}
										ref={(node) => {
											messageRefs.current[m.id] = node;
										}}
										className={wrapperClassName}
									>
										<TtsrLine msg={m} />
									</div>
								);
							case "irc":
								return (
									<div
										key={m.id}
										ref={(node) => {
											messageRefs.current[m.id] = node;
										}}
										className={wrapperClassName}
									>
										<IrcLine msg={m} />
									</div>
								);
							default:
								return null;
						}
					})}

					{queuedPrompts.map((q) => (
						<QueuedMessage key={q.id} msg={q} />
					))}
					{busyHint ? (
						<div className="cursor-blink font-mono text-2xs uppercase tracking-meta text-thinking">
							{busyHint}
						</div>
					) : null}
					{session.pendingPlanApproval ? (
						<PlanApproval session={session} />
					) : null}
					</div>
				</div>
				<QuickHistoryRail items={railItems} activeId={activeAnchorId} onJump={jumpToMessage} />
				{showScrollButton ? (
					<button
						type="button"
						onClick={scrollToBottom}
						aria-label="Scroll to bottom"
						className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-line bg-paper-2 p-2 text-ink-2 shadow-[0_8px_24px_-8px_rgba(26,24,20,0.25)] transition hover:bg-paper hover:text-ink"
					>
						<ArrowDown className="h-4 w-4" />
					</button>
				) : null}
			</div>
		</div>
	);
}

function buildRailItems(messages: ChatMessage[]): QuickHistoryItem[] {
	const primaryItems: QuickHistoryItem[] = [];
	const assistantFallback: QuickHistoryItem[] = [];
	let promptCount = 0;

	for (const message of messages) {
		switch (message.role) {
			case "user": {
				promptCount += 1;
				primaryItems.push({
					id: message.id,
					label: summarizeLabel(message.text, message.synthetic ? "Synthetic prompt" : "New prompt"),
					caption: message.synthetic ? "Synthetic prompt" : `Prompt ${promptCount}`,
					kind: "user",
				});
				break;
			}
			case "notice":
				primaryItems.push({
					id: message.id,
					label: summarizeLabel(message.message, "Notice"),
					caption: "Notice",
					kind: "notice",
				});
				break;
			case "compaction":
				primaryItems.push({
					id: message.id,
					label: summarizeLabel(message.summary ?? `${message.action}: ${message.reason}`, "Compaction"),
					caption: "Compaction",
					kind: "compaction",
				});
				break;
			case "assistant": {
				const textBlock = message.blocks.find((block) => block.type === "text");
				const text = textBlock?.type === "text" ? textBlock.text : message.errorMessage;
				if (!text) break;
				assistantFallback.push({
					id: message.id,
					label: summarizeLabel(text, "Assistant reply"),
					caption: "Assistant",
					kind: "assistant",
				});
				break;
			}
			default:
				break;
		}
	}

	return compressRailItems(primaryItems.length > 0 ? primaryItems : assistantFallback, 18);
}

function summarizeLabel(text: string | undefined, fallback: string): string {
	const compact = (text ?? "")
		.replace(/\s+/g, " ")
		.replace(/^[-*]\s+/, "")
		.trim();
	return compact ? truncate(compact, 140) : fallback;
}

function compressRailItems(items: QuickHistoryItem[], maxItems: number): QuickHistoryItem[] {
	if (items.length <= maxItems) return items;
	if (maxItems <= 2) {
		const first = items[0];
		const last = items[items.length - 1];
		return first && last ? [first, last] : items;
	}

	const picked = new Set<number>([0, items.length - 1]);
	for (let step = 1; step <= maxItems - 2; step += 1) {
		picked.add(Math.round((step * (items.length - 1)) / (maxItems - 1)));
	}

	return items.filter((_, index) => picked.has(index));
}
