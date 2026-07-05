import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn, shortPath, truncate, formatTokens, formatCost } from "@/lib/utils";
import type { SessionUi } from "@/lib/types";
import { firstUserMessage, lastUserMessage, lastConversationMessage, formatSessionId } from "@/lib/session-display";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { SessionLaunchModal, type SessionLaunchOpts } from "@/components/chat/SessionLaunchModal";

export function Sidebar() {
	const { t } = useTranslation();
	const selectedCwd = useStore((s) => s.selectedWorkspaceCwd);
	const workspaces = useStore((s) => s.workspaces);
	const defaultCwd = useStore((s) => s.defaultCwd);
	const setSelectedWorkspaceCwd = useStore((s) => s.setSelectedWorkspaceCwd);
	const sessions = useStore((s) => s.sessions);
	const activeId = useStore((s) => s.activeId);
	const sessionsById = useStore((s) => s.sessionsById);
	const refreshSessions = useStore((s) => s.refreshSessions);
	const refreshWorkspaces = useStore((s) => s.refreshWorkspaces);
	const createSession = useStore((s) => s.createSession);
	const selectSession = useStore((s) => s.selectSession);
	const disposeSession = useStore((s) => s.disposeSession);


	const [creating, setCreating] = useState(false);
	const [launchOpen, setLaunchOpen] = useState(false);
	// Session pending deletion — drives the confirm modal. `deleteFile` is the
	// opt-in "also remove the on-disk transcript" toggle, defaulting off so the
	// historical dispose-only behavior is the safe default.
	const [pendingDelete, setPendingDelete] = useState<string | null>(null);
	const [deleteFile, setDeleteFile] = useState(false);
	const [deleting, setDeleting] = useState(false);

	const cwdInUse = selectedCwd || defaultCwd;

	const filtered = useMemo(() => {
		if (!selectedCwd) return sessions;
		return sessions.filter((s) => s.cwd === selectedCwd);
	}, [sessions, selectedCwd]);

	async function launchSession(opts: SessionLaunchOpts): Promise<void> {
		setCreating(true);
		try {
			await createSession({ cwd: opts.cwd, model: opts.model, planMode: opts.planMode });
			setLaunchOpen(false);
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
			alert(t("sidebar.resumeFailed", { error: String(err) }));
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

	function handleDelete(id: string): void {
		// Open the confirm modal; the on-disk toggle resets to off each time so a
		// prior permanent-delete can't silently carry over to the next session.
		setPendingDelete(id);
		setDeleteFile(false);
	}

	async function confirmDelete(): Promise<void> {
		if (!pendingDelete) return;
		setDeleting(true);
		try {
			await disposeSession(pendingDelete, deleteFile);
			void refreshSessions(selectedCwd || undefined);
			setPendingDelete(null);
		} catch (err) {
			console.error("delete session failed", err);
		} finally {
			setDeleting(false);
		}
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="space-y-3 px-3 py-3 border-b border-line">
				<div className="flex items-center justify-between">
					<div className="meta">{t("sidebar.workspace")}</div>
					<button
						type="button"
						className="text-ink-3 hover:text-ink"
						onClick={() => void refreshWorkspaces()}
						aria-label={t("sidebar.refreshWorkspaces")}
					>
						<RefreshCw className="h-3 w-3" />
					</button>
				</div>

				<select
					value={selectedCwd}
					onChange={(e) => {
						setSelectedWorkspaceCwd(e.target.value);
						void refreshSessions(e.target.value || undefined);
					}}
					className="field h-7 w-full px-2 font-mono text-xs"
				>
					<option value="">{t("sidebar.allWorkspaces")}</option>
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
					onClick={() => setLaunchOpen(true)}
					disabled={creating}
				>
					<Plus className="h-3.5 w-3.5" />
					{t("sidebar.newSession")}
				</button>
			</div>

			<div className="flex items-center justify-between px-3 pt-3 pb-1">
				<div className="meta">{t("sidebar.sessions")} · {visibleCount}</div>
				<button
					type="button"
					className="text-ink-3 hover:text-ink"
					onClick={() => void refreshSessions(selectedCwd || undefined)}
					aria-label={t("sidebar.refreshSessions")}
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
							goalMode={s.goalMode}
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
						subtitle={`${t("sidebar.messageCount", { count: s.messageCount })} · ${shortPath(s.cwd, 20)}`}
						meta={formatRelative(s.updatedAt || s.createdAt)}
						onClick={() => void handleResume(s.path)}
						onDelete={() => void handleDelete(s.id)}
					/>
				))}

				{visibleCount === 0 ? (
					<div className="px-3 py-6 text-center font-mono text-2xs text-ink-3">
						{t("sidebar.noSessions")}
					</div>
				) : null}
			</div>
			<SessionLaunchModal
				open={launchOpen}
				initialCwd={cwdInUse}
				onCancel={() => setLaunchOpen(false)}
				onConfirm={launchSession}
			/>
			<Modal
				open={pendingDelete !== null}
				onClose={() => (deleting ? undefined : setPendingDelete(null))}
				widthClass="max-w-md"
				heightClass=""
			>
				<div className="flex flex-col gap-4 p-5">
					<div>
						<h2 className="text-sm font-semibold text-ink">{t("sidebar.deleteDialog.title")}</h2>
						<p className="mt-1.5 text-xs leading-relaxed text-ink-3">
							{t("sidebar.deleteDialog.body")}
						</p>
					</div>

					<label className="flex cursor-pointer items-start gap-2.5">
						<input
							type="checkbox"
							className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-danger"
							checked={deleteFile}
							onChange={(e) => setDeleteFile(e.target.checked)}
							disabled={deleting}
						/>
						<span className="min-w-0">
							<span className="block text-xs text-ink-2">{t("sidebar.deleteDialog.alsoDeleteFile")}</span>
							<span className="mt-0.5 block text-2xs text-ink-4">
								{t("sidebar.deleteDialog.alsoDeleteFileHint")}
							</span>
						</span>
					</label>

					<div className="flex justify-end gap-2">
						<Button variant="ghost" size="sm" onClick={() => setPendingDelete(null)} disabled={deleting}>
							{t("common.actions.cancel")}
						</Button>
						<Button variant="danger" size="sm" onClick={() => void confirmDelete()} disabled={deleting}>
							{deleteFile ? t("sidebar.deleteDialog.confirmWithFile") : t("sidebar.deleteDialog.confirm")}
						</Button>
					</div>
				</div>
			</Modal>
		</div>
	);
}




/** Build the meta line for a live session: "3t · 12.4k tok · $0.042" */
function buildLiveMeta(s: SessionUi): string {
	const parts: string[] = [];
	if (s.turnCount > 0) parts.push(`${s.turnCount}t`);
	if (s.usage.totalTokens > 0) parts.push(`${formatTokens(s.usage.totalTokens)} tok`);
	if (s.usage.cost > 0) parts.push(formatCost(s.usage.cost));
	return parts.join(" · ");
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

// `key` indexes into `sidebar.status.*`; the literal label is resolved at
// render time so the badge follows the active locale.
const STATUS_LABELS: Record<string, { key: string; cls: string }> = {
	streaming: { key: "streaming", cls: "bg-accent/10 text-accent" },
	compacting: { key: "compact", cls: "bg-warn/10 text-warn" },
	retrying: { key: "retry", cls: "bg-danger/10 text-danger" },
};

function SessionRow({
	title,
	subtitle,
	meta,
	active,
	live,
	status,
	planMode,
	goalMode,
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
	goalMode?: { status: string };
	onClick: () => void;
	onDelete?: () => void;
}) {
	const { t } = useTranslation();
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
					<span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-label={t("sidebar.live")} />
				) : (
					<span className="h-1.5 w-1.5 shrink-0 rounded-full bg-line-strong" />
				)}
				<span className="truncate font-medium">{title}</span>
			</div>

			{/* Status badges row */}
			{live && status && STATUS_LABELS[status] || planMode || goalMode ? (
				<div className="mt-0.5 flex items-center gap-1 pl-3">
					{live && status && STATUS_LABELS[status] ? (
						<span className={cn("inline-flex h-4 items-center rounded px-1 font-mono text-[10px] uppercase tracking-meta", STATUS_LABELS[status]!.cls)}>
							{t(STATUS_LABELS[status]!.key)}
						</span>
					) : null}
					{planMode ? (
						<span className="inline-flex h-4 items-center rounded border border-thinking/40 bg-thinking/10 px-1 font-mono text-[10px] uppercase tracking-meta text-thinking"
							title={t("sidebar.planModeActive")}
						>
							{t("sidebar.planBadge")}
						</span>
					) : null}
					{goalMode ? (
						<span className="inline-flex h-4 items-center rounded border border-accent/40 bg-accent/10 px-1 font-mono text-[10px] uppercase tracking-meta text-accent"
							title={t("sidebar.goalBadge", { status: goalMode.status })}
						>
							{t("sidebar.goalBadge", { status: goalMode.status })}
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
					title={t("sidebar.deleteSession")}
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
