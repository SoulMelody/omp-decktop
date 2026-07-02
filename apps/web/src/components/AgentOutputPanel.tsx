import { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { X } from "lucide-react";
import { cn, formatCost, formatDurationMs } from "@/lib/utils";

interface AgentOutputPanelProps {
	sessionId: string;
	agentId: string;
	open: boolean;
	onClose: () => void;
	status?: string;
	description?: string;
	durationMs?: number;
	cost?: number;
}

function classifyAgentOutputError(message: string): string {
	if (message.includes("Invalid agentId")) return "Invalid agent id. The output path was rejected.";
	if (message.includes("Session not found or not active")) return "Session is not active, so this output cannot be loaded from the current artifact API.";
	if (message.includes("Agent output not found")) return "Agent output artifact is not available yet.";
	return message;
}

export function AgentOutputPanel({
	sessionId,
	agentId,
	open,
	onClose,
	status,
	description,
	durationMs,
	cost,
}: AgentOutputPanelProps) {
	const [content, setContent] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetchOutput = useCallback(async () => {
		if (!open || !agentId) return;
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(
				`/api/sessions/${encodeURIComponent(sessionId)}/agent-output/${encodeURIComponent(agentId)}`,
			);
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
			}
			const text = await res.text();
			setContent(text);
		} catch (err) {
			setError(err instanceof Error ? classifyAgentOutputError(err.message) : "Unknown error");
			setContent(null);
		} finally {
			setLoading(false);
		}
	}, [open, sessionId, agentId]);

	useEffect(() => {
		if (open) {
			fetchOutput();
		} else {
			setContent(null);
			setError(null);
		}
	}, [open, fetchOutput]);

	if (!open) return null;

	return (
		<div
			className={cn(
				"fixed inset-y-0 right-0 z-40 w-full max-w-xl",
				"bg-paper border-l border-line shadow-2xl",
				"flex flex-col",
			)}
		>
			{/* Header */}
			<div className="flex items-center justify-between shrink-0 px-4 py-3 border-b border-line">
				<div className="font-mono text-sm">
					<span className="text-ink-3">agent://</span>
					<span className="text-accent">{agentId}</span>
					<div className="mt-1 flex flex-wrap gap-2 font-mono text-2xs text-ink-4">
						{status ? <span>{status}</span> : null}
						{durationMs != null ? <span>{formatDurationMs(durationMs)}</span> : null}
						{cost != null ? <span>{formatCost(cost)}</span> : null}
					</div>
					{description ? <div className="mt-1 text-xs text-ink-3">{description}</div> : null}
				</div>
				<button
					type="button"
					onClick={onClose}
					className="p-1 rounded hover:bg-line text-ink-3 hover:text-ink transition-colors"
					aria-label="Close panel"
				>
					<X size={16} />
				</button>
			</div>

			{/* Body */}
			<div className="flex-1 overflow-y-auto px-4 py-3">
				{loading ? (
					<div className="text-ink-3 text-sm animate-pulse">Loading output...</div>
				) : error ? (
					<div className="text-danger text-sm">{error}</div>
				) : content ? (
					<div className="prose prose-sm prose-invert max-w-none">
						<ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
							{content}
						</ReactMarkdown>
					</div>
				) : null}
			</div>
		</div>
	);
}