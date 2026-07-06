import {
	createAgentSession,
	ModelRegistry,
	SessionManager,
	settings as ompSettings,
	type AgentSession,
	type CreateAgentSessionResult,
} from "@oh-my-pi/pi-coding-agent";
import { getEnvApiKey } from "@oh-my-pi/pi-ai";
import { runExtensionCompact, runExtensionSetModel } from "@oh-my-pi/pi-coding-agent/extensibility/extensions/compact-handler";
import { getSessionSlashCommands } from "@oh-my-pi/pi-coding-agent/extensibility/extensions/get-commands-handler";
import { TASK_SUBAGENT_LIFECYCLE_CHANNEL, TASK_SUBAGENT_PROGRESS_CHANNEL } from "@oh-my-pi/pi-coding-agent/task";
import type {
	AgentSessionEventJson,
	ExtUiDialogResponse,
	ModelInfo,
	PendingPlanApprovalWire,
	ServerFrame,
	SessionSummary,
} from "@omp-deck/protocol";

import { logger } from "../log.ts";
import { getDeckModelRegistry } from "../auth-singleton.ts";
import { getEffectivePrelude } from "../orientation-store.ts";
import { notificationService } from "../notifications/index.ts";
import { ExtensionUIBridge } from "./ext-ui-bridge.ts";
import { GoalModeBridge, type GoalModeSessionSurface } from "./goal-mode-bridge.ts";
import { PlanModeBridge, type PlanModeSessionSurface } from "./plan-mode-bridge.ts";
import type {
	AgentBridge,
	CreateSessionOpts,
	EventListener,
	PlanApprovalResponse,
	ResumeSessionOpts,
	RuntimeEnvUpdate,
	SessionHandle,
} from "./types.ts";
import { InProcessSessionHandle } from "./session-handle.ts";
import {
	type SdkModel,
	summarize,
	getSubscriptionProviders,
	looksLikeAuthError,
	modelInfoFromSdk,
} from "./sdk-helpers.ts";

interface SessionManagerArtifactAccess {
	getArtifactsDir(): string | null;
	getSessionId(): string | null;
}

const log = logger("bridge:in-process");

/**
 * Derive a process-unique IRC/registry id for a deck session's main agent from
 * its minted session id. Prefixed so it is visually distinct from the SDK's
 * default `"Main"` and from subagent ids (which the task tool allocates as
 * task-name slugs). See the call sites in {@link AgentBridge.createSession} for
 * why the default `"Main"` cannot be shared across concurrent deck sessions.
 */
function mainAgentIdFor(sessionId: string): string {
	return `deck:${sessionId}`;
}

/**
 * System-prompt block prepended to every omp session created or resumed via
 * this bridge. The canonical text lives in `orientation-store.ts` so the deck
 * Settings UI can read + override it without touching server source. The
 * helper reads through to a deck-managed file on disk (`<dataDir>/prelude.md`)
 * and falls back to the bundled default when no override exists.
 */

interface Active {
	handle: InProcessSessionHandle;
	session: AgentSession;
	unsubscribe: () => void;
	/** Wall-clock ms of the last user-visible activity on this session. */
	lastActivityAt: number;
	/** True between turn_start and turn_end — never reap mid-turn. */
	turnInFlight: boolean;
	/** Set of WS connection ids currently subscribed. Reaping requires zero subscribers. */
	subscribers: Set<string>;
	/** Per-session bridge from SDK `ExtensionUIContext` calls to deck WS frames. */
	uiBridge: ExtensionUIBridge;
	/** Per-session bridge for the SDK plan-mode lifecycle. */
	planBridge: PlanModeBridge;
}

export class InProcessAgentBridge implements AgentBridge {
	private active = new Map<string, Active>();
	private disposed = false;
	private reaperTimer: ReturnType<typeof setInterval> | null = null;
	private idleTimeoutMs: number;
	private readonly reapIntervalMs: number;
	private autoStartCommand: string | null;
	/** Prompts queued to fire as soon as the named session gets its first WS subscriber. */
	private pendingAutoPrompts = new Map<string, string>();
	/** Shared SDK model registry, lazily constructed on first session create. */
	private modelRegistry: ModelRegistry | undefined;
	private modelRegistryPromise: Promise<ModelRegistry> | undefined;

	constructor(opts: {
		idleTimeoutMs?: number;
		reapIntervalMs?: number;
		autoStartCommand?: string | null;
	} = {}) {
		this.idleTimeoutMs = opts.idleTimeoutMs ?? 0; // disabled by default
		this.reapIntervalMs = opts.reapIntervalMs ?? 60_000; // scan once a minute
		// Distinguish `null` (explicitly disabled via config/env) from `undefined`
		// (not supplied — fall back to "/start" default for backward compat).
		this.autoStartCommand = opts.autoStartCommand === undefined ? "/start" : opts.autoStartCommand;
		if (this.idleTimeoutMs > 0) this.startReaper();
	}

	async createSession(opts: CreateSessionOpts): Promise<SessionHandle> {
		const sessionManager = SessionManager.create(opts.cwd);
		const modelRegistry = await this.ensureModelRegistry();
		const result = await createAgentSession({
			cwd: opts.cwd,
			sessionManager,
			modelRegistry,
			authStorage: modelRegistry.authStorage,
			// Skip eval-tool Python warmup on session create. On Windows this otherwise
			// flashes a python.exe console window each turn-zero; on demand spawn is fine.
			skipPythonPreflight: true,
			systemPrompt: (defaults) => [getEffectivePrelude(), ...defaults],
			// Give each deck session's main agent a UNIQUE id in the process-global
			// AgentRegistry / IrcBus, instead of the SDK default of "Main". The deck
			// runs many concurrent sessions in one process (one per workspace tab);
			// all sharing the id "Main" makes them collide in the flat IRC namespace —
			// registry refs overwrite each other and IRC delivery/`history://Main`
			// route to whichever session registered last, so a subagent's IRC message
			// in one workspace surfaces in another. A per-session id keeps each
			// session's agent tree addressable on its own. NOTE: the registry/bus are
			// still process-global and cannot be injected per-session without patching
			// the SDK, so `irc list` / broadcast(`to:"all"`) can still SEE peers from
			// other live sessions — that residual cross-session visibility is a known
			// limitation (see docs). This only stops the id COLLISION that caused
			// mis-delivery.
			agentId: mainAgentIdFor(sessionManager.getSessionId()),
			// Tell the SDK this session has a UI — gates the `ask` tool registration
			// and any extension that calls `ctx.ui.*`. The actual ExtensionUIContext
			// is installed via `setToolUIContext(...)` below.
			hasUI: true,
			// `opts.model` is a ModelRef ({provider,id}); the SDK's `model` option expects a
			// fully-shaped Model — resolve via the registry when present.
			...(opts.model
				? (() => {
						const m = modelRegistry.find(opts.model!.provider, opts.model!.id);
						return m ? { model: m } : {};
					})()
				: {}),
		});

		const session = result.session;
		const ext = result.extensionsResult;
		log.info(
			`createAgentSession: ${ext?.extensions?.length ?? 0} extensions loaded, ${ext?.errors?.length ?? 0} errors`,
			ext?.errors?.length ? ext.errors : undefined,
		);
		if (ext?.extensions?.length) {
			log.info(`extension paths: ${ext.extensions.map(e => (e as { path?: string }).path ?? "<unknown>").join(" | ")}`);
		}
		await this.wireExtensionRunner(session);
		const handle = this.attach(session, opts.cwd, sessionManager, result.setToolUIContext);
		if (!opts.suppressAutoStart && this.autoStartCommand) {
			this.pendingAutoPrompts.set(handle.sessionId, this.autoStartCommand);
		}
		log.info(`created session ${handle.sessionId} cwd=${opts.cwd}`);
		return handle;
	}

	async resumeSession(opts: ResumeSessionOpts): Promise<SessionHandle> {
		const sessionManager = await SessionManager.open(opts.sessionPath);
		const cwd = (sessionManager.getCwd?.() as string | undefined) ?? process.cwd();
		const modelRegistry = await this.ensureModelRegistry();
		const result = await createAgentSession({
			cwd,
			sessionManager,
			modelRegistry,
			authStorage: modelRegistry.authStorage,
			skipPythonPreflight: true,
			systemPrompt: (defaults) => [getEffectivePrelude(), ...defaults],
			// Unique per-session main-agent id — see the rationale in createSession.
			agentId: mainAgentIdFor(sessionManager.getSessionId()),
			hasUI: true,
		});
		const session = result.session;
		const handle = this.attach(session, cwd, sessionManager, result.setToolUIContext);
		await this.wireExtensionRunner(session);
		log.info(`resumed session ${handle.sessionId} from ${opts.sessionPath}`);
		return handle;
	}


	getSession(sessionId: string): SessionHandle | undefined {
		return this.active.get(sessionId)?.handle;
	}

	async listSessions(opts: { cwd?: string }): Promise<SessionSummary[]> {
		const raw = opts.cwd
			? await SessionManager.list(opts.cwd)
			: await SessionManager.listAll();
		return raw.map((r: any) => summarize(r));
	}

	private ensureModelRegistry(): Promise<ModelRegistry> {
		if (this.modelRegistry) return Promise.resolve(this.modelRegistry);
		if (this.modelRegistryPromise) return this.modelRegistryPromise;
		this.modelRegistryPromise = (async () => {
			const registry = await getDeckModelRegistry();
			this.modelRegistry = registry;
			return registry;
		})();
		return this.modelRegistryPromise;
	}

	async listModels(opts: { sessionId?: string; ensureOnlineRefresh?: boolean } = {}): Promise<ModelInfo[]> {
		const registry = await this.ensureModelRegistry();
		if (opts.ensureOnlineRefresh) await registry.refresh("online");
		const current = opts.sessionId ? this.active.get(opts.sessionId)?.handle.snapshot().model : undefined;
		return registry.getAll().map((model) => modelInfoFromSdk(model as unknown as SdkModel, registry, current));
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		if (this.reaperTimer) {
			clearInterval(this.reaperTimer);
			this.reaperTimer = null;
		}
		log.info(`disposing ${this.active.size} active session(s)`);
		const disposals = Array.from(this.active.values()).map((a) =>
			a.handle.dispose().catch((err) => log.warn(`dispose failed`, err)),
		);
		await Promise.all(disposals);
		this.active.clear();
		this.pendingAutoPrompts.clear();
	}

	/** Called by the WS hub when a connection subscribes. Pin the session against the reaper. */
	trackSubscriberAdded(sessionId: string, connectionId: string): void {
		const a = this.active.get(sessionId);
		if (!a) return;
		const wasEmpty = a.subscribers.size === 0;
		a.subscribers.add(connectionId);
		a.lastActivityAt = Date.now();

		// First subscriber attached — flush any queued auto-prompt. Defer one
		// macrotask so the WS layer has flushed the `subscribed` snapshot frame
		// before the agent starts emitting `agent_start` / `message_*`.
		if (wasEmpty) {
			const pending = this.pendingAutoPrompts.get(sessionId);
			if (pending !== undefined) {
				this.pendingAutoPrompts.delete(sessionId);
				setTimeout(() => {
					a.handle.prompt(pending).catch((err) =>
						log.warn(`auto-start prompt failed for ${sessionId}`, err),
					);
				}, 50);
			}
		}
	}

	/** Called by the WS hub on unsubscribe / connection close. */
	trackSubscriberRemoved(sessionId: string, connectionId: string): void {
		const a = this.active.get(sessionId);
		if (!a) return;
		a.subscribers.delete(connectionId);
		a.lastActivityAt = Date.now();
	}

	/** Bumps last-activity to now; called from prompt / abort / explicit access. */
	bumpActivity(sessionId: string): void {
		const a = this.active.get(sessionId);
		if (!a) return;
		a.lastActivityAt = Date.now();
	}

	applyEnvUpdate(update: RuntimeEnvUpdate): void {
		if (update.autoStartCommand !== undefined) {
			this.autoStartCommand = update.autoStartCommand;
			log.info(`hot-applied autoStartCommand`, { enabled: Boolean(update.autoStartCommand) });
		}
		if (update.idleTimeoutMs !== undefined && update.idleTimeoutMs !== this.idleTimeoutMs) {
			this.idleTimeoutMs = update.idleTimeoutMs;
			if (this.reaperTimer) {
				clearInterval(this.reaperTimer);
				this.reaperTimer = null;
			}
			if (this.idleTimeoutMs > 0) this.startReaper();
			log.info(`hot-applied idleTimeoutMs`, { idleTimeoutMs: this.idleTimeoutMs });
		}
	}

	private startReaper(): void {
		this.reaperTimer = setInterval(() => {
			this.reapIdle().catch((err) => log.warn(`reaper failed`, err));
		}, this.reapIntervalMs);
		// Don't keep the event loop alive for the timer alone.
		(this.reaperTimer as unknown as { unref?: () => void }).unref?.();
	}

	private async reapIdle(): Promise<void> {
		if (this.disposed) return;
		const now = Date.now();
		const cutoff = now - this.idleTimeoutMs;
		const candidates: Active[] = [];
		for (const a of this.active.values()) {
			if (a.turnInFlight) continue;
			if (a.subscribers.size > 0) continue;
			if (a.lastActivityAt > cutoff) continue;
			candidates.push(a);
		}
		if (candidates.length === 0) return;
		log.info(`reaping ${candidates.length} idle session(s)`);
		await Promise.all(
			candidates.map((a) =>
				a.handle.dispose().catch((err) => log.warn(`reap dispose failed`, err)),
			),
		);
	}

	/**
	 * Wire session-bound callbacks into the session's ExtensionRunner so the
	 * lifecycle events fire and `pi.sendUserMessage` etc. reach the right
	 * session. `createAgentSession` does extension *discovery* + runner
	 * construction internally; the embedder is responsible for installing
	 * the per-session callbacks afterward (mirrors task/executor.ts and
	 * modes/acp/acp-agent.ts). Without this, loaded extensions are inert.
	 */
	private async wireExtensionRunner(session: AgentSession): Promise<void> {
		const runner = (session as unknown as { extensionRunner?: unknown }).extensionRunner as
			| {
					initialize: (actions: unknown, contextActions: unknown) => void;
					emit: (event: { type: string }) => Promise<void> | void;
					onError: (h: (e: { extensionPath?: string; error: unknown }) => void) => void;
			  }
			| undefined;
		if (!runner) return;

		const s = session as unknown as {
			sendCustomMessage: (msg: unknown, opts?: unknown) => Promise<void>;
			sendUserMessage: (content: unknown, opts?: unknown) => Promise<void>;
			sessionManager: {
				appendCustomEntry: (customType: string, data?: unknown) => string;
				appendLabelChange: (targetId: string, label: string) => void;
				getSessionName: () => string | undefined;
				setSessionName: (name: string, source: string) => Promise<void>;
			};
			getActiveToolNames: () => string[];
			getAllToolNames: () => string[];
			setActiveToolsByName: (names: string[]) => void;
			setModel: (model: unknown) => Promise<void>;
			modelRegistry: { getApiKey: (m: unknown) => Promise<string | undefined> };
			model: unknown;
			thinkingLevel: unknown;
			setThinkingLevel: (l: unknown) => void;
			isStreaming: boolean;
			abort: () => void;
			queuedMessageCount: number;
			getContextUsage: () => unknown;
			systemPrompt: unknown;
		};

		const actions = {
			sendMessage: (message: unknown, options?: unknown) => {
				s.sendCustomMessage(message, options).catch((err: unknown) => {
					log.warn(`extension sendMessage failed`, err);
				});
			},
			sendUserMessage: (content: unknown, options?: unknown) => {
				s.sendUserMessage(content, options).catch((err: unknown) => {
					log.warn(`extension sendUserMessage failed`, err);
				});
			},
			appendEntry: (customType: string, data?: unknown) => {
				return s.sessionManager.appendCustomEntry(customType, data);
			},
			setLabel: (targetId: string, label: string) => {
				s.sessionManager.appendLabelChange(targetId, label);
			},
			getActiveTools: () => s.getActiveToolNames(),
			getAllTools: () => s.getAllToolNames(),
			setActiveTools: (toolNames: string[]) => s.setActiveToolsByName(toolNames),
			getCommands: () => getSessionSlashCommands(s as never),
			setModel: (model: unknown) => runExtensionSetModel(s as never, model as never),
			getThinkingLevel: () => s.thinkingLevel,
			setThinkingLevel: (level: unknown) => s.setThinkingLevel(level),
			getSessionName: () => s.sessionManager.getSessionName(),
			setSessionName: async (name: string) => {
				await s.sessionManager.setSessionName(name, "user");
			},
		};

		const contextActions = {
			getModel: () => s.model,
			isIdle: () => !s.isStreaming,
			abort: () => s.abort(),
			hasPendingMessages: () => s.queuedMessageCount > 0,
			shutdown: () => {},
			getContextUsage: () => s.getContextUsage(),
			getSystemPrompt: () => s.systemPrompt,
			compact: (instructionsOrOptions: unknown) =>
				runExtensionCompact(s as never, instructionsOrOptions as never),
		};

		try {
			runner.initialize(actions, contextActions);
			runner.onError((err) => {
				log.warn(`extension error in ${err.extensionPath ?? "<unknown>"}`, err.error);
			});
			await runner.emit({ type: "session_start" });
			log.info(`extension runner wired for session`);
		} catch (err) {
			log.warn(`extension runner wiring failed`, err);
		}
	}

	private attach(
		session: AgentSession,
		cwd: string,
		sessionManager: SessionManager,
		setToolUIContext: CreateAgentSessionResult["setToolUIContext"],
	): InProcessSessionHandle {
		const agentSession = session as AgentSession & { sessionId: string };
		const sessionId = agentSession.sessionId;
		const sessionArtifacts = sessionManager as unknown as SessionManagerArtifactAccess;
		const uiBridge = new ExtensionUIBridge(sessionId);
		// Wire the per-session UI context into the SDK's tool-context store so
		// `AskTool.execute(...)` (and any extension calling `ctx.ui.*`) reaches
		// the deck UI via WebSocket frames.
		setToolUIContext(uiBridge, true);

		const planBridge = new PlanModeBridge({
			sessionId,
			session: session as unknown as PlanModeSessionSurface,
			getArtifactsDir: () => sessionArtifacts.getArtifactsDir(),
			getSessionId: () => sessionArtifacts.getSessionId(),
		});

		const goalBridge = new GoalModeBridge({
			sessionId,
			session: session as unknown as GoalModeSessionSurface,
		});

		const handle = new InProcessSessionHandle({
			session,
			sessionManager,
			cwd,
			sessionId,
			getModelRegistry: () => this.ensureModelRegistry(),
			planBridge,
			goalBridge,
			onDispose: () => {
				uiBridge.dispose();
				planBridge.dispose();
				goalBridge.dispose();
				this.active.delete(sessionId);
				this.pendingAutoPrompts.delete(sessionId);
			},
		});

		const eventBus = (session as unknown as {
			eventBus?: { on: (channel: string, handler: (payload: unknown) => void) => () => void };
		}).eventBus;
		const unsubscribeSubagentLifecycle = eventBus?.on(TASK_SUBAGENT_LIFECYCLE_CHANNEL, (payload) => {
			handle.emit({ type: "subagent_lifecycle", payload } as unknown as AgentSessionEventJson);
		});
		const unsubscribeSubagentProgress = eventBus?.on(TASK_SUBAGENT_PROGRESS_CHANNEL, (payload) => {
			handle.emit({ type: "subagent_progress", payload } as unknown as AgentSessionEventJson);
		});

		// Bridge SDK events to handle's listeners, AND to bridge-internal activity
		// tracking so the reaper sees real agent work and won't kill an in-flight turn.
		const unsubscribeSession = session.subscribe((event) => {
			const entry = this.active.get(sessionId);
			if (entry) {
				entry.lastActivityAt = Date.now();
				const type = (event as { type?: string })?.type;
				if (type === "turn_start") entry.turnInFlight = true;
				else if (type === "turn_end" || type === "agent_end") entry.turnInFlight = false;
			}
			handle.emit(event as unknown as AgentSessionEventJson);
			// After the SDK's own event reaches subscribers, fire a synthetic
			// `context_usage` event on the moments where the underlying number
			// changes: a turn finishing (fresh assistant usage now available)
			// or a compaction completing (post-compaction context shrunk).
			const type = (event as { type?: string })?.type;
			if (type === "turn_end" || type === "agent_end" || type === "compaction_complete") {
				const usage = handle.getContextUsage();
				if (usage) {
					handle.emit({ type: "context_usage", contextUsage: usage } as unknown as AgentSessionEventJson);
				}
			}
			// Same pattern for todos: the SDK only fires `todo_reminder` on
			// reminder ticks (typically at turn boundaries), so the deck UI
			// shows stale todos between an agent's `todo_write` call and the
			// next reminder cycle. Synthesize `todo_phases_set` after each
			// todo_write tool result so the Inspector TodoPanel reflects the
			// current phase tree within the same tick (T-106).
			if (type === "tool_execution_end" && event && typeof event === "object" && "toolName" in event) {
				const toolName = event.toolName;
				if (toolName === "todo" && "getTodoPhases" in session && typeof session.getTodoPhases === "function") {
					const phases = session.getTodoPhases();
					if (Array.isArray(phases)) {
						handle.emit({ type: "todo_phases_set", todoPhases: phases } as unknown as AgentSessionEventJson);
					}
				}
			}
			// Issue #4 recovery hint: when the SDK surfaces an auth-shaped error
			// (401 / "Incorrect API key") on a request to an API-key provider
			// AND a subscription (OAuth) variant of the same model name exists
			// AND is actually authenticated, fire a deck notification telling
			// the operator to switch. Without this, the chat shows the raw 401
			// inline and the operator has no idea why a fresh ChatGPT-Plus
			// install rejected their first prompt. See issue #4.
			if (type === "notice") {
				const n = event as { level?: string; message?: string };
				if (n.level === "error" && typeof n.message === "string" && looksLikeAuthError(n.message)) {
					this.maybeSuggestSubscriptionFallback(session, n.message).catch((err) =>
						log.warn("subscription-fallback hint failed", err),
					);
				}
			}
		});
		const unsubscribe = () => {
			unsubscribeSession();
			unsubscribeSubagentLifecycle?.();
			unsubscribeSubagentProgress?.();
		};

		this.active.set(sessionId, {
			handle,
			session,
			unsubscribe,
			lastActivityAt: Date.now(),
			turnInFlight: false,
			subscribers: new Set(),
			uiBridge,
			planBridge,
		});
		return handle;
	}

	// ─── Extension UI dialog bridge surface ──────────────────────────────

	subscribeUiFrames(
		sessionId: string,
		listener: (
			frame: Extract<ServerFrame, { type: "ext_ui_dialog_open" | "ext_ui_dialog_cancel" }>,
		) => void,
	): () => void {
		const entry = this.active.get(sessionId);
		if (!entry) return () => {};
		// Replay any already-open dialogs to the late subscriber so a page
		// reload doesn't strand the user with an invisible blocking modal.
		for (const frame of entry.uiBridge.getPendingFrames()) {
			try {
				listener(frame);
			} catch (err) {
				log.warn(`pending UI frame replay threw`, err);
			}
		}
		return entry.uiBridge.subscribeFrames(listener);
	}

	respondToUiDialog(sessionId: string, dialogId: string, response: ExtUiDialogResponse): void {
		const entry = this.active.get(sessionId);
		if (!entry) return;
		entry.uiBridge.handleResponse(dialogId, response);
	}

	// ─── Plan-mode bridge surface ────────────────────────────────────────

	subscribePlanModeFrames(
		sessionId: string,
		listener: (
			frame: Extract<
				ServerFrame,
				{ type: "plan_mode_changed" | "plan_proposed" | "plan_proposal_resolved" }
			>,
		) => void,
	): () => void {
		const entry = this.active.get(sessionId);
		if (!entry) return () => {};
		// Replay current plan-mode state + any pending approval to the late
		// subscriber so a reconnect mid-approval re-renders the card instead
		// of waiting for the next event.
		for (const frame of entry.planBridge.getReplayFrames()) {
			try {
				listener(frame);
			} catch (err) {
				log.warn(`pending plan-mode frame replay threw`, err);
			}
		}
		return entry.planBridge.subscribeFrames(listener);
	}

	async respondToPlanApproval(
		sessionId: string,
		proposalId: string,
		response: PlanApprovalResponse,
	): Promise<"settled" | "unknown"> {
		const entry = this.active.get(sessionId);
		if (!entry) return "unknown";
		this.bumpActivity(sessionId);
		return entry.planBridge.respond(proposalId, response);
	}

	/**
	 * Issue #4: emit a deck notification when an inline auth error on the
	 * current model has a known recovery path (subscription provider with
	 * the same model id is authenticated). Idempotent in the failure case —
	 * if any precondition is missing we just bail silently. The notification
	 * lands in the standard dropdown + optional OS toast so the operator
	 * sees it even if the chat is scrolled past the inline error.
	 */
	private async maybeSuggestSubscriptionFallback(
		session: AgentSession,
		errorMessage: string,
	): Promise<void> {
		const snap = (session as unknown as { snapshot?: () => { model?: { provider?: string; id?: string } } }).snapshot?.();
		const current = snap?.model;
		if (!current?.provider || !current.id) return;
		// Already on a subscription provider — nothing to suggest.
		if (getSubscriptionProviders().has(current.provider)) return;
		const registry = await this.ensureModelRegistry();
		// Look for any subscription provider carrying the same model id that's
		// authenticated (auth.db has OAuth credential).
		const alternative = registry
			.getAll()
			.map((m) => m as unknown as SdkModel)
			.find((m) => {
				if (m.id !== current.id) return false;
				const provider = String(m.provider);
				if (!getSubscriptionProviders().has(provider)) return false;
				const sdkModel = m as unknown as Parameters<ModelRegistry["isUsingOAuth"]>[0];
				return registry.isUsingOAuth(sdkModel);
			});
		if (!alternative) return;
		const altProvider = String(alternative.provider);
		await notificationService.notify({
			level: "warn",
			title: `Authentication failed for ${current.provider}/${current.id}`,
			body: `You appear to be authenticated for the same model under \`${altProvider}\` (subscription). Switch in the model picker to use your subscription instead.\n\nOriginal error: ${errorMessage.slice(0, 240)}`,
			source: `bridge:auth-fallback`,
		});
	}
}
