import {
	ModelRegistry,
	SessionManager,
	settings as ompSettings,
	type AgentSession,
} from "@oh-my-pi/pi-coding-agent";
import { executeAcpBuiltinSlashCommand } from "@oh-my-pi/pi-coding-agent/slash-commands/acp-builtins";
import type {
	AgentMessageJson,
	AgentSessionEventJson,
	ContextUsage,
	ImageAttachment,
	ModelRef,
	PendingPlanApprovalWire,
	PlanModeContextWire,
	QueuedPromptWire,
	SessionSnapshot,
} from "@omp-deck/protocol";

import { logger } from "../log.ts";
import type { DeckSlashResult } from "../deck-slash-commands.ts";
import { resolveProviderName } from "../provider-names.ts";
import { PlanModeBridge } from "./plan-mode-bridge.ts";
import type {
	EventListener,
	PlanApprovalResponse,
	SessionHandle,
	SlashDispatchResult,
} from "./types.ts";
import { extractMessageText } from "./sdk-helpers.ts";

const log = logger("bridge:in-process");

const BRANCHING_EVENT_TYPE = "session_replaced";


function extractSelectedText(result: unknown): string {
	return typeof result === "object" && result !== null && "selectedText" in result && typeof (result as { selectedText?: unknown }).selectedText === "string"
		? (result as { selectedText: string }).selectedText
		: "";
}
export class InProcessSessionHandle implements SessionHandle {
	readonly sessionId: string;
	readonly cwd: string;
	private session: AgentSession;
	private readonly sessionManager: SessionManager;
	private readonly modelRegistryRef: () => Promise<ModelRegistry>;
	private readonly planBridge: PlanModeBridge;
	private listeners = new Set<EventListener>();
	private onDisposeCallback: () => void;
	private disposed = false;
	/**
	 * Shadow of the SDK's pending-prompt queue. Entries are appended in
	 * `prompt()` when the SDK confirms a queue (wasStreaming = true) and
	 * removed in two ways:
	 *   - SDK drains the head as a new turn starts → caught in `emit()` on
	 *     the matching user `message_start` (matches by text, mirroring the
	 *     web reducer's drain rule).
	 *   - User explicitly cancels / edits via `cancelQueuedById` /
	 *     `editQueuedById` / `clearQueue`.
	 * The wire id (`queuedId` echoed in `prompt_queued`) is the same id used
	 * for cancel/edit targeting, so client and server agree without a
	 * separate id mapping table.
	 */
	private shadowQueue: QueuedPromptWire[] = [];

	constructor(args: {
		session: AgentSession;
		sessionManager: SessionManager;
		cwd: string;
		sessionId: string;
		getModelRegistry: () => Promise<ModelRegistry>;
		planBridge: PlanModeBridge;
		onDispose: () => void;
	}) {
		this.session = args.session;
		this.sessionManager = args.sessionManager;
		this.cwd = args.cwd;
		this.sessionId = args.sessionId;
		this.modelRegistryRef = args.getModelRegistry;
		this.planBridge = args.planBridge;
		this.onDisposeCallback = args.onDispose;
	}

	get sessionFile(): string | undefined {
		return (this.session as any).sessionFile as string | undefined;
	}

	subscribe(listener: EventListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	emit(event: AgentSessionEventJson): void {
		this.maybeDrainShadowHead(event);
		for (const listener of this.listeners) {
			try {
				listener(event);
			} catch (err) {
				log.warn(`listener failed`, err);
			}
		}
	}

	/**
	 * When the SDK starts a new turn it emits a `message_start` for the
	 * (non-synthetic) user message that triggered it. If that message text
	 * matches a shadowed queued prompt, the SDK drained it from the queue —
	 * pop the matching entry so the deck UI's queued-bubble disappears in
	 * lockstep with the real user bubble that appears.
	 *
	 * Match-by-text is brittle on duplicates but mirrors the web reducer's
	 * existing logic; the bridge keeps its shadow text aligned with the
	 * SDK-stored expansion (see `prompt()`) so slash-expanded prompts match.
	 */
	private maybeDrainShadowHead(event: AgentSessionEventJson): void {
		if (this.shadowQueue.length === 0) return;
		if ((event as { type?: string }).type !== "message_start") return;
		const message = (event as { message?: { role?: string; content?: unknown; synthetic?: boolean } }).message;
		if (!message || message.role !== "user" || message.synthetic) return;
		const text = extractMessageText(message.content);
		if (!text) return;
		const idx = this.shadowQueue.findIndex((q) => q.text === text);
		if (idx < 0) return;
		this.shadowQueue.splice(idx, 1);
		this.emitQueueState();
	}

	/**
	 * Broadcast the current shadow queue to subscribers so they can replace
	 * their local `queuedPrompts` wholesale. Used after cancel/edit/clear
	 * and on drain. Carries `null` for empty so the reducer can distinguish
	 * "queue actively empty" from "no state delivered yet".
	 */
	private emitQueueState(): void {
		// Direct fan-out — do NOT route through `emit()` or we'd recurse via
		// `maybeDrainShadowHead`.
		const frame = {
			type: "queue_state",
			queue: [...this.shadowQueue],
		} as unknown as AgentSessionEventJson;
		for (const listener of this.listeners) {
			try {
				listener(frame);
			} catch (err) {
				log.warn(`queue_state listener failed`, err);
			}
		}
	}

	snapshot(): SessionSnapshot {
		const s = this.session as any;
		const usage = this.getContextUsage();
		const snap: SessionSnapshot = {
			sessionId: this.sessionId,
			sessionFile: this.sessionFile,
			sessionName: typeof s.sessionName === "string" ? s.sessionName : undefined,
			cwd: this.cwd,
		model:
			s.model && typeof s.model === "object"
				? { provider: String(s.model.provider), id: String(s.model.id), providerName: resolveProviderName(String(s.model.provider)) }
				: undefined,
			thinkingLevel: typeof s.thinkingLevel === "string" ? s.thinkingLevel : undefined,
			isStreaming: Boolean(s.isStreaming),
			messages: Array.isArray(s.messages) ? (s.messages as AgentMessageJson[]) : [],
			todoPhases: typeof s.getTodoPhases === "function" ? s.getTodoPhases() : [],
		};
		if (usage) snap.contextUsage = usage;
		const planMode = this.planBridge.getPlanModeContext();
		if (planMode) snap.planMode = planMode;
		const pendingPlan = this.planBridge.getPendingPlanApproval();
		if (pendingPlan) snap.pendingPlanApproval = pendingPlan;
		if (this.shadowQueue.length > 0) snap.queuedPrompts = [...this.shadowQueue];
		return snap;
	}

	getContextUsage(): ContextUsage | undefined {
		// The SDK exposes `session.getContextUsage()` returning
		// `{ tokens: number | null, contextWindow: number, percent: number | null }`
		// or `undefined` when the model has no declared window. We pass it through
		// verbatim — the deck's protocol type mirrors the SDK shape.
		const s = this.session as unknown as {
			getContextUsage?: () => ContextUsage | undefined;
		};
		if (typeof s.getContextUsage !== "function") return undefined;
		try {
			return s.getContextUsage();
		} catch (err) {
			log.warn(`getContextUsage threw`, err);
			return undefined;
		}
	}

	async compact(focus?: string): Promise<void> {
		// `session.compact(customInstructions?)` is the public SDK entry. The
		// SDK guards against concurrent compactions itself (throws "Compaction
		// already in progress") — we surface that error to the caller as-is so
		// the UI can show it.
		const s = this.session as unknown as {
			compact?: (customInstructions?: string) => Promise<unknown>;
		};
		if (typeof s.compact !== "function") {
			throw new Error("session.compact is not available on this SDK build");
		}
		await s.compact(focus && focus.trim().length > 0 ? focus.trim() : undefined);
	}

	async setModel(ref: ModelRef): Promise<void> {
		const registry = await this.modelRegistryRef();
		const model = registry.find(ref.provider, ref.id);
		if (!model) throw new Error(`unknown model: ${ref.provider}/${ref.id}`);
		if (!registry.hasConfiguredAuth(model)) {
			throw new Error(`no auth configured for ${ref.provider}/${ref.id}`);
		}
		const s = this.session as unknown as {
			setModel?: (model: unknown, role?: string) => Promise<void>;
		};
		if (typeof s.setModel !== "function") {
			throw new Error("session.setModel is not available on this SDK build");
		}
		await s.setModel(model);
		// Synthetic event so WS subscribers refresh the session header's model
		// label without waiting for the next assistant turn.
		this.emit({ type: "session_updated", snapshot: this.snapshot() } as unknown as AgentSessionEventJson);
	}

	private dispatchSessionReplaced(session: AgentSession): void {
		const s = session as any;
		const snap: SessionSnapshot = {
			sessionId: this.sessionId,
			sessionFile: typeof s.sessionFile === "string" ? s.sessionFile : undefined,
			sessionName: typeof s.sessionName === "string" ? s.sessionName : undefined,
			cwd: this.cwd,
			model:
				s.model && typeof s.model === "object"
					? { provider: String(s.model.provider), id: String(s.model.id), providerName: resolveProviderName(String(s.model.provider)) }
					: undefined,
			thinkingLevel: typeof s.thinkingLevel === "string" ? s.thinkingLevel : undefined,
			isStreaming: Boolean(s.isStreaming),
			messages: Array.isArray(s.messages) ? (s.messages as AgentMessageJson[]) : [],
			todoPhases: typeof s.getTodoPhases === "function" ? s.getTodoPhases() : [],
		};
		const usage = this.getContextUsage();
		if (usage) snap.contextUsage = usage;
		this.emit({ type: BRANCHING_EVENT_TYPE, snapshot: snap } as unknown as AgentSessionEventJson);
	}

	async fork(): Promise<void> {
		const s = this.session as unknown as { fork?: () => Promise<boolean> };
		if (typeof s.fork !== "function") {
			throw new Error("session.fork is not available on this SDK build");
		}
		const ok = await s.fork();
		if (ok) this.dispatchSessionReplaced(this.session);
	}

	async branch(entryId: string): Promise<{ selectedText: string }> {
		const s = this.session as unknown as {
			branch?: (id: string) => Promise<{ selectedText: string; cancelled: boolean }>;
		};
		if (typeof s.branch !== "function") {
			throw new Error("session.branch is not available on this SDK build");
		}
		const result = await s.branch(entryId);
		if (result.cancelled) {
			return { selectedText: result.selectedText };
		}
		this.dispatchSessionReplaced(this.session);
		return { selectedText: extractSelectedText(result) };
	}

	async rewind(entryId: string): Promise<{ editorText?: string }> {
		const s = this.session as unknown as {
			navigateTree?: (id: string, opts?: { summarize?: boolean; customInstructions?: string }) => Promise<{ editorText?: string; cancelled: boolean }>;
		};
		if (typeof s.navigateTree !== "function") {
			throw new Error("session.navigateTree is not available on this SDK build");
		}
		const result = await s.navigateTree(entryId);
		if (result.cancelled) return {};
		this.dispatchSessionReplaced(this.session);
		return typeof result.editorText === "string" ? { editorText: result.editorText } : {};
	}

	getBranchPoints(): Array<{ entryId: string; text: string }> {
		const s = this.session as unknown as {
			getUserMessagesForBranching?: () => Array<{ entryId: string; text: string }>;
		};
		if (typeof s.getUserMessagesForBranching !== "function") return [];
		return s.getUserMessagesForBranching();
	}

	async dispatchDeckSlashCommand(text: string): Promise<SlashDispatchResult> {
		if (!text.startsWith("/")) return { kind: "fallthrough" };
		let result: DeckSlashResult | "fallthrough";
		try {
			const { executeDeckSlashCommand } = await import("../deck-slash-commands.ts");
			result = await executeDeckSlashCommand(text, { cwd: this.cwd });
		} catch (err) {
			const message = `Slash command error: ${String((err as Error).message ?? err)}`;
			log.warn(`deck slash dispatch threw for ${text.slice(0, 40)}: ${String(err)}`);
			this.emitSyntheticSlashRoundTrip(text, message);
			return { kind: "consumed", output: message };
		}
		if (result === "fallthrough") return { kind: "fallthrough" };
		this.emitSyntheticSlashRoundTrip(text, result.output || "Done.");
		return { kind: "consumed", output: result.output || "Done." };
	}

	async dispatchSlashCommand(text: string): Promise<SlashDispatchResult> {
		if (!text.startsWith("/")) return { kind: "fallthrough" };
		const chunks: string[] = [];
		const runtime = {
			session: this.session,
			sessionManager: this.sessionManager,
			settings: ompSettings,
			cwd: this.cwd,
			output: (line: string) => {
				if (line) chunks.push(line);
			},
			refreshCommands: () => {},
			reloadPlugins: async () => {},
		};
		let result: unknown;
		try {
			result = await executeAcpBuiltinSlashCommand(text, runtime as unknown as Parameters<typeof executeAcpBuiltinSlashCommand>[1]);
		} catch (err) {
			const message = `Slash command error: ${String((err as Error).message ?? err)}`;
			log.warn(`slash dispatch threw for ${text.slice(0, 40)}: ${String(err)}`);
			this.emitSyntheticSlashRoundTrip(text, message);
			return { kind: "consumed", output: message };
		}
		const output = chunks.join("\n").trim();
		if (result === false) return { kind: "fallthrough" };
		if (result && typeof result === "object" && "prompt" in result && typeof (result as { prompt: unknown }).prompt === "string") {
			this.emitSyntheticSlashRoundTrip(text, output || undefined);
			return { kind: "rewritten", output, prompt: (result as { prompt: string }).prompt };
		}
		const final = output || "Done.";
		this.emitSyntheticSlashRoundTrip(text, final);
		return { kind: "consumed", output: final };
	}

	private emitSyntheticSlashRoundTrip(userText: string, assistantText: string | undefined): void {
		const now = Date.now();
		this.emit({
			type: "message_start",
			message: {
				role: "user",
				content: userText,
				timestamp: now,
				synthetic: true,
			},
		} as unknown as AgentSessionEventJson);
		if (!assistantText) return;
		this.emit({
			type: "message_start",
			message: {
				role: "assistant",
				content: [{ type: "text", text: assistantText }],
				timestamp: now,
				synthetic: true,
			},
		} as unknown as AgentSessionEventJson);
	}

	async prompt(
		text: string,
		opts?: { streamingBehavior?: "steer" | "followUp"; images?: ImageAttachment[] },
	): Promise<void> {
		// Snapshot the streaming flag BEFORE calling the SDK so we can tell
		// whether the SDK queued this prompt (was streaming) or ran it immediately.
		// The deck UI uses this to surface a "queued" bubble — without it, prompts
		// sent during streaming look like they vanished until the current turn ends.
		const wasStreaming = this.isStreamingNow();
		const behavior = (opts?.streamingBehavior ?? "followUp") as "steer" | "followUp";
		const promptOpts: Record<string, unknown> = {};
		if (opts?.streamingBehavior) promptOpts.streamingBehavior = opts.streamingBehavior;
		if (opts?.images && opts.images.length > 0) promptOpts.images = opts.images;
		await this.session.prompt(text, Object.keys(promptOpts).length > 0 ? (promptOpts as any) : undefined);
		if (wasStreaming) {
			const queuedId = crypto.randomUUID();
			// Align shadow text with whatever the SDK actually stored (post-
			// slash/template expansion) so head-drain matching survives expansion.
			// Falls back to the raw text when the SDK doesn't expose getQueuedMessages.
			const storedText = this.readLastQueuedText(behavior) ?? text;
			const entry: QueuedPromptWire = {
				id: queuedId,
				text: storedText,
				behavior,
				queuedAt: Date.now(),
			};
			if (opts?.images && opts.images.length > 0) entry.images = opts.images;
			this.shadowQueue.push(entry);
			this.emit({
				type: "prompt_queued",
				queuedId,
				text: storedText,
				images: opts?.images,
				behavior,
				queueLength: this.queuedMessageCount(),
			} as unknown as AgentSessionEventJson);
			this.emitQueueState();
		}
	}

	isStreamingNow(): boolean {
		const s = this.session as unknown as { isStreaming?: boolean };
		return Boolean(s.isStreaming);
	}

	queuedMessageCount(): number {
		const s = this.session as unknown as { queuedMessageCount?: number };
		return typeof s.queuedMessageCount === "number" ? s.queuedMessageCount : 0;
	}

	getQueueSnapshot(): QueuedPromptWire[] {
		return [...this.shadowQueue];
	}

	clearQueue(): { steering: number; followUp: number } {
		const s = this.session as unknown as {
			clearQueue?: () => { steering: string[]; followUp: string[] };
		};
		if (typeof s.clearQueue !== "function") return { steering: 0, followUp: 0 };
		const dropped = s.clearQueue();
		const counts = { steering: dropped.steering.length, followUp: dropped.followUp.length };
		const hadShadow = this.shadowQueue.length > 0;
		this.shadowQueue = [];
		if (counts.steering + counts.followUp > 0) {
			this.emit({
				type: "queue_cleared",
				cleared: counts,
			} as unknown as AgentSessionEventJson);
		}
		if (hadShadow) this.emitQueueState();
		return counts;
	}

	async cancelQueuedById(id: string): Promise<boolean> {
		const idx = this.shadowQueue.findIndex((q) => q.id === id);
		if (idx < 0) return false;
		await this.rebuildQueueExcept(idx, undefined);
		return true;
	}

	async editQueuedById(
		id: string,
		text: string,
		images?: ImageAttachment[],
	): Promise<boolean> {
		const idx = this.shadowQueue.findIndex((q) => q.id === id);
		if (idx < 0) return false;
		await this.rebuildQueueExcept(idx, { text, images });
		return true;
	}

	/**
	 * Rebuild the SDK queue by popping every entry and re-enqueueing
	 * survivors. When `replace` is undefined the entry at `targetIdx` is
	 * dropped (cancel); when set, its text/images are substituted in place
	 * (edit). Preserves order and the `queuedId` of every other entry so
	 * client bubbles don't flicker.
	 *
	 * Safety: the operation is only safe while a turn is in flight (queue is
	 * non-empty by precondition). The pop loop is synchronous so no
	 * microtasks can run mid-loop; the re-enqueue calls are kicked off
	 * synchronously (their sync prelude all observes `isStreaming = true`
	 * because the active turn is still streaming) and awaited in parallel.
	 */
	private async rebuildQueueExcept(
		targetIdx: number,
		replace: { text: string; images?: ImageAttachment[] } | undefined,
	): Promise<void> {
		const sdk = this.session as unknown as {
			popLastQueuedMessage?: () => string | undefined;
			isStreaming?: boolean;
		};
		if (typeof sdk.popLastQueuedMessage !== "function") {
			throw new Error("session.popLastQueuedMessage is not available on this SDK build");
		}
		// Capture survivors with original ids preserved. The edited entry
		// keeps its id so the deck bubble doesn't re-key.
		const survivors: QueuedPromptWire[] = [];
		for (let i = 0; i < this.shadowQueue.length; i++) {
			const entry = this.shadowQueue[i]!;
			if (i === targetIdx) {
				if (!replace) continue;
				const next: QueuedPromptWire = {
					id: entry.id,
					text: replace.text,
					behavior: entry.behavior,
					queuedAt: entry.queuedAt,
				};
				if (replace.images && replace.images.length > 0) next.images = replace.images;
				survivors.push(next);
			} else {
				survivors.push(entry);
			}
		}
		// Synchronously drain the SDK queue. popLastQueuedMessage is sync;
		// no microtask boundary inside this loop.
		while (this.queuedMessageCount() > 0) {
			sdk.popLastQueuedMessage();
		}
		// Kick off re-enqueues synchronously so each `session.prompt` sync
		// prelude sees `isStreaming = true`. Collect promises; await later.
		const promises: Promise<void>[] = [];
		for (const entry of survivors) {
			const opts: Record<string, unknown> = { streamingBehavior: entry.behavior };
			if (entry.images && entry.images.length > 0) opts.images = entry.images;
			// SDK 16's `prompt()` resolves to `Promise<boolean>` (whether a turn
			// was queued vs. streamed); we only need to await completion, so drop it.
			promises.push(this.session.prompt(entry.text, opts as any).then(() => undefined));
		}
		this.shadowQueue = survivors;
		try {
			await Promise.all(promises);
			// Re-align text against the SDK's post-expansion store, by bucket.
			const bucketed = this.readQueuedTextsByBehavior();
			let stIdx = 0;
			let fuIdx = 0;
			for (const s of this.shadowQueue) {
				const bucket = s.behavior === "steer" ? bucketed.steering : bucketed.followUp;
				const i = s.behavior === "steer" ? stIdx++ : fuIdx++;
				const actual = bucket[i];
				if (typeof actual === "string") s.text = actual;
			}
		} catch (err) {
			log.warn(`re-enqueue after queue manipulation failed`, err);
			// Shadow may be ahead of reality; resync from SDK as best-effort.
			this.shadowQueue = this.resyncShadowFromSdk(this.shadowQueue);
		}
		this.emitQueueState();
	}

	private readLastQueuedText(behavior: "steer" | "followUp"): string | undefined {
		const sdk = this.session as unknown as {
			getQueuedMessages?: () => { steering: string[]; followUp: string[] };
		};
		if (typeof sdk.getQueuedMessages !== "function") return undefined;
		const q = sdk.getQueuedMessages();
		const bucket = behavior === "steer" ? q.steering : q.followUp;
		return bucket[bucket.length - 1];
	}

	private readQueuedTextsByBehavior(): { steering: string[]; followUp: string[] } {
		const sdk = this.session as unknown as {
			getQueuedMessages?: () => { steering: string[]; followUp: string[] };
		};
		if (typeof sdk.getQueuedMessages !== "function") return { steering: [], followUp: [] };
		return sdk.getQueuedMessages();
	}

	/**
	 * Last-ditch resync: if a queue manipulation lost track, rebuild the
	 * shadow from the SDK's text-only view. Re-uses caller-supplied ids
	 * positionally (steering bucket first, then followUp) so most bubbles
	 * keep their id; any extras get a fresh uuid.
	 */
	private resyncShadowFromSdk(
		previous: QueuedPromptWire[],
	): QueuedPromptWire[] {
		const q = this.readQueuedTextsByBehavior();
		const ordered: { text: string; behavior: "steer" | "followUp" }[] = [];
		for (const t of q.steering) ordered.push({ text: t, behavior: "steer" });
		for (const t of q.followUp) ordered.push({ text: t, behavior: "followUp" });
		const out: QueuedPromptWire[] = [];
		for (let i = 0; i < ordered.length; i++) {
			const prev = previous[i];
			const e = ordered[i]!;
			out.push({
				id: prev?.id ?? crypto.randomUUID(),
				text: e.text,
				behavior: e.behavior,
				queuedAt: prev?.queuedAt ?? Date.now(),
				...(prev?.images ? { images: prev.images } : {}),
			});
		}
		return out;
	}

	async abort(): Promise<void> {
		// The SDK's `abort()` cancels the in-flight turn but leaves the followUp
		// queue intact, which surprises users — they pressed Stop expecting
		// "stop everything". Mirror the user intent: drop the queue first, then
		// abort. The clearQueue() emits its own `queue_cleared` event so the
		// deck UI reconciles its `queuedPrompts` list.
		this.clearQueue();
		await this.session.abort();
	}

	async setName(name: string): Promise<void> {
		// The omp SDK signature is `setSessionName(name, source?: "auto" | "user")`
		// and defaults `source` to `"auto"`. Auto-titled names are silently
		// overwritten the next time the input-controller's title generator fires
		// (typically after the first agent turn completes), so a user-supplied
		// rename made before that point would disappear once `/start` finishes.
		// Pass `"user"` so the name takes permanent precedence per SDK contract.
		const s = this.session as unknown as {
			setSessionName?: (n: string, source?: "auto" | "user") => Promise<boolean> | boolean;
		};
		if (typeof s.setSessionName !== "function") {
			throw new Error("session.setSessionName is not available on this SDK build");
		}
		const accepted = await s.setSessionName(name, "user");
		if (accepted === false) {
			throw new Error(`session rejected name (empty after sanitization?): ${JSON.stringify(name)}`);
		}
	}

	// ─── Plan-mode bridge surface ────────────────────────────────────────

	async setPlanMode(enabled: boolean): Promise<void> {
		if (enabled) {
			await this.planBridge.enter();
		} else {
			await this.planBridge.exit("user_cancelled");
		}
	}

	getPlanModeContext(): PlanModeContextWire | undefined {
		return this.planBridge.getPlanModeContext();
	}

	getPendingPlanApproval(): PendingPlanApprovalWire | undefined {
		return this.planBridge.getPendingPlanApproval();
	}

	async respondToPlanApproval(
		proposalId: string,
		response: PlanApprovalResponse,
	): Promise<"settled" | "unknown"> {
		return this.planBridge.respond(proposalId, response);
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		this.listeners.clear();
		try {
			await this.session.dispose();
		} catch (err) {
			log.warn(`session.dispose threw`, err);
		}
		// Drop the session file from disk so it doesn't reappear after refresh.
		const file = this.sessionFile;
		if (file) {
			try {
				await this.sessionManager.dropSession(file);
			} catch (err) {
				log.warn(`dropSession threw`, err);
			}
		}
		this.onDisposeCallback();
	}
}
