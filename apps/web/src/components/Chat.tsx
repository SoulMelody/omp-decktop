import { useCallback, useEffect, useRef } from "react";
import { useStore, selectActiveSession } from "@/lib/store";
import { ChatHeader } from "./chat/ChatHeader";
import { SessionPicker } from "./chat/SessionPicker";
import { UserMessage } from "./messages/UserMessage";
import { AssistantMessage } from "./messages/AssistantMessage";
import { Notice } from "./messages/Notice";
import { CompactionLine } from "./messages/CompactionLine";
import { TtsrLine } from "./messages/TtsrLine";
import { IrcLine } from "./messages/IrcLine";
import { QueuedMessage } from "./messages/QueuedMessage";
import { PlanApproval } from "./messages/PlanApproval";
import { ChatOutline } from "./ChatOutline";

export function Chat() {
	const session = useStore(selectActiveSession);
	const scrollRef = useRef<HTMLDivElement>(null);
	const stickyRef = useRef(true);

	const messages = session?.messages ?? [];
	const toolCalls = session?.toolCalls ?? {};
	const queuedPrompts = session?.queuedPrompts ?? [];

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		if (stickyRef.current) {
			el.scrollTop = el.scrollHeight;
		}
	}, [messages, toolCalls, queuedPrompts]);

	/* Listen for outline "scroll-to-message" events. */
	const scrollToMessage = useCallback((e: Event) => {
		const detail = (e as CustomEvent).detail as { msgId: string };
		const el = scrollRef.current;
		if (!el || !detail?.msgId) return;
		const target = el.querySelector(`[data-msg-id="${detail.msgId}"]`);
		if (target) {
			target.scrollIntoView({ behavior: "smooth", block: "start" });
		}
	}, []);

	useEffect(() => {
		window.addEventListener("omp:scroll-to-message", scrollToMessage);
		return () => window.removeEventListener("omp:scroll-to-message", scrollToMessage);
	}, [scrollToMessage]);

	function handleScroll(): void {
		const el = scrollRef.current;
		if (!el) return;
		const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
		stickyRef.current = fromBottom < 100;
	}

	// No active session — show the picker as the main pane instead of a
	// dead-end "go to sidebar" message.
	if (!session) {
		return <SessionPicker />;
	}

	return (
		<div className="relative flex h-full min-h-0 flex-col">
			<ChatHeader />
			<div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
				<div className="mx-auto flex max-w-[760px] flex-col gap-7 px-6 py-10">
					{messages.length === 0 ? (
						<div className="text-center font-mono text-2xs uppercase tracking-meta text-ink-3">
							Empty session — send a prompt below.
						</div>
					) : null}

					{messages.map((m) => {
						switch (m.role) {
							case "user":
								return <div key={m.id} data-msg-id={m.id}><UserMessage msg={m} /></div>;
							case "assistant":
								return <div key={m.id} data-msg-id={m.id}><AssistantMessage msg={m} toolCalls={toolCalls} /></div>;
							case "notice":
								return <div key={m.id} data-msg-id={m.id}><Notice msg={m} /></div>;
							case "compaction":
								return <div key={m.id} data-msg-id={m.id}><CompactionLine msg={m} /></div>;
							case "ttsr":
								return <div key={m.id} data-msg-id={m.id}><TtsrLine msg={m} /></div>;
							case "irc":
								return <div key={m.id} data-msg-id={m.id}><IrcLine msg={m} /></div>;
							default:
								return null;
						}
					})}

					{queuedPrompts.map((q) => (
						<QueuedMessage key={q.id} msg={q} />
					))}
					{session.pendingPlanApproval ? (
						<PlanApproval session={session} />
					) : null}
				</div>
			</div>
			<ChatOutline />
		</div>
	);
}
