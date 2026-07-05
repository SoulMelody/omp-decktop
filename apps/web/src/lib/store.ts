import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

import type {
	AgentSessionEventJson,
	ExtUiDialogResponse,
	GoalModeContextWire,
	ImageAttachment,
	ListSessionsResponse,
	ListWorkspacesResponse,
	ModelRef,
	NotificationLevel,
	PendingPlanApprovalWire,
	PlanModeContextWire,
	SessionSummary,
	ServerFrame,
	WorkspaceEntry,
} from "@omp-deck/protocol";

/**
 * In-app notification record. Mirrors the wire frame plus client-side
 * metadata: `receivedAtMs` for ordering, `deliveredOs` so the OS-level
 * Notification renderer only fires once per item.
 */
export interface NotificationItem {
	id: string;
	level: NotificationLevel;
	title: string;
	body?: string;
	sound?: boolean;
	source?: string;
	actionUrl?: string;
	timestamp: string;
	receivedAtMs: number;
	deliveredOs: boolean;
	dismissed: boolean;
}

/** Max notifications retained in the in-app queue. Older items fall off. */
const MAX_NOTIFICATIONS = 50;

import { api } from "./api";
import { applyEvent, initSession } from "./reducer";
import type { SessionUi, UserMsg } from "./types";
import { WsClient, type WsStatus } from "./ws";

// ─── Render batching for session events ────────────────────────────────────
//
// The SDK fires `message_update` once per streaming chunk (often a single
// token). Without batching each event triggers a full Zustand state update,
// a React re-render, and — most expensively — a complete ReactMarkdown parse
// + rehype-highlight pass over the entire message text. By coalescing events
// into one `requestAnimationFrame` flush we cut render count by 5–10× during
// fast streaming while adding at most one frame (~16 ms) of latency.

interface _PendingEvent {
	sessionId: string;
	event: AgentSessionEventJson;
}

type _SetFn = (fn: (s: StoreState) => Partial<StoreState>) => void;

let _batchQueue: _PendingEvent[] = [];
let _batchRafId: number | null = null;
let _batchTimerId: ReturnType<typeof setTimeout> | null = null;

// Fallback flush interval. `requestAnimationFrame` is suspended while the tab
// is hidden (background tab, minimized window), but WebSocket events keep
// arriving — so a rAF-only flush would let `_batchQueue` accumulate the entire
// stream and dump it in one burst on return. This timer guarantees a flush even
// when rAF is paused. In the foreground rAF (~16 ms) always wins the race and
// cancels the timer, so this adds zero extra renders there; backgrounded, the
// browser throttles it to ~1 s, bounding the burst to ~1 s of content.
const _BATCH_FALLBACK_MS = 100;

function _cancelFlushTimers(): void {
	if (_batchRafId !== null) {
		if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(_batchRafId);
		_batchRafId = null;
	}
	if (_batchTimerId !== null) {
		clearTimeout(_batchTimerId);
		_batchTimerId = null;
	}
}

function _runFlush(set: _SetFn, get: () => StoreState): void {
	_cancelFlushTimers();
	_flushBatch(set, get);
}

function _enqueueSessionEvent(
	sessionId: string,
	event: AgentSessionEventJson,
	set: _SetFn,
	get: () => StoreState,
): void {
	_batchQueue.push({ sessionId, event });
	if (_batchRafId === null && typeof requestAnimationFrame === "function") {
		_batchRafId = requestAnimationFrame(() => {
			_batchRafId = null;
			_runFlush(set, get);
		});
	}
	if (_batchTimerId === null) {
		_batchTimerId = setTimeout(() => {
			_batchTimerId = null;
			_runFlush(set, get);
		}, _BATCH_FALLBACK_MS);
	}
}

function _flushBatch(set: _SetFn, get: () => StoreState): void {
	const events = _batchQueue;
	_batchQueue = [];
	if (events.length === 0) return;
	set((s) => {
		const sessionsById = { ...s.sessionsById };
		for (const { sessionId, event } of events) {
			const prev = sessionsById[sessionId];
			if (!prev) continue;
			const next = applyEvent(prev, event);
			// The real lifecycle has taken over (typically `turn_start` →
			// "streaming"); cancel the optimistic backstop so it can't later
			// stomp a legitimately-running session back to idle.
			if (prev.status === "preparing" && next.status !== "preparing") {
				_clearPrepareTimer(sessionId);
			}
			// Streaming watchdog: the reconnect path (subscribed handler) arms
			// a 15s watchdog for snapshots that arrive already streaming — if
			// the server-side request actually died before reconnect, no events
			// will arrive and the watchdog flips status back to idle. Here we
			// only need to *clear* that watchdog: any incoming event proves the
			// stream is live post-reconnect. We deliberately do NOT re-arm on
			// every event during a normal turn: a legitimate stream started
			// via `turn_start` is bounded by the SDK's own turn_end, and
			// re-arming would prematurely flip status to idle if the model
			// pauses >15s for thinking, rate-limit backoff, or a slow network
			// (the indicator would falsely report "ready" mid-stream).
			if ((prev.status as string) === "streaming" && next.status !== "streaming") {
				_clearStreamingWatchdog(sessionId);
			} else if (_streamingWatchdogs.has(sessionId)) {
				// Live event for a session whose watchdog is armed (post-reconnect
				// snapshot said isStreaming=true). Connection is healthy; disarm.
				_clearStreamingWatchdog(sessionId);
			}
			sessionsById[sessionId] = next;
		}
		return { sessionsById };
	});
}

// ─── Optimistic "preparing" status ───────────────────────────────────────────
//
// `sendPrompt` fires a frame over the WebSocket, but the UI only learns the
// agent has started one network round-trip later, when the server echoes
// `turn_start`. To close that perceptible gap we optimistically flip an idle
// session to "preparing" the instant the user submits. The real `turn_start`
// supersedes it (see `_flushBatch`); a backstop timer reverts to idle if no
// event ever arrives (lost frame, or a server error before `turn_start`).

const _PREPARE_BACKSTOP_MS = 30_000;
const _prepareTimers = new Map<string, ReturnType<typeof setTimeout>>();

function _clearPrepareTimer(sessionId: string): void {
	const t = _prepareTimers.get(sessionId);
	if (t !== undefined) {
		clearTimeout(t);
		_prepareTimers.delete(sessionId);
	}
}

function _armPrepareBackstop(sessionId: string, set: _SetFn, get: () => StoreState): void {
	_clearPrepareTimer(sessionId);
	_prepareTimers.set(
		sessionId,
		setTimeout(() => {
			_prepareTimers.delete(sessionId);
			const cur = get().sessionsById[sessionId];
			if (!cur || cur.status !== "preparing") return;
			set((s) => {
				const c = s.sessionsById[sessionId];
				if (!c || c.status !== "preparing") return {};
				return { sessionsById: { ...s.sessionsById, [sessionId]: { ...c, status: "idle" } } };
			});
		}, _PREPARE_BACKSTOP_MS),
	);
}

/**
 * Revert every optimistically-"preparing" session to idle and cancel its
 * backstop. Called when the socket drops: an in-flight prompt frame may have
 * been lost, so the "preparing" indicator would otherwise hang forever.
 */
function _resetPreparingSessions(set: _SetFn): void {
	set((s) => {
		let changed = false;
		const sessionsById = { ...s.sessionsById };
		for (const id of Object.keys(sessionsById)) {
			const sess = sessionsById[id];
			if (sess && sess.status === "preparing") {
				_clearPrepareTimer(id);
				sessionsById[id] = { ...sess, status: "idle" };
				changed = true;
			}
		}
		return changed ? { sessionsById } : {};
	});
}

// ─── Streaming watchdog ─────────────────────────────────────────────────────
//
// When the client reconnects and the server snapshot says isStreaming=true,
// the session may have actually stopped mid-stream (zombie connection before
// reconnection, or server-side timeout). If no session_event arrives within
// STREAMING_WATCHDOG_MS, we force the status back to idle so the user isn't
// stuck looking at a frozen "streaming" indicator.

const STREAMING_WATCHDOG_MS = 15_000;
const _streamingWatchdogs = new Map<string, ReturnType<typeof setTimeout>>();

function _clearStreamingWatchdog(sessionId: string): void {
	const t = _streamingWatchdogs.get(sessionId);
	if (t !== undefined) {
		clearTimeout(t);
		_streamingWatchdogs.delete(sessionId);
	}
}

function _armStreamingWatchdog(sessionId: string, set: _SetFn, get: () => StoreState): void {
	_clearStreamingWatchdog(sessionId);
	_streamingWatchdogs.set(
		sessionId,
		setTimeout(() => {
			_streamingWatchdogs.delete(sessionId);
			const cur = get().sessionsById[sessionId];
			if (!cur || cur.status !== "streaming") return;
			set((s) => {
				const c = s.sessionsById[sessionId];
				if (!c || c.status !== "streaming") return {};
				return { sessionsById: { ...s.sessionsById, [sessionId]: { ...c, status: "idle" } } };
			});
		}, STREAMING_WATCHDOG_MS),
	);
}

/** Cancel all streaming watchdogs — called when WS drops. */
function _resetStreamingWatchdogs(set: _SetFn): void {
	set((s) => {
		let changed = false;
		const sessionsById = { ...s.sessionsById };
		for (const [id, sess] of Object.entries(sessionsById)) {
			if (sess && sess.status === "streaming") {
				_clearStreamingWatchdog(id);
				sessionsById[id] = { ...sess, status: "idle" };
				changed = true;
			}
		}
		return changed ? { sessionsById } : {};
	});
}

/**
 * Heartbeat watchdog timeout. Server broadcasts heartbeats every 5s; if
 * none arrives within this window the connection is likely a zombie
 * (browser-throttled background tab, silent network failure) and we
 * force a reconnect. Three missed heartbeats (15s) + margin.
 */
const HEARTBEAT_STALE_MS = 18_000;

function readBool(key: string, fallback: boolean): boolean {
	if (typeof localStorage === "undefined") return fallback;
	const raw = localStorage.getItem(key);
	if (raw === null) return fallback;
	return raw === "1";
}

/** Matches the Tailwind `lg` breakpoint (1024px) used by `Layout`. Below this
 * width the sidebar and inspector behave as overlay drawers, so persisting
 * "open" state would auto-open them on every mobile load and bury the main
 * content under a backdrop.  */
function isDesktopViewport(): boolean {
	return typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
}

/** Chrome panel state is only persisted on desktop. On mobile we always start
 * with the panel closed and never write back, so toggling on a phone does not
 * pollute the desktop preference. */
function readChromeOpen(key: string, desktopFallback: boolean): boolean {
	if (!isDesktopViewport()) return false;
	return readBool(key, desktopFallback);
}

/** Read the persisted open-tab list from localStorage. Returns an empty array
 *  when nothing has been saved or the value is corrupt. Only restored on
 *  desktop viewports — on mobile tabs are transient. */
function readOpenTabs(): string[] {
	if (!isDesktopViewport()) return [];
	try {
		const raw = localStorage.getItem("omp-deck:open-tabs");
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed) && parsed.every((v: unknown) => typeof v === "string")) {
			return parsed as string[];
		}
	} catch {
		/* quota / private browsing / corrupt data */
	}
	return [];
}

function writeOpenTabs(ids: string[]): void {
	if (!isDesktopViewport()) return;
	try {
		localStorage.setItem("omp-deck:open-tabs", JSON.stringify(ids));
	} catch {
		/* quota / private browsing */
	}
}

/** Read the last active session ID from localStorage so the chat resumes
 *  after a full page reload (e.g. Vite HMR on background tab return). */
function readActiveSessionId(): string | undefined {
	try {
		const raw = localStorage.getItem("omp-deck:active-session");
		if (typeof raw === "string" && raw.length > 0) return raw;
	} catch { /* private browsing / corrupt */ }
	return undefined;
}

function writeActiveSessionId(id: string | undefined): void {
	try {
		if (id) {
			localStorage.setItem("omp-deck:active-session", id);
		} else {
			localStorage.removeItem("omp-deck:active-session");
		}
	} catch { /* quota / private browsing */ }
}

interface StoreState {
	ws: WsClient | null;
	wsStatus: WsStatus;
	connectionId?: string;

	workspaces: WorkspaceEntry[];
	defaultCwd: string;

	/** The cwd the user selected in the sidebar workspace picker. Falls back to defaultCwd when empty. */
	selectedWorkspaceCwd: string;
	setSelectedWorkspaceCwd(cwd: string): void;
	sessions: SessionSummary[];

	activeId?: string;
	sessionsById: Record<string, SessionUi>;

	// Track subscriptions to avoid duplicate subscribe messages.
	subscribed: Set<string>;

	/**
	 * Tool-card view state. `allCollapsed` is the bulk default; `perCard` holds
	 * user overrides (key = toolCallId, value = isOpen). On bulk toggle we clear
	 * `perCard` so the new default applies to every card uniformly.
	 *
	 * `hideAll` is a separate, more aggressive axis: when on, tool calls render
	 * nothing but a live spinner + running tool name and never render history
	 * (see `AssistantMessage.tsx`). It takes visual precedence over
	 * `allCollapsed`/`perCard` — those stay togglable but have no visible effect
	 * while `hideAll` is active.
	 */
	toolView: {
		allCollapsed: boolean;
		perCard: Record<string, boolean>;
		hideAll: boolean;
	};

	/** Composer pre-fill used by `Open in chat` from the Tasks view. */
	pendingDraft?: { text: string };

	/**
	 * Ordered list of session IDs that are currently open as tabs in the
	 * TabBar. Mirrors the Reasonix tab-order pattern: each entry maps to a
	 * subscribed session, and the TabBar renders tabs in this order. Closing
	 * a tab removes the ID; creating or selecting a session adds one.
	 * Persisted to localStorage so tabs survive page reloads (desktop only).
	 */
	openTabs: string[];

	/** Shared chrome state — each view can open/close the inspector and sidebar. */
	sidebarOpen: boolean;
	inspectorOpen: boolean;

	/** Terminal panel state. `terminalReady` is true when the server has a PTY running. */
	terminalOpen: boolean;
	terminalReady: boolean;

	/** Pinned todos panel state for the active chat column. */
	todoPanelOpen: boolean;

	/**
	 * Monotonic counter bumped every time the server broadcasts a `tasks_changed`
	 * frame (any kanban mutation, whether triggered by the deck UI, a deck slash
	 * command, or an agent calling the REST API). Views that own a local tasks
	 * cache (e.g. TasksView) subscribe to this counter and refetch when it
	 * changes — keeps the kanban view live without polling.
	 */
	tasksChangeCounter: number;

	/**
	 * Mirror of {@link tasksChangeCounter} for the skill catalog. Bumped on every
	 * `skills_changed` frame (plugin install / uninstall / enable / disable, or
	 * a SKILL.md mutation under the plugins cache dir). Drives live refetch in
	 * `SkillsView` without polling.
	 */
	skillsChangeCounter: number;

	/**
	 * Counter for `kb_changed` broadcasts. Bumped on any mutation under the
	 * watched kb root; `KbView` watches it and refetches the current file +
	 * tree. Same pattern as `tasksChangeCounter` / `skillsChangeCounter`.
	 */
	kbChangeCounter: number;

	/**
	 * Per-session open extension-UI dialog (currently used by the SDK `ask`
	 * tool, but the channel is shape-typed to cover any extension dialog).
	 * At most one dialog per session is open at a time because the SDK awaits
	 * each `ctx.ui.*` call serially; if a second open arrives it replaces the
	 * first (the server-side bridge already cancelled the predecessor before
	 * sending the new one). Cleared on `ext_ui_dialog_cancel` and on local
	 * response submission.
	 */
	pendingDialogs: Record<string, Extract<ServerFrame, { type: "ext_ui_dialog_open" }>>;

	/**
	 * Latest heartbeat the server has broadcast. `lastHeartbeatAt` is the
	 * client's local Date.now() at the moment we received the frame, NOT the
	 * server's `timestamp` — the gap drives the connection indicator and must
	 * be measured in the client's clock.
	 */
	heartbeat: {
		lastReceivedAtMs: number;
		serverStartedAt: string;
		pid: number;
		uptimeSecs: number;
		buildSha: string | null;
		version: string;
	} | null;

	/**
	 * In-app notification queue. Each `notification` frame is appended; the
	 * notification renderer pops from here when delivering an OS notification
	 * + audio cue, and a small toast surface reads from here too. Capped at
	 * MAX_NOTIFICATIONS via prune; oldest fall off.
	 */
	notifications: NotificationItem[];

	// ─── Actions ─────────────────────────────────────────────────────────
	bootstrap(): Promise<void>;
	connect(): void;
	disconnect(): void;
	refreshWorkspaces(): Promise<void>;
	refreshSessions(cwd?: string): Promise<void>;
	createSession(opts: { cwd?: string; resumeFromPath?: string; model?: ModelRef; planMode?: boolean; suppressAutoStart?: boolean }): Promise<string>;
	selectSession(id: string): void;
	sendPrompt(text: string, images?: ImageAttachment[]): void;
	abort(): void;
	/** Drop every queued (followUp / steering) prompt for the active session.
	 *  Server echoes a `queue_cleared` session event that reconciles
	 *  `queuedPrompts` in the reducer. */
	clearQueue(): void;
	/** Cancel a single queued prompt by its server-assigned id. Server echoes
	 *  a `queue_state` session event with the new ordered queue. */
	cancelQueued(queuedId: string): void;
	/** Edit a queued prompt's text (and optionally images) in place. */
	editQueued(queuedId: string, text: string, images?: ImageAttachment[]): void;
	disposeSession(id: string, deleteFile?: boolean): Promise<void>;
	renameSession(id: string, name: string): Promise<void>;
	toggleAllToolCards(): void;
	toggleHideAllToolCards(): void;
	setToolCardOpen(id: string, open: boolean): void;
	setPendingDraft(draft: { text: string } | undefined): void;
	setSidebarOpen(open: boolean): void;
	setInspectorOpen(open: boolean): void;
	setTerminalOpen(open: boolean): void;
	toggleTodoPanel(): void;
	/** Send a dialog response over the WS and clear it locally. */
	respondToExtUiDialog(sessionId: string, dialogId: string, response: ExtUiDialogResponse): void;
	/**
	 * Toggle plan mode on the active session (T-105). Idempotent on the wire;
	 * server emits `plan_mode_changed` which the reducer mirrors back.
	 */
	setPlanMode(enabled: boolean): void;
	/**
	 * Reply to a `plan_proposed` card. Optimistically clears
	 * `pendingPlanApproval` so the UI hides immediately; the server emits
	 * `plan_proposal_resolved`, and on `error` (stale proposalId) the next
	 * `plan_proposed` replay on subscribe will restore it.
	 */
	respondToPlanApproval(args: {
		sessionId: string;
		proposalId: string;
		approved: boolean;
		editedContent?: string;
	}): void;
	/**
	 * Send a goal-mode action for the active session. `create` starts a new
	 * autonomous goal; `pause`/`resume`/`cancel` control the lifecycle;
	 * `set_budget` adjusts the token ceiling. Server broadcasts `goal_updated`.
	 */
	actOnGoal(action: "create" | "pause" | "resume" | "cancel" | "set_budget", options?: { objective?: string; tokenBudget?: number }): void;
	/** Mark a notification as delivered to the OS so the renderer only fires once. */
	markNotificationDelivered(id: string): void;
	/** Hide an in-app toast for a notification (does not affect an already-delivered OS notif). */
	dismissNotification(id: string): void;
}

export function selectCurrentWorkspaceCwd(state: Pick<StoreState, "selectedWorkspaceCwd" | "defaultCwd">): string {
	return state.selectedWorkspaceCwd || state.defaultCwd;
}

export const useStore = create<StoreState>()(
	subscribeWithSelector((set, get) => ({
		ws: null,
		wsStatus: "closed",
		workspaces: [],
		defaultCwd: "",
		selectedWorkspaceCwd: "",
		setSelectedWorkspaceCwd(cwd) {
			set({ selectedWorkspaceCwd: cwd });
		},
		sessions: [],
		sessionsById: {},
		subscribed: new Set<string>(),
		// Restore last active session so the page survives Vite HMR full-reloads
		// on background tab return (see store subscription below that persists it).
		activeId: readActiveSessionId(),
		toolView: { allCollapsed: false, perCard: {}, hideAll: false },
		tasksChangeCounter: 0,
		skillsChangeCounter: 0,
		kbChangeCounter: 0,
		pendingDialogs: {},
		heartbeat: null,
		notifications: [],
		openTabs: readOpenTabs(),
		// Hydrate chrome state from localStorage at module init so first render
		// matches the user's last preference — but only on desktop. On mobile the
		// panels are overlay drawers and always start closed.
		sidebarOpen: readChromeOpen("omp-deck:sidebar-open", true),
		inspectorOpen: readChromeOpen("omp-deck:inspector-open", false),
		terminalOpen: false,
		terminalReady: false,
		todoPanelOpen: false,

		async bootstrap() {
			get().connect();
			await Promise.all([get().refreshWorkspaces(), get().refreshSessions()]);
			// If we have a persisted activeId from before a page reload (e.g. Vite
			// HMR full-reload on background tab return), re-subscribe so the server
			// pushes a fresh snapshot and subsequent events.
			const activeId = get().activeId;
			if (activeId && !get().subscribed.has(activeId)) {
				get().ws?.send({ type: "subscribe", sessionId: activeId });
				get().subscribed.add(activeId);
			}
			// Proactively check WS health when the tab becomes visible again.
			// Browsers throttle timers and may kill WS connections in background
			// tabs. Reconnecting early prevents a stale "open" status.
			if (typeof document !== "undefined") {
				document.addEventListener("visibilitychange", () => {
					if (document.visibilityState !== "visible") return;
					// rAF was suspended while hidden; drain any events that piled up
					// so returning to the tab shows them at once, immediately, rather
					// than waiting for the next throttled fallback tick.
					_runFlush(set as _SetFn, get);
					const ws = get().ws;
					if (!ws) return;
					// If the socket was closed while backgrounded, force reconnect.
					// Also check heartbeat staleness — the socket may report OPEN
					// but be a zombie connection (common on mobile/background tabs).
					const hb = get().heartbeat;
					const isStale = hb != null && Date.now() - hb.lastReceivedAtMs > HEARTBEAT_STALE_MS;
					if (ws.getStatus() === "closed" || isStale) {
						stopHeartbeatTimer(ws);
						if (isStale && ws.getStatus() !== "closed") {
							// Zombie connection — force close & reconnect.
							ws.forceReconnect();
						} else {
							get().disconnect();
							get().connect();
						}
						// Re-subscribe to active session after reconnect.
						const aid = get().activeId;
						if (aid && !get().subscribed.has(aid)) {
							get().ws?.send({ type: "subscribe", sessionId: aid });
							get().subscribed.add(aid);
						}
					}
					// Refresh session list to pick up any changes while away.
					void get().refreshSessions();
				});
			}
		},

		connect() {
			if (get().ws) return;
			const ws = new WsClient();
			ws.onStatus((status) => {
				set({ wsStatus: status });
				// A dropped/reconnecting socket may have lost an in-flight prompt
				// frame; clear any optimistic "preparing" so it doesn't hang.
				if (status !== "open") {
					_resetPreparingSessions(set as _SetFn);
				}
			});
			ws.subscribe((frame) => handleFrame(frame, set, get));
			ws.connect();
			set({ ws });
			armHeartbeatWatchdog(ws, set, get);
		},

		disconnect() {
			stopHeartbeatTimer(get().ws);
			get().ws?.dispose();
			set({ ws: null, wsStatus: "closed" });
		},

		async refreshWorkspaces() {
			try {
				const resp: ListWorkspacesResponse = await api.listWorkspaces();
				set({ workspaces: resp.workspaces, defaultCwd: resp.defaultCwd });
			} catch (err) {
				console.warn("listWorkspaces failed", err);
			}
		},

		async refreshSessions(cwd?: string) {
			try {
				const resp: ListSessionsResponse = await api.listSessions(cwd);
				const knownIds = new Set(resp.sessions.map((s) => s.id));
				// Drop any in-memory session the server no longer reports, but only
				// when we aren't actively subscribed to it. Subscribed sessions
				// outlive the snapshot (they're live processes) and their removal
				// is driven by the `session_disposed` frame. If that frame is
				// dropped (e.g. tab backgrounded, network blip) we don't want to
				// yank a session the user is mid-turn on; the next resubscribe
				// after a reconnect will rehydrate it.
				const subscribed = get().subscribed;
				// Also preserve the session we're about to reactivate from a page
				// reload (`bootstrap` subscribes to `activeId` after this call, so
				// at this moment it isn't in `subscribed` yet — pruning it here
				// would erase the only entry the user can click on to resume).
				const activeId = get().activeId;
				set((s) => {
					let changed = false;
					const next: Record<string, SessionUi> = {};
					for (const [id, sess] of Object.entries(s.sessionsById)) {
						if (!knownIds.has(id) && !subscribed.has(id) && id !== activeId) {
							changed = true;
							continue;
						}
						next[id] = sess;
					}
					return changed
						? { sessions: resp.sessions, sessionsById: next }
						: { sessions: resp.sessions };
				});
			} catch (err) {
				console.warn("listSessions failed", err);
			}
		},

		async createSession(opts) {
			const created = await api.createSession({
				...(opts.cwd ? { cwd: opts.cwd } : {}),
				...(opts.resumeFromPath ? { resumeFromPath: opts.resumeFromPath } : {}),
				...(opts.model ? { model: opts.model } : {}),
				...(opts.planMode ? { planMode: true } : {}),
				...(opts.suppressAutoStart ? { suppressAutoStart: true } : {}),
			});
			// Subscribe immediately; reducer will hydrate from the `subscribed` snapshot.
			get().ws?.send({ type: "subscribe", sessionId: created.sessionId });
			get().subscribed.add(created.sessionId);
			set({ activeId: created.sessionId });
			// Background-refresh sidebar to reflect the new entry.
			void get().refreshSessions();
			void get().refreshWorkspaces();
			return created.sessionId;
		},

		selectSession(id: string) {
			set({ activeId: id });
			if (!get().subscribed.has(id)) {
				get().ws?.send({ type: "subscribe", sessionId: id });
				get().subscribed.add(id);
			}
		},

		sendPrompt(text, images) {
			const id = get().activeId;
			if (!id) return;
			const frame: Parameters<NonNullable<StoreState["ws"]>["send"]>[0] = images && images.length > 0
				? { type: "prompt", sessionId: id, text, images }
				: { type: "prompt", sessionId: id, text };
			get().ws?.send(frame);

			const session = get().sessionsById[id];
			if (!session) return;

			// Busy session: queue prompt server-side, no local state change.
			if (session.status !== "idle") return;

			// Optimistic user message: push it immediately so the user sees
			// their input even if the WS frame is silently dropped (zombie
			// connection, network hiccup). The reducer deduplicates against
			// the server's `message_start` echo using content + time window.
			const now = Date.now();
			const optMsgId = `user-opt-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
			const optMsg: UserMsg = {
				id: optMsgId,
				role: "user",
				text,
				images,
				timestamp: now,
			};

			set((s) => ({
				sessionsById: {
					...s.sessionsById,
					[id]: {
						...session,
						status: "preparing",
						lastError: undefined,
						messages: [...session.messages, optMsg],
					},
				},
			}));
			_armPrepareBackstop(id, set as _SetFn, get);
		},

		abort() {
			const id = get().activeId;
			if (!id) return;
			get().ws?.send({ type: "abort", sessionId: id });
		},

		clearQueue() {
			const id = get().activeId;
			if (!id) return;
			get().ws?.send({ type: "clear_queue", sessionId: id });
		},

		cancelQueued(queuedId: string) {
			const id = get().activeId;
			if (!id) return;
			get().ws?.send({ type: "cancel_queued", sessionId: id, queuedId });
		},

		editQueued(queuedId, text, images) {
			const id = get().activeId;
			if (!id) return;
			const frame: Parameters<NonNullable<StoreState["ws"]>["send"]>[0] = images && images.length > 0
				? { type: "edit_queued", sessionId: id, queuedId, text, images }
				: { type: "edit_queued", sessionId: id, queuedId, text };
			get().ws?.send(frame);
		},

		async disposeSession(id: string, deleteFile?: boolean) {
			try {
				await api.disposeSession(id, deleteFile);
			} catch (err) {
				console.warn("dispose failed", err);
			}
			set((s) => {
				const next = { ...s.sessionsById };
				delete next[id];
				return {
					sessionsById: next,
					// Drop the persisted-index row too when the on-disk file is gone,
					// so the sidebar doesn't show a resume target that no longer exists.
					sessions: deleteFile ? s.sessions.filter((entry) => entry.id !== id) : s.sessions,
					activeId: s.activeId === id ? undefined : s.activeId,
				};
			});
		},

		async renameSession(id, name) {
			// Re-throw on failure so the caller (ChatHeader) can keep the input
			// open + surface the error. Silently swallowing makes Windows-EPERM
			// failures from the SDK's atomic-rename journal save look like the
			// UI is broken when it's actually the FS rejecting the rename
			// because the journal file is held open by the live session.
			await api.renameSession(id, name);
			set((s) => {
				const existing = s.sessionsById[id];
				const next = existing
					? { ...s.sessionsById, [id]: { ...existing, sessionName: name } }
					: s.sessionsById;
				const sessions = s.sessions.map((r) => (r.id === id ? { ...r, title: name } : r));
				return { sessionsById: next, sessions };
			});
		},

		toggleAllToolCards() {
			set((s) => ({
				toolView: { ...s.toolView, allCollapsed: !s.toolView.allCollapsed, perCard: {} },
			}));
		},

		toggleHideAllToolCards() {
			set((s) => ({
				toolView: { ...s.toolView, hideAll: !s.toolView.hideAll },
			}));
		},

		setToolCardOpen(id, open) {
			set((s) => ({
				toolView: {
					...s.toolView,
					perCard: { ...s.toolView.perCard, [id]: open },
				},
			}));
		},

		setPendingDraft(draft) {
			set({ pendingDraft: draft });
		},

		setSidebarOpen(open) {
			// Only persist on desktop so toggling on mobile (where the panel is an
			// ephemeral overlay) doesn't auto-open it the next time the user lands
			// on the page from a wider screen.
			if (isDesktopViewport()) {
				try {
					localStorage.setItem("omp-deck:sidebar-open", open ? "1" : "0");
				} catch {}
			}
			set({ sidebarOpen: open });
		},

		setInspectorOpen(open) {
			if (isDesktopViewport()) {
				try {
					localStorage.setItem("omp-deck:inspector-open", open ? "1" : "0");
				} catch {}
			}
			set({ inspectorOpen: open });
		},

		setTerminalOpen(open) {
			// Send terminal_open when opening, terminal_close when closing
			if (open) {
				get().ws?.send({ type: "terminal_open", cwd: selectCurrentWorkspaceCwd(get()) });
			} else {
				get().ws?.send({ type: "terminal_close" });
			}
			set({ terminalOpen: open });
		},

		toggleTodoPanel() {
			set((s) => ({ todoPanelOpen: !s.todoPanelOpen }));
		},

		respondToExtUiDialog(sessionId, dialogId, response) {
			// Clear local state first — the dialog modal closes immediately —
			// then send the response over the WS so the SDK call settles.
			set((s) => {
				const current = s.pendingDialogs[sessionId];
				if (!current || current.dialogId !== dialogId) return {};
				const next = { ...s.pendingDialogs };
				delete next[sessionId];
				return { pendingDialogs: next };
			});
			get().ws?.send({
				type: "ext_ui_dialog_response",
				sessionId,
				dialogId,
				...response,
			});
		},

		setPlanMode(enabled) {
			const id = get().activeId;
			if (!id) return;
			get().ws?.send({ type: "set_plan_mode", sessionId: id, enabled });
		},

		respondToPlanApproval({ sessionId, proposalId, approved, editedContent }) {
			// Optimistically clear the local approval card so the UI hides
			// immediately. Server emits `plan_proposal_resolved`; if the
			// proposalId is stale (sibling tab won the race), the bridge's
			// own replay-on-subscribe will restore the next pending proposal
			// (if any) without us having to roll back here.
			set((s) => {
				const prev = s.sessionsById[sessionId];
				if (!prev || !prev.pendingPlanApproval) return {};
				if (prev.pendingPlanApproval.proposalId !== proposalId) return {};
				return {
					sessionsById: {
						...s.sessionsById,
						[sessionId]: { ...prev, pendingPlanApproval: undefined },
					},
				};
			});
			get().ws?.send({
				type: "plan_response",
				sessionId,
				proposalId,
				approved,
				...(editedContent !== undefined ? { editedContent } : {}),
			});
		},

		actOnGoal(action, options) {
			const id = get().activeId;
			if (!id) return;
			get().ws?.send({
				type: "goal_action",
				sessionId: id,
				action,
				...(options?.objective !== undefined ? { objective: options.objective } : {}),
				...(options?.tokenBudget !== undefined ? { tokenBudget: options.tokenBudget } : {}),
			});
		},

		markNotificationDelivered(id) {
			set((s) => {
				const i = s.notifications.findIndex((n) => n.id === id);
				if (i < 0 || s.notifications[i]?.deliveredOs) return {};
				const next = s.notifications.slice();
				const target = next[i];
				if (!target) return {};
				next[i] = { ...target, deliveredOs: true };
				return { notifications: next };
			});
		},

		dismissNotification(id) {
			set((s) => {
				const i = s.notifications.findIndex((n) => n.id === id);
				if (i < 0 || s.notifications[i]?.dismissed) return {};
				const next = s.notifications.slice();
				const target = next[i];
				if (!target) return {};
				next[i] = { ...target, dismissed: true };
				return { notifications: next };
			});
		},
	})),
);

// Persist activeId to localStorage on every change so the chat survives
// full page reloads (Vite HMR on background tab return, browser tab restore).
useStore.subscribe(
	(s) => s.activeId,
	(activeId) => writeActiveSessionId(activeId),
);

function handleFrame(
	frame: ServerFrame,
	set: (partial: Partial<StoreState> | ((s: StoreState) => Partial<StoreState>)) => void,
	get: () => StoreState,
): void {
	switch (frame.type) {
		case "hello":
			set({ connectionId: frame.connectionId });
			// Re-subscribe to any previously-active sessions.
			for (const id of get().subscribed) {
				get().ws?.send({ type: "subscribe", sessionId: id });
			}
			return;

		case "subscribed":
			set((s) => ({
				sessionsById: {
					...s.sessionsById,
					[frame.sessionId]: initSession(frame.snapshot),
				},
			}));
			// Post-reconnect backstop: if the server still says isStreaming=true
			// but no events arrive within STREAMING_WATCHDOG_MS, the upstream
			// stream likely died before reconnect and we force status back to
			// idle. The first live session_event after subscribe disarms it.
			if (frame.snapshot.isStreaming) {
				_armStreamingWatchdog(frame.sessionId, set as _SetFn, get);
			}
			return;

		case "unsubscribed":
			get().subscribed.delete(frame.sessionId);
			return;

		case "session_event": {
			// Batch through rAF to coalesce rapid streaming updates into a
			// single React render per animation frame (see _enqueueSessionEvent).
			_enqueueSessionEvent(
				frame.sessionId,
				frame.event,
				set as _SetFn,
				get,
			);
			return;
		}

		case "tasks_changed":
			set((s) => ({ tasksChangeCounter: s.tasksChangeCounter + 1 }));
			return;

		case "skills_changed":
			set((s) => ({ skillsChangeCounter: s.skillsChangeCounter + 1 }));
			return;

		case "kb_changed":
			set((s) => ({ kbChangeCounter: s.kbChangeCounter + 1 }));
			return;

		case "ext_ui_dialog_open":
			set((s) => ({
				pendingDialogs: { ...s.pendingDialogs, [frame.sessionId]: frame },
			}));
			return;

		case "ext_ui_dialog_cancel":
			set((s) => {
				const current = s.pendingDialogs[frame.sessionId];
				if (!current || current.dialogId !== frame.dialogId) return {};
				const next = { ...s.pendingDialogs };
				delete next[frame.sessionId];
				return { pendingDialogs: next };
			});
			return;

		case "plan_mode_changed":
			set((s) => {
				const prev = s.sessionsById[frame.sessionId];
				if (!prev) return {};
				const planMode: PlanModeContextWire | undefined = frame.enabled
					? { enabled: true, planFilePath: frame.planFilePath ?? "local://PLAN.md" }
					: undefined;
				// On exit, also drop any unresolved approval card — the bridge
				// has already rejected its standing handler, so leaving the
				// card visible would let the user click into a 409.
				const pendingPlanApproval = frame.enabled ? prev.pendingPlanApproval : undefined;
				return {
					sessionsById: {
						...s.sessionsById,
						[frame.sessionId]: { ...prev, planMode, pendingPlanApproval },
					},
				};
			});
			return;

		case "plan_proposed":
			set((s) => {
				const prev = s.sessionsById[frame.sessionId];
				if (!prev) return {};
				const pending: PendingPlanApprovalWire = {
					proposalId: frame.proposalId,
					planFilePath: frame.planFilePath,
					planContent: frame.planContent,
					suggestedTitle: frame.suggestedTitle,
				};
				return {
					sessionsById: {
						...s.sessionsById,
						[frame.sessionId]: { ...prev, pendingPlanApproval: pending },
					},
				};
			});
			return;

		case "plan_proposal_resolved":
			set((s) => {
				const prev = s.sessionsById[frame.sessionId];
				if (!prev?.pendingPlanApproval) return {};
				if (prev.pendingPlanApproval.proposalId !== frame.proposalId) return {};
				return {
					sessionsById: {
						...s.sessionsById,
						[frame.sessionId]: { ...prev, pendingPlanApproval: undefined },
					},
				};
			});
			return;

		case "goal_updated":
			set((s) => {
				const prev = s.sessionsById[frame.sessionId];
				if (!prev) return {};
				const goalMode: GoalModeContextWire | undefined = frame.goal ?? undefined;
				return {
					sessionsById: {
						...s.sessionsById,
						[frame.sessionId]: { ...prev, goalMode },
					},
				};
			});
			return;

		case "session_disposed":
			set((s) => {
				const nextSessions = { ...s.sessionsById };
				delete nextSessions[frame.sessionId];
				const nextDialogs = { ...s.pendingDialogs };
				delete nextDialogs[frame.sessionId];
				return {
					sessionsById: nextSessions,
					pendingDialogs: nextDialogs,
					activeId: s.activeId === frame.sessionId ? undefined : s.activeId,
				};
			});
			return;

		case "error":
			set((s) => {
				const id = frame.sessionId;
				if (!id) return {};
				const prev = s.sessionsById[id];
				if (!prev) return {};
				return {
					sessionsById: {
						...s.sessionsById,
						[id]: { ...prev, lastError: frame.error },
					},
				};
			});
			return;

		case "heartbeat":
			set(() => ({
				heartbeat: {
					lastReceivedAtMs: Date.now(),
					serverStartedAt: frame.serverStartedAt,
					pid: frame.pid,
					uptimeSecs: frame.uptimeSecs,
					buildSha: frame.buildSha,
					version: frame.version,
				},
			}));
			// Reset watchdog on every heartbeat — if the next one doesn't
			// arrive within HEARTBEAT_STALE_MS, force a reconnect.
			{
				const ws = get().ws;
				if (ws) armHeartbeatWatchdog(ws, set, get);
			}
			return;

		case "notification":
			set((s) => {
				// Dedupe by id: server may re-send on reconnect.
				if (s.notifications.some((n) => n.id === frame.id)) return {};
				const item: NotificationItem = {
					id: frame.id,
					level: frame.level,
					title: frame.title,
					timestamp: frame.timestamp,
					receivedAtMs: Date.now(),
					deliveredOs: false,
					dismissed: false,
				};
				if (frame.body !== undefined) item.body = frame.body;
				if (frame.sound !== undefined) item.sound = frame.sound;
				if (frame.source !== undefined) item.source = frame.source;
				if (frame.actionUrl !== undefined) item.actionUrl = frame.actionUrl;
				const next = [...s.notifications, item];
				// Cap retention; oldest fall off.
				if (next.length > MAX_NOTIFICATIONS) next.splice(0, next.length - MAX_NOTIFICATIONS);
				return { notifications: next };
			});
			return;


		case "terminal_open":
			set({ terminalReady: true });
			return;

		case "terminal_close":
			set({ terminalReady: false });
			return;

		case "terminal_data":
			// Terminal data frames are consumed by the TerminalPanel component via
			// ws.subscribe directly; store doesn't buffer them.
			return;
		case "pong":
		default:
			return;
	}
}

// ─── Heartbeat watchdog ─────────────────────────────────────────────────────

function stopHeartbeatTimer(ws: WsClient | null): void {
	ws?.clearHeartbeatTimer();
}

/**
 * Arm (or re-arm) the heartbeat watchdog on the WsClient. If no heartbeat
 * frame arrives within HEARTBEAT_STALE_MS, force-close the socket and
 * trigger automatic reconnection. This catches zombie connections where
 * the browser reports the socket as OPEN but no data flows (common in
 * background tabs or after network changes).
 */
function armHeartbeatWatchdog(
	ws: WsClient,
	set: (partial: Partial<StoreState> | ((s: StoreState) => Partial<StoreState>)) => void,
	get: () => StoreState,
): void {
	ws.resetHeartbeatTimer(HEARTBEAT_STALE_MS, () => {
		const currentWs = get().ws;
		if (currentWs !== ws) return; // ws was replaced
		if (currentWs.getStatus() === "closed") return; // already reconnecting
		console.warn("[omp-deck] heartbeat stale — forcing reconnect");
		currentWs.forceReconnect();
	});
}

// Selectors ────────────────────────────────────────────────────────────────
export const selectActiveSession = (s: StoreState): SessionUi | undefined =>
	s.activeId ? s.sessionsById[s.activeId] : undefined;

// ─── Test exports ────────────────────────────────────────────────────────
// Internal accessors for store-level unit tests. Not part of the public API.
// These exist so behavior such as the streaming-watchdog contract can be
// exercised without spinning up a real WebSocket or event controller.
/** @internal */
export const __test__ = {
	streamingWatchdogCount: () => _streamingWatchdogs.size,
	hasStreamingWatchdog: (sessionId: string) => _streamingWatchdogs.has(sessionId),
	armStreamingWatchdog: _armStreamingWatchdog,
	clearStreamingWatchdog: _clearStreamingWatchdog,
	/**
	 * Push events into the batch queue and flush synchronously, bypassing the
	 * rAF/setTimeout scheduling. Used to make tests deterministic.
	 */
	enqueueAndFlush(
		events: Array<{ sessionId: string; event: AgentSessionEventJson }>,
		set: _SetFn,
		get: () => StoreState,
	): void {
		for (const e of events) _batchQueue.push(e);
		_flushBatch(set, get);
	},
};
