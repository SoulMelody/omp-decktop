import { selectActiveSession, useStore } from "@/lib/store";
import type { SessionUi } from "@/lib/types";
import { UpdatePill } from "./UpdatePill";
import { cn, formatTokens } from "@/lib/utils";

type SessionBarStatus = SessionUi["status"] | "queued";

const STATUS_TONE: Record<SessionBarStatus, string> = {
	idle: "text-ink-3",
	preparing: "text-thinking",
	streaming: "text-accent",
	compacting: "text-warn",
	retrying: "text-warn",
	queued: "text-thinking",
};

export function getSessionBarStatus(session: SessionUi): SessionBarStatus {
	if (session.status !== "idle") return session.status;

	const lastMessage = session.messages[session.messages.length - 1];
	const tailIsLiveAssistant =
		lastMessage != null && lastMessage.role === "assistant" && lastMessage.isStreaming === true;
	const anyToolRunning = Object.values(session.toolCalls).some((toolCall) => toolCall.status === "running");
	if (tailIsLiveAssistant || anyToolRunning) return "streaming";

	if (session.queuedPrompts.length > 0) return "queued";

	return "idle";
}

export function StatusBar() {
	const wsStatus = useStore((s) => s.wsStatus);
	const session = useStore(selectActiveSession);
	const sessionStatus = session ? getSessionBarStatus(session) : null;

	const wsTone =
		wsStatus === "open"
			? "text-success"
			: wsStatus === "connecting"
				? "text-warn"
				: "text-danger";

	return (
		<div className="flex items-center gap-x-3 font-mono text-2xs uppercase tracking-meta">
			<span className={cn("flex items-center gap-1.5", wsTone)}>
				<Dot className={cn("h-1.5 w-1.5", wsTone)} />
				{wsStatus}
			</span>
			{session ? (
				<>
					<span className="text-ink-4">·</span>
					<span className={sessionStatus ? STATUS_TONE[sessionStatus] : "text-ink-3"}>
						{sessionStatus === "idle" || sessionStatus == null ? "ready" : sessionStatus === "queued" ? session.queuedPrompts.length > 1 ? `queued·${session.queuedPrompts.length}` : "queued" : sessionStatus}
					</span>
					{session.retry ? (
						<>
							<span className="text-ink-4">·</span>
							<span className="text-warn">
								retry {session.retry.attempt}/{session.retry.maxAttempts}
							</span>
						</>
					) : null}
					{session.compaction ? (
						<>
							<span className="text-ink-4">·</span>
							<span className="text-warn">compact·{session.compaction.action}</span>
						</>
					) : null}
					{session.ttsr && Date.now() - session.ttsr.at < 8000 ? (
						<>
							<span className="text-ink-4">·</span>
							<span className="text-thinking">ttsr·{session.ttsr.rules.length}</span>
						</>
					) : null}
					{session.usage.totalTokens > 0 ? (
						<>
							<span className="text-ink-4">·</span>
							<span className="text-ink-3 normal-case tracking-normal">
								{formatTokens(session.usage.totalTokens)} tok
							</span>
						</>
					) : null}
				</>
			) : null}
			<UpdatePill />
		</div>
	);
}

function Dot({ className }: { className?: string }) {
	return (
		<span
			className={cn("inline-block rounded-full bg-current", className)}
			aria-hidden="true"
		/>
	);
}
