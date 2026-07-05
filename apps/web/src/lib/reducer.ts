/**
 * Pure reducer over AgentSessionEvent passthroughs.
 *
 * Builds a coherent UI state from a stream of unknown-shape events. Treats
 * the SDK contract structurally — never imports SDK types — so the protocol
 * boundary stays narrow.
 */

import type { AgentSessionEventJson, ContextUsage, GoalModeContextWire, SessionSnapshot } from "@omp-deck/protocol";

import type {
	AssistantContentBlock,
	AssistantMsg,
	ChatMessage,
	ImageBlock,
	NoticeMsg,
	QueuedPrompt,
	SessionUi,
	SubagentRun,
	SubagentRunStatus,
	TextBlock,
	ToolCallStream,
	TodoPhase,
	UsageRollup,
} from "./types";

// ─── Public API ────────────────────────────────────────────────────────────

let ID_SEQ = 0;
const nextId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${++ID_SEQ}`;

const EMPTY_USAGE: UsageRollup = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: 0,
};

export function initSession(snapshot: SessionSnapshot): SessionUi {
	const state: SessionUi = {
		sessionId: snapshot.sessionId,
		cwd: snapshot.cwd,
		sessionFile: snapshot.sessionFile,
		sessionName: snapshot.sessionName,
		model: snapshot.model,
		thinkingLevel: snapshot.thinkingLevel,
		messages: [],
		toolCalls: {},
		todoPhases: normalizeTodoPhases(snapshot.todoPhases),
		status: snapshot.isStreaming ? "streaming" : "idle",
		usage: { ...EMPTY_USAGE },
		turnCount: 0,
		contextUsage: snapshot.contextUsage,
		queuedPrompts: hydrateQueuedPrompts(snapshot.queuedPrompts),
		goalMode: snapshot.goalMode,
	};
	for (const m of snapshot.messages) {
		ingestMessage(state, m);
	}
	return state;
}

export function applyEvent(state: SessionUi, event: AgentSessionEventJson): SessionUi {
	switch (event.type) {
		// ─── Agent lifecycle ───────────────────────────────────────────────
		case "agent_start":
			return { ...state, lastError: undefined };
		case "agent_end":
			return { ...state, status: "idle" };

		// ─── Turn lifecycle ────────────────────────────────────────────────
		case "turn_start":
			return {
				...state,
				status: "streaming",
				turnCount: state.turnCount + 1,
				lastError: undefined,
			};
		case "turn_end":
			return { ...state, status: "idle" };

		// Synthetic event the deck's bridge emits after the SDK's own turn-end
		// or compaction-complete, carrying the freshly-computed context-window
		// utilization. Lets the header indicator update without re-snapshotting.
		case "context_usage": {
			const usage = readContextUsage(event);
			if (!usage) return state;
			return { ...state, contextUsage: usage };
		}

		// Synthetic event the deck's bridge emits after `setModel` (and possibly
		// other session-header mutations) so the UI re-renders the new model
		// label without waiting for the next assistant turn.
		case "session_updated": {
			const snap = (event as { snapshot?: SessionSnapshot }).snapshot;
			if (!snap) return state;
			return {
				...state,
				model: snap.model,
				sessionName: snap.sessionName,
				thinkingLevel: snap.thinkingLevel,
			};
		}

	case "session_replaced": {
		const snap = (event as { snapshot?: SessionSnapshot }).snapshot;
		if (!snap) return state;
		return initSession(snap);
	}

		// ─── Messages ──────────────────────────────────────────────────────
		case "message_start": {
			const msg = (event as any).message;
			if (!msg) return state;
			const next = { ...state, messages: state.messages.slice(), toolCalls: { ...state.toolCalls } };
			ingestMessage(next, msg);
			return next;
		}
		case "message_update": {
			const msg = (event as any).message;
			if (!msg || msg.role !== "assistant") return state;
			return updateAssistantMessage(state, msg);
		}
		case "message_end": {
			const msg = (event as any).message;
			if (!msg) return state;
			return finalizeMessage(state, msg);
		}

		// ─── Tool execution ────────────────────────────────────────────────
		case "tool_execution_start": {
			const id = String((event as any).toolCallId ?? "");
			if (!id) return state;
			const stream: ToolCallStream = {
				id,
				name: String((event as any).toolName ?? "?"),
				args: (event as any).args as Record<string, unknown> | undefined,
				intent: (event as any).intent as string | undefined,
				status: "running",
				isError: false,
				startedAt: Date.now(),
			};
			return { ...state, toolCalls: { ...state.toolCalls, [id]: stream } };
		}
		case "tool_execution_update": {
			const id = String((event as any).toolCallId ?? "");
			const prev = state.toolCalls[id];
			if (!prev) return state;
			return {
				...state,
				toolCalls: {
					...state.toolCalls,
					[id]: { ...prev, partialResult: (event as any).partialResult },
				},
			};
		}
		case "tool_execution_end": {
			const id = String((event as any).toolCallId ?? "");
			const prev = state.toolCalls[id];
			const isError = Boolean((event as any).isError);
			const result = (event as any).result as unknown;
			const next: ToolCallStream = prev
				? {
						...prev,
						status: isError ? "error" : "complete",
						isError,
						result,
						endedAt: Date.now(),
					}
				: {
						id,
						name: String((event as any).toolName ?? "?"),
						args: undefined,
						status: isError ? "error" : "complete",
						isError,
						result,
						startedAt: Date.now(),
						endedAt: Date.now(),
					};
			return { ...state, toolCalls: { ...state.toolCalls, [id]: next } };
		}
		case "subagent_lifecycle":
			return applySubagentLifecycle(state, event as any);
		case "subagent_progress":
			return applySubagentProgress(state, event as any);

		// ─── Todos ─────────────────────────────────────────────────────────
		case "todo_reminder": {
			const todos = (event as { todos?: unknown }).todos;
			return { ...state, todoPhases: normalizeTodoPhases([todos]) };
		}
		// Synthetic event emitted by the deck bridge after every `todo`
		// `tool_execution_end`. Carries the canonical `TodoPhase[]` from
		// `session.getTodoPhases()` so the Inspector reflects in-turn changes
		// without waiting for the next SDK reminder tick (T-106).
		case "todo_phases_set": {
			const phases = (event as { todoPhases?: unknown }).todoPhases;
			return { ...state, todoPhases: normalizeTodoPhases(phases) };
		}
		case "todo_auto_clear":
			// The SDK drops completed tasks from its live cache a short while
			// after a turn settles. The deck should NOT follow that clear: with
			// a pinned todo panel open, an auto-clear would blank the panel out
			// from under the user. Keep the last rendered list until a real
			// `todo_reminder`/`todo_phases_set` explicitly replaces it.
			return state;

		// ─── Compaction / retry / TTSR ────────────────────────────────────
		case "auto_compaction_start":
			return {
				...state,
				status: "compacting",
				compaction: {
					reason: String((event as any).reason ?? ""),
					action: String((event as any).action ?? ""),
					startedAt: Date.now(),
					statusBefore: state.status,
				},
			};
		case "auto_compaction_end": {
			// Restore the status the session had *before* compaction started.
			// If the SDK was mid-turn (status "streaming"), it will continue
			// streaming after compaction.  If it was idle (manual compact or
			// post-turn compaction), we must return to idle — not streaming —
			// so the Stop/send buttons aren't stuck in "busy" state.
			const restoredStatus = state.compaction?.statusBefore ?? "idle";
			const next: SessionUi = { ...state, status: restoredStatus, compaction: undefined };
			const result = (event as any).result;
			if (result && typeof result === "object") {
				const summary =
					typeof (result as any).shortSummary === "string"
						? (result as any).shortSummary
						: typeof (result as any).summary === "string"
							? (result as any).summary
							: undefined;
				next.messages = [
					...state.messages,
					{
						id: nextId("compaction"),
						role: "compaction",
						reason: String((event as any).reason ?? state.compaction?.reason ?? ""),
						action: String((event as any).action ?? state.compaction?.action ?? ""),
						summary,
						timestamp: Date.now(),
					},
				];
			}
			return next;
		}
		case "auto_retry_start":
			return {
				...state,
				status: "retrying",
				retry: {
					attempt: Number((event as any).attempt ?? 0),
					maxAttempts: Number((event as any).maxAttempts ?? 0),
					errorMessage: String((event as any).errorMessage ?? ""),
				},
			};
		case "auto_retry_end":
			return {
				...state,
				status: "streaming",
				retry: undefined,
				lastError: (event as any).success ? undefined : ((event as any).finalError as string | undefined),
			};
		case "retry_fallback_applied":
			return pushNotice(state, {
				level: "warning",
				message: `Fallback applied: ${(event as any).from} → ${(event as any).to} (${(event as any).role})`,
				source: "retry",
			});
		case "retry_fallback_succeeded":
			return pushNotice(state, {
				level: "info",
				message: `Recovered on ${(event as any).model} (${(event as any).role})`,
				source: "retry",
			});
		case "ttsr_triggered":
			return {
				...state,
				ttsr: {
					rules: ((event as any).rules as Array<{ name?: string; description?: string }>) ?? [],
					at: Date.now(),
				},
				messages: [
					...state.messages,
					{
						id: nextId("ttsr"),
						role: "ttsr",
						rules: ((event as any).rules as any[]) ?? [],
						timestamp: Date.now(),
					},
				],
			};

		// ─── Misc surface ──────────────────────────────────────────────────
		case "notice":
			return pushNotice(state, {
				level: ((event as any).level as "info" | "warning" | "error") ?? "info",
				message: String((event as any).message ?? ""),
				source: (event as any).source as string | undefined,
			});
		case "thinking_level_changed":
			return {
				...state,
				thinkingLevel: (event as any).thinkingLevel as string | undefined,
			};
		case "goal_updated": {
			const goalPayload = event as unknown as { goal: GoalModeContextWire | null };
			return { ...state, goalMode: goalPayload.goal ?? undefined };
		}
		case "irc_message": {
			const msg = (event as any).message;
			if (!msg) return state;
			return {
				...state,
				messages: [
					...state.messages,
					{
						id: nextId("irc"),
						role: "irc",
						customType: msg.customType as string | undefined,
						content: extractText(msg.content),
						from: (msg.attribution as string | undefined) ?? undefined,
						timestamp: Date.now(),
					},
				],
			};
		}

		// ─── Prompt queue (synthetic events emitted by the bridge) ────────
		// `prompt_queued` fires when the user sends a prompt while the agent
		// is mid-turn — the SDK queues it and runs it once the current turn
		// ends. Surface it as a visible bubble so the draft does not appear
		// to vanish. `queue_cleared` fires when the SDK queue is dropped
		// (explicit `clear_queue` from the user, or `abort` which mirrors
		// stop-everything intent).
		case "prompt_queued": {
			const ev = event as {
				queuedId?: string;
				text?: string;
				images?: ImageBlock[];
				behavior?: "followUp" | "steer";
			};
			const entry: QueuedPrompt = {
				id: typeof ev.queuedId === "string" && ev.queuedId.length > 0
					? ev.queuedId
					: nextId("queued"),
				text: typeof ev.text === "string" ? ev.text : "",
				behavior: ev.behavior === "steer" ? "steer" : "followUp",
				queuedAt: Date.now(),
			};
			if (Array.isArray(ev.images) && ev.images.length > 0) entry.images = ev.images;
			return { ...state, queuedPrompts: [...state.queuedPrompts, entry] };
		}
		case "queue_cleared":
			return state.queuedPrompts.length === 0
				? state
				: { ...state, queuedPrompts: [] };

		// `queue_state` is the authoritative re-broadcast emitted after a
		// cancel / edit / drain so the client replaces its `queuedPrompts`
		// wholesale instead of patching deltas. Also fires on every
		// `prompt_queued` so the snapshot id-ordering stays canonical.
		case "queue_state": {
			const ev = event as { queue?: unknown };
			const next = hydrateQueuedPrompts(ev.queue);
			if (next.length === state.queuedPrompts.length && next.every((q, i) => {
				const prev = state.queuedPrompts[i];
				return prev && prev.id === q.id && prev.text === q.text;
			})) {
				return state;
			}
			return { ...state, queuedPrompts: next };
		}
	}
	return state;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function pushNotice(state: SessionUi, p: Omit<NoticeMsg, "id" | "role" | "timestamp">): SessionUi {
	return {
		...state,
		messages: [
			...state.messages,
			{
				id: nextId("notice"),
				role: "notice",
				timestamp: Date.now(),
				...p,
			},
		],
	};
}

function mapLifecycleStatus(status: unknown): SubagentRunStatus {
	switch (status) {
		case "started":
			return "running";
		case "completed":
			return "complete";
		case "failed":
			return "error";
		case "aborted":
			return "aborted";
		default:
			return "queued";
	}
}

function mapProgressStatus(status: unknown): SubagentRunStatus | undefined {
	switch (status) {
		case "pending":
			return "queued";
		case "running":
			return "running";
		case "completed":
			return "complete";
		case "failed":
			return "error";
		case "aborted":
			return "aborted";
		default:
			return undefined;
	}
}

function patchSubagent(
	state: SessionUi,
	parentToolCallId: unknown,
	subagentId: unknown,
	patcher: (existing: SubagentRun | undefined, parent: ToolCallStream) => SubagentRun,
): SessionUi {
	const parentId = typeof parentToolCallId === "string" ? parentToolCallId : "";
	const id = typeof subagentId === "string" ? subagentId : "";
	if (!parentId || !id) return state;
	const parent = state.toolCalls[parentId];
	if (!parent) return state;

	const nextRun = patcher(parent.subagents?.[id], parent);
	return {
		...state,
		toolCalls: {
			...state.toolCalls,
			[parentId]: {
				...parent,
				subagents: {
					...parent.subagents,
					[id]: nextRun,
				},
			},
		},
	};
}

function applySubagentLifecycle(state: SessionUi, event: any): SessionUi {
	return patchSubagent(state, event.parentToolCallId, event.subagentId, (existing, parent) => {
		const id = String(event.subagentId);
		const task = taskConfigFor(parent, id, event.index);
		const status = mapLifecycleStatus(event.status);
		const isTerminal = status === "complete" || status === "error" || status === "aborted";
		const now = Date.now();
		return {
			id,
			index: numberOr(event.index, existing?.index ?? task.index ?? 0),
			label: stringOr(event.label, existing?.label) ?? id,
			description: stringOr(event.description, existing?.description ?? task.description),
			agent: stringOr(event.agent, existing?.agent ?? task.agent),
			agentSource: stringOr(event.agentSource, existing?.agentSource),
			status,
			durationMs: numberOrUndefined(event.durationMs, existing?.durationMs),
			cost: numberOrUndefined(event.cost, existing?.cost),
			tokens: numberOrUndefined(event.tokens, existing?.tokens),
			requests: numberOrUndefined(event.requests, existing?.requests),
			currentTool: stringOr(event.currentTool, existing?.currentTool),
			lastIntent: stringOr(event.lastIntent, existing?.lastIntent),
			recentOutput: stringArrayOr(event.recentOutput, existing?.recentOutput),
			outputAvailable: isTerminal ? true : existing?.outputAvailable ?? false,
			sessionFile: stringOr(event.sessionFile, existing?.sessionFile),
			startedAt: existing?.startedAt ?? (status === "running" ? now : undefined),
			completedAt: isTerminal ? now : existing?.completedAt,
		};
	});
}

function applySubagentProgress(state: SessionUi, event: any): SessionUi {
	return patchSubagent(state, event.parentToolCallId, event.subagentId, (existing, parent) => {
		const id = String(event.subagentId);
		const task = taskConfigFor(parent, id, event.index);
		return {
			id,
			index: numberOr(event.index, existing?.index ?? task.index ?? 0),
			label: stringOr(event.label, existing?.label) ?? id,
			description: stringOr(event.description, existing?.description ?? task.description),
			agent: stringOr(event.agent, existing?.agent ?? task.agent),
			agentSource: stringOr(event.agentSource, existing?.agentSource),
			status: mapProgressStatus(event.status) ?? existing?.status ?? "running",
			durationMs: numberOrUndefined(event.durationMs, existing?.durationMs),
			cost: numberOrUndefined(event.cost, existing?.cost),
			tokens: numberOrUndefined(event.tokens, existing?.tokens),
			requests: numberOrUndefined(event.requests, existing?.requests),
			currentTool: stringOr(event.currentTool, existing?.currentTool),
			lastIntent: stringOr(event.lastIntent, existing?.lastIntent),
			recentOutput: stringArrayOr(event.recentOutput, existing?.recentOutput),
			outputAvailable: existing?.outputAvailable ?? false,
			sessionFile: stringOr(event.sessionFile, existing?.sessionFile),
			startedAt: existing?.startedAt ?? Date.now(),
			completedAt: existing?.completedAt,
		};
	});
}

function taskConfigFor(parent: ToolCallStream, subagentId: string, eventIndex: unknown) {
	const tasks = Array.isArray(parent.args?.tasks) ? (parent.args.tasks as any[]) : [];
	const index = typeof eventIndex === "number"
		? eventIndex
		: tasks.findIndex((task) => task?.id === subagentId);
	const task = index >= 0 ? tasks[index] : tasks.find((candidate) => candidate?.id === subagentId);
	return {
		index: index >= 0 ? index : undefined,
		description: typeof task?.description === "string" ? task.description : undefined,
		agent: typeof parent.args?.agent === "string" ? parent.args.agent : undefined,
	};
}

function readContextUsage(event: AgentSessionEventJson): ContextUsage | undefined {
	if (!event || typeof event !== "object" || !("contextUsage" in event)) return undefined;
	const usage = event.contextUsage;
	if (!usage || typeof usage !== "object") return undefined;
	if (!("contextWindow" in usage) || typeof usage.contextWindow !== "number") return undefined;
	return usage as ContextUsage;
}

function stringOr(value: unknown, fallback: string | undefined): string | undefined {
	return typeof value === "string" ? value : fallback;
}

function numberOr(value: unknown, fallback: number): number {
	return typeof value === "number" ? value : fallback;
}

function numberOrUndefined(value: unknown, fallback: number | undefined): number | undefined {
	return typeof value === "number" ? value : fallback;
}

function stringArrayOr(value: unknown, fallback: string[] | undefined): string[] | undefined {
	return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : fallback;
}

function ingestMessage(state: SessionUi, msg: any): void {
	if (!msg || typeof msg !== "object") return;
	switch (msg.role) {
		case "user": {
			const text = extractText(msg.content);
			const synthetic = Boolean(msg.synthetic);
			const images = extractImages(msg.content);
			const ts = typeof msg.timestamp === "number" ? msg.timestamp : Date.now();

			// Dedup against the optimistic user message added by sendPrompt.
			// If the last message is a user message with identical content
			// within a 5-second window, replace it with the server's version
			// (authoritative id / timestamp) instead of adding a duplicate.
			const DEDUP_WINDOW_MS = 5000;
			const lastMsg = state.messages.length > 0 ? state.messages[state.messages.length - 1] : null;
			const lastIsOpt =
				lastMsg?.role === "user" &&
				!lastMsg.synthetic &&
				lastMsg.timestamp != null &&
				ts - lastMsg.timestamp < DEDUP_WINDOW_MS &&
				lastMsg.text === text &&
				_optImagesEq(lastMsg.images, images);
			if (lastIsOpt) {
				// Replace the optimistic placeholder with the real message id
				// so tool-call pairing doesn't reference a ghost id.
				state.messages[state.messages.length - 1] = {
					id: nextId("user"),
					role: "user",
					text,
					images,
					timestamp: ts,
					synthetic,
				};
			} else {
				state.messages.push({
					id: nextId("user"),
					role: "user",
					text,
					images,
					timestamp: ts,
					synthetic,
				});
			}
			// If this real user message corresponds to a previously-queued prompt
			// (same text, FIFO), drop the queued bubble so we don't render the
			// same message twice. Synthetic round-trips (slash echoes) don't
			// originate from the composer, so they never match the queue.
			if (!synthetic && state.queuedPrompts.length > 0 && text.length > 0) {
				const idx = state.queuedPrompts.findIndex((q) => q.text === text);
				if (idx >= 0) {
					state.queuedPrompts = [
						...state.queuedPrompts.slice(0, idx),
						...state.queuedPrompts.slice(idx + 1),
					];
				}
			}
			return;
		}
		case "assistant": {
			state.messages.push({
				id: nextId("asst"),
				role: "assistant",
				blocks: extractAssistantBlocks(msg.content),
				model: typeof msg.model === "string" ? msg.model : undefined,
				provider: typeof msg.provider === "string" ? msg.provider : undefined,
				usage: extractUsage(msg.usage),
				stopReason: typeof msg.stopReason === "string" ? msg.stopReason : undefined,
				isStreaming: false,
				errorMessage: typeof msg.errorMessage === "string" ? msg.errorMessage : undefined,
				timestamp: typeof msg.timestamp === "number" ? msg.timestamp : undefined,
				durationMs: typeof msg.duration === "number" ? msg.duration : undefined,
				ttft: typeof msg.ttft === "number" ? msg.ttft : undefined,
			});
			if (msg.usage) {
				rollupUsage(state, msg.usage);
			}
			return;
		}
		case "toolResult": {
			// Don't add as a top-level message — fold into the toolCalls map so
			// the chat renders the tool's lifecycle as a single inline card.
			const id = String(msg.toolCallId ?? "");
			if (!id) return;
			const content = Array.isArray(msg.content)
				? (msg.content
						.map((c: any) => normalizeTextOrImage(c))
						.filter(Boolean) as Array<TextBlock | ImageBlock>)
				: [];
			const prev = state.toolCalls[id];
			state.toolCalls[id] = prev
				? {
						...prev,
						resultContent: content,
						isError: Boolean(msg.isError ?? prev.isError),
						status: msg.isError ? "error" : prev.status === "running" ? "complete" : prev.status,
						endedAt: prev.endedAt ?? Date.now(),
					}
				: {
						id,
						name: String(msg.toolName ?? "?"),
						args: undefined,
						resultContent: content,
						status: msg.isError ? "error" : "complete",
						isError: Boolean(msg.isError),
						startedAt: Date.now(),
						endedAt: Date.now(),
					};
			return;
		}
		default:
			return;
	}
}

function updateAssistantMessage(state: SessionUi, msg: any): SessionUi {
	const messages = state.messages.slice();
	// Walk backward to find the last assistant message.
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i];
		if (m && m.role === "assistant") {
			const updated: AssistantMsg = {
				...m,
				blocks: extractAssistantBlocks(msg.content),
				isStreaming: true,
				model: typeof msg.model === "string" ? msg.model : m.model,
				provider: typeof msg.provider === "string" ? msg.provider : m.provider,
				// Set start timestamp on first streaming update if not already set
				timestamp: m.timestamp ?? (typeof msg.timestamp === "number" ? msg.timestamp : Date.now()),
			};
			messages[i] = updated;
			return { ...state, messages };
		}
	}
	// Fallback: synthesize.
	messages.push({
		id: nextId("asst"),
		role: "assistant",
		blocks: extractAssistantBlocks(msg.content),
		isStreaming: true,
		model: typeof msg.model === "string" ? msg.model : undefined,
		provider: typeof msg.provider === "string" ? msg.provider : undefined,
		timestamp: typeof msg.timestamp === "number" ? msg.timestamp : Date.now(),
	});
	return { ...state, messages };
}

function finalizeMessage(state: SessionUi, msg: any): SessionUi {
	if (!msg || typeof msg !== "object") return state;
	if (msg.role !== "assistant") return state;
	const messages = state.messages.slice();
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i];
		if (m && m.role === "assistant") {
			// Resolve timestamp: prefer server-provided, fall back to the one
			// captured during streaming updates, or stamp now as last resort.
			const resolvedTimestamp = typeof msg.timestamp === "number"
				? msg.timestamp
				: m.timestamp ?? Date.now();
			// Resolve duration: prefer server-provided, fall back to existing,
			// or compute client-side from timestamp delta.
			const resolvedDuration = typeof msg.duration === "number"
				? msg.duration
				: m.durationMs ?? (resolvedTimestamp ? Date.now() - resolvedTimestamp : undefined);
			messages[i] = {
				...m,
				blocks: extractAssistantBlocks(msg.content),
				isStreaming: false,
				model: typeof msg.model === "string" ? msg.model : m.model,
				provider: typeof msg.provider === "string" ? msg.provider : m.provider,
				usage: extractUsage(msg.usage) ?? m.usage,
				stopReason: typeof msg.stopReason === "string" ? msg.stopReason : m.stopReason,
				errorMessage: typeof msg.errorMessage === "string" ? msg.errorMessage : m.errorMessage,
				timestamp: resolvedTimestamp,
				durationMs: resolvedDuration,
				ttft: typeof msg.ttft === "number" ? msg.ttft : m.ttft,
			};
			const next = { ...state, messages };
			if (msg.usage) {
				rollupUsage(next, msg.usage);
			}
			return next;
		}
	}
	return state;
}

function extractAssistantBlocks(content: unknown): AssistantContentBlock[] {
	if (!Array.isArray(content)) return [];
	const out: AssistantContentBlock[] = [];
	for (const c of content) {
		if (!c || typeof c !== "object") continue;
		const type = (c as any).type;
		if (type === "text" && typeof (c as any).text === "string") {
			out.push({ type: "text", text: (c as any).text });
		} else if (type === "thinking" && typeof (c as any).thinking === "string") {
			out.push({ type: "thinking", thinking: (c as any).thinking });
		} else if (type === "redactedThinking") {
			out.push({ type: "redactedThinking", data: String((c as any).data ?? "") });
		} else if (type === "toolCall") {
			out.push({
				type: "toolCall",
				id: String((c as any).id ?? ""),
				name: String((c as any).name ?? "?"),
				arguments: ((c as any).arguments ?? {}) as Record<string, unknown>,
				intent: (c as any).intent as string | undefined,
			});
		}
	}
	return out;
}

function normalizeTextOrImage(c: any): TextBlock | ImageBlock | null {
	if (!c || typeof c !== "object") return null;
	if (c.type === "text" && typeof c.text === "string") return { type: "text", text: c.text };
	if (c.type === "image" && typeof c.data === "string")
		return { type: "image", data: c.data, mimeType: String(c.mimeType ?? "image/png") };
	return null;
}

function extractText(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		const parts: string[] = [];
		for (const c of content) {
			if (c && typeof c === "object" && (c as any).type === "text") {
				parts.push(String((c as any).text ?? ""));
			}
		}
		return parts.join("");
	}
	return "";
}

function extractImages(content: unknown): ImageBlock[] | undefined {
	if (!Array.isArray(content)) return undefined;
	const out: ImageBlock[] = [];
	for (const c of content) {
		const norm = normalizeTextOrImage(c);
		if (norm && norm.type === "image") out.push(norm);
	}
	return out.length > 0 ? out : undefined;
}

function extractUsage(u: unknown): UsageRollup | undefined {
	if (!u || typeof u !== "object") return undefined;
	const r = u as Record<string, unknown>;
	const cost =
		r.cost && typeof r.cost === "object"
			? Number((r.cost as Record<string, unknown>).total ?? 0)
			: 0;
	return {
		input: Number(r.input ?? 0),
		output: Number(r.output ?? 0),
		cacheRead: Number(r.cacheRead ?? 0),
		cacheWrite: Number(r.cacheWrite ?? 0),
		totalTokens: Number(r.totalTokens ?? 0),
		cost: Number.isFinite(cost) ? cost : 0,
		reasoningTokens: typeof r.reasoningTokens === "number" ? r.reasoningTokens : undefined,
	};
}

function rollupUsage(state: SessionUi, raw: unknown): void {
	const u = extractUsage(raw);
	if (!u) return;
	state.usage = {
		input: state.usage.input + u.input,
		output: state.usage.output + u.output,
		cacheRead: state.usage.cacheRead + u.cacheRead,
		cacheWrite: state.usage.cacheWrite + u.cacheWrite,
		totalTokens: state.usage.totalTokens + u.totalTokens,
		cost: state.usage.cost + u.cost,
		reasoningTokens:
			state.usage.reasoningTokens !== undefined || u.reasoningTokens !== undefined
				? (state.usage.reasoningTokens ?? 0) + (u.reasoningTokens ?? 0)
				: undefined,
	};
}

function normalizeTodoPhases(raw: unknown): TodoPhase[] {
	if (!Array.isArray(raw)) return [];
	const out: TodoPhase[] = [];
	for (const p of raw) {
		if (!p) continue;
		// Two shapes seen in practice:
		//   - TodoPhase: { id, name, tasks: TodoItem[] }
		//   - bare TodoItem[]: array passed directly via todo_reminder.todos
		if (Array.isArray(p)) {
			out.push({ tasks: (p as any[]).map(coerceTask) });
		} else if (typeof p === "object") {
			const phase = p as Record<string, unknown>;
			const tasks = Array.isArray(phase.tasks) ? (phase.tasks as any[]).map(coerceTask) : [];
			out.push({
				id: typeof phase.id === "string" ? phase.id : undefined,
				name: typeof phase.name === "string" ? phase.name : undefined,
				tasks,
			});
		}
	}
	return out;
}

function coerceTask(t: any) {
	return {
		id: typeof t?.id === "string" ? t.id : undefined,
		content: String(t?.content ?? ""),
		status: String(t?.status ?? "pending"),
		notes: Array.isArray(t?.notes) ? (t.notes as unknown[]).map(String) : undefined,
	};
}
/**
 * Normalize the wire shape (`QueuedPromptWire[]`) into the UI's
 * `QueuedPrompt[]`. Tolerates missing optional fields and skips anything
 * that doesn't carry at least an id+text — the bridge is canonical but the
 * reducer guards against malformed events from older server builds.
 */
function hydrateQueuedPrompts(raw: unknown): QueuedPrompt[] {
	if (!Array.isArray(raw)) return [];
	const out: QueuedPrompt[] = [];
	for (const r of raw) {
		if (!r || typeof r !== "object") continue;
		const w = r as {
			id?: unknown;
			text?: unknown;
			images?: unknown;
			behavior?: unknown;
			queuedAt?: unknown;
		};
		if (typeof w.id !== "string" || w.id.length === 0) continue;
		const entry: QueuedPrompt = {
			id: w.id,
			text: typeof w.text === "string" ? w.text : "",
			behavior: w.behavior === "steer" ? "steer" : "followUp",
			queuedAt: typeof w.queuedAt === "number" ? w.queuedAt : Date.now(),
		};
		if (Array.isArray(w.images) && w.images.length > 0) {
			entry.images = w.images as ImageBlock[];
		}
		out.push(entry);
	}
	return out;
}

/** Shallow-equal comparison for image arrays used in optimistic dedup. */
function _optImagesEq(a: ImageBlock[] | undefined, b: ImageBlock[] | undefined): boolean {
	if (a === b) return true;
	if (!a || !b) return !a && !b;
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		const ai = a[i]!;
		const bi = b[i]!;
		if (ai.data !== bi.data || ai.mimeType !== bi.mimeType) return false;
	}
	return true;
}
