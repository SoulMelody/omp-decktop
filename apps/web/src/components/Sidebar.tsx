import { useMemo, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn, shortPath, truncate, formatTokens, formatCost } from "@/lib/utils";
import type { SessionUi, UserMsg, AssistantMsg } from "@/lib/types";
import { api } from "@/lib/api";

export function Sidebar() {
	const workspaces = useStore((s) => s.workspaces);
	const defaultCwd = useStore((s) => s.defaultCwd);
	const sessions = useStore((s) => s.sessions);
	const activeId = useStore((s) => s.activeId);
	const sessionsById = useStore((s) => s.sessionsById);
	const refreshSessions = useStore((s) => s.refreshSessions);
	const refreshWorkspaces = useStore((s) => s.refreshWorkspaces);
	const createSession = useStore((s) => s.createSession);
	const selectSession = useStore((s) => s.selectSession);
	const disposeSession = useStore((s) => s.disposeSession);

	const [selectedCwd, setSelectedCwd] = useState<string | "">("");
	const [creating, setCreating] = useState(false);

	const cwdInUse = selectedCwd || defaultCwd;

	const filtered = useMemo(() => {
		if (!selectedCwd) return sessions;
		return sessions.filter((s) => s.cwd === selectedCwd);
	}, [sessions, selectedCwd]);

	async function handleNew(): Promise<void> {
		setCreating(true);
		try {
			await createSession({ cwd: cwdInUse });
		} catch (err) {
			console.error(err);
			alert(`Failed to create session: ${String(err)}`);
		} finally {
			setCreating(false);
		}
	}

	async function handleResume(p: string): Promise<void> {
		setCreating(true);
		try {
			await createSession({ cwd: cwdInUse, resumeFromPath: p });
		} catch (err) {
			console.error(err);
			alert(`Failed to resume: ${String(err)}`);
		} finally {
			setCreating(false);
		}
	}

	const allLive = Object.values(sessionsById);
	// `live` is the in-memory subscription set; `persisted` is the on-disk
	// index the server returned. Both must be filtered by the selected
	// workspace so the count matches what we actually render — otherwise a
	// session in memory from a previous workspace sticks around as a "ghost"
	// row (the count says 1, the list shows 2) and the user can't tell which
	// workspace it actually belongs to.
	const liveSessions = selectedCwd
		? allLive.filter((s) => s.cwd === selectedCwd)
		: allLive;
	const persisted = filtered.filter((s) => !sessionsById[s.id]);
	const visibleCount = liveSessions.length + persisted.length;

	async function handleDelete(id: string): Promise<void> {
		if (!confirm("Delete this session?")) return;
		try {
			await disposeSession(id);
			void refreshSessions(selectedCwd || undefined);
		} catch (err) {
			console.error("delete session failed", err);
		}
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="space-y-3 px-3 py-3 border-b border-line">
				<div className="flex items-center justify-between">
					<div className="meta">Workspace</div>
					<button
						type="button"
						className="text-ink-3 hover:text-ink"
						onClick={() => void refreshWorkspaces()}
						aria-label="Refresh workspaces"
					>
						<RefreshCw className="h-3 w-3" />
					</button>
				</div>

				<select
					value={selectedCwd}
					onChange={(e) => {
						setSelectedCwd(e.target.value);
						void refreshSessions(e.target.value || undefined);
					}}
					className="field h-7 w-full px-2 font-mono text-xs"
				>
					<option value="">(all workspaces)</option>
					{workspaces.map((w) => (
						<option key={w.cwd} value={w.cwd}>
							{w.label} · {w.sessionCount}
						</option>
					))}
				</select>
				<div className="truncate font-mono text-2xs text-ink-3" title={cwdInUse}>
					{cwdInUse}
				</div>
				<button
					type="button"
					className="btn-primary h-8 w-full text-[13px]"
					onClick={() => void handleNew()}
					disabled={creating}
				>
					<Plus className="h-3.5 w-3.5" />
					New session
				</button>
			</div>

			<div className="flex items-center justify-between px-3 pt-3 pb-1">
				<div className="meta">Sessions · {visibleCount}</div>
				<button
					type="button"
					className="text-ink-3 hover:text-ink"
					onClick={() => void refreshSessions(selectedCwd || undefined)}
					aria-label="Refresh sessions"
				>
					<RefreshCw className="h-3 w-3" />
				</button>
			</div>

			<div className="flex-1 overflow-y-auto px-1 pb-3">
				{liveSessions.map((s) => {
					const fallback = lastUserMessage(s) || lastConversationMessage(s) || firstUserMessage(s);
					const title = s.sessionName || fallback || formatSessionId(s.sessionId);
					const meta = buildLiveMeta(s);
					return (
						<SessionRow
							key={s.sessionId}
							title={title}
							subtitle={shortPath(s.cwd, 30)}
							meta={meta}
							active={s.sessionId === activeId}
							live
							status={s.status}
							planMode={s.planMode?.enabled === true}
							onClick={() => selectSession(s.sessionId)}
							onDelete={() => void handleDelete(s.sessionId)}
						/>
					);
				})}

				{liveSessions.length > 0 && persisted.length > 0 ? (
					<div className="my-2 mx-2 border-t border-line" />
				) : null}

				{persisted.map((s) => (
					<SessionRow
						key={s.id}
						title={s.title || truncate(s.preview || "", 52) || formatSessionId(s.id)}
						subtitle={`${s.messageCount} msgs · ${shortPath(s.cwd, 20)}`}
						meta={formatRelative(s.updatedAt || s.createdAt)}
						onClick={() => void handleResume(s.path)}
						onDelete={() => void handleDelete(s.id)}
					/>
				))}

				{visibleCount === 0 ? (
					<div className="px-3 py-6 text-center font-mono text-2xs text-ink-3">
						No sessions yet.
					</div>
				) : null}
			</div>
		</div>
	);
}

/* ────────────────────────────────────────────────────────── */
/*  Helpers                                                    */
/* ────────────────────────────────────────────────────────── */

/** Extract the first user message text from a live session. */
function firstUserMessage(s: SessionUi): string {
	for (const m of s.messages) {
		if (m.role === "user") {
			const um = m as UserMsg;
			const text = um.text.replace(/\n/g, " ").trim();
			if (text) return truncate(text, 52);
		}
	}
	return "";
}

/** Extract the last user message text from a live session. */
function lastUserMessage(s: SessionUi): string {
	for (let i = s.messages.length - 1; i >= 0; i--) {
		const m = s.messages[i];
		if (!m || m.role !== "user") continue;
		const text = (m as UserMsg).text.replace(/\n/g, " ").trim();
		if (text) return truncate(text, 52);
	}
	return "";
}

/**
 * Extract the last meaningful assistant message from a live session.
 * Walks backward so the most recent exchange wins.
 */
function lastConversationMessage(s: SessionUi): string {
	for (let i = s.messages.length - 1; i >= 0; i--) {
		const m = s.messages[i];
		if (!m || m.role !== "assistant") continue;
		const am = m as AssistantMsg;
		const textBlock = am.blocks.find((b) => b.type === "text");
		if (textBlock?.type === "text") {
			const text = textBlock.text.replace(/\n/g, " ").trim();
			if (text) return truncate(text, 52);
		}
	}
	return "";
}

/** Build the meta line for a live session: "3t · 12.4k tok · $0.042" */
function buildLiveMeta(s: SessionUi): string {
	const parts: string[] = [];
	if (s.turnCount > 0) parts.push(`${s.turnCount}t`);
	if (s.usage.totalTokens > 0) parts.push(`${formatTokens(s.usage.totalTokens)} tok`);
	if (s.usage.cost > 0) parts.push(formatCost(s.usage.cost));
	return parts.join(" · ");
}

function formatSessionId(id: string): string {
	if (id.length <= 8) return id;
	return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

const RELATIVE_THRESHOLDS: Array<[number, string]> = [
	[60_000, "just now"],
	[3_600_000, "m"],
	[86_400_000, "h"],
	[2_592_000_000, "d"],
];

function formatRelative(ts: string): string {
	if (!ts) return "";
	const d = new Date(ts);
	if (Number.isNaN(d.getTime())) return ts;
	const diff = Date.now() - d.getTime();
	if (diff < 0) return d.toLocaleDateString();
	const first = RELATIVE_THRESHOLDS[0];
	if (!first || diff < first[0]) return "just now";
	for (let i = 1; i < RELATIVE_THRESHOLDS.length; i++) {
		const cur = RELATIVE_THRESHOLDS[i];
		const prev = RELATIVE_THRESHOLDS[i - 1];
		if (!cur || !prev) continue;
		if (diff < cur[0]) return `${Math.floor(diff / prev[0])}${cur[1]} ago`;
	}
	return d.toLocaleDateString();
}

/* ────────────────────────────────────────────────────────── */
/*  SessionRow                                                 */
/* ────────────────────────────────────────────────────────── */

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
	streaming: { label: "streaming", cls: "bg-accent/10 text-accent" },
	compacting: { label: "compact", cls: "bg-warn/10 text-warn" },
	retrying: { label: "retry", cls: "bg-danger/10 text-danger" },
};

function SessionRow({
	title,
	subtitle,
	meta,
	active,
	live,
	status,
	planMode,
	onClick,
	onDelete,
}: {
	title: string;
	subtitle?: string;
	meta?: string;
	active?: boolean;
	live?: boolean;
	status?: string;
	planMode?: boolean;
	onClick: () => void;
	onDelete?: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"group relative block w-full rounded-md px-2 py-2 text-left text-[13px] transition-colors",
				active
					? "bg-accent-soft/20 text-ink"
					: "text-ink-2 hover:bg-paper-3/60",
			)}
		>
			{/* Active accent bar */}
			{active ? (
				<span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-sm bg-accent" />
			) : null}

			{/* Title row */}
			<div className="flex items-center gap-1.5">
				{live ? (
					<span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-label="live" />
				) : (
					<span className="h-1.5 w-1.5 shrink-0 rounded-full bg-line-strong" />
				)}
				<span className="truncate font-medium">{title}</span>
			</div>

			{/* Status badges row */}
			{live && status && STATUS_LABELS[status] || planMode ? (
				<div className="mt-0.5 flex items-center gap-1 pl-3">
					{live && status && STATUS_LABELS[status] ? (
						<span className={cn("inline-flex h-4 items-center rounded px-1 font-mono text-[10px] uppercase tracking-meta", STATUS_LABELS[status]!.cls)}>
							{STATUS_LABELS[status]!.label}
						</span>
					) : null}
					{planMode ? (
						<span className="inline-flex h-4 items-center rounded border border-thinking/40 bg-thinking/10 px-1 font-mono text-[10px] uppercase tracking-meta text-thinking"
							title="Plan mode active"
						>
							plan
						</span>
					) : null}
				</div>
			) : null}

			{/* Subtitle (cwd) */}
			{subtitle ? (
				<div className="mt-0.5 truncate pl-3 font-mono text-2xs text-ink-3">
					{subtitle}
				</div>
			) : null}

			{/* Meta (turns · tokens · cost / relative time) */}
			{meta ? (
				<div className="truncate pl-3 font-mono text-2xs text-ink-4">{meta}</div>
			) : null}

			{/* Delete button — visible on hover */}
			{onDelete ? (
				<span
					role="button"
					tabIndex={0}
					title="Delete session"
					onClick={(e) => { e.stopPropagation(); onDelete(); }}
					onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onDelete(); } }}
					className="absolute right-1 top-1.5 hidden h-5 w-5 items-center justify-center rounded text-ink-4 hover:bg-danger/10 hover:text-danger group-hover:flex"
				>
					<Trash2 className="h-3 w-3" />
				</span>
			) : null}
		</button>
	);
}
