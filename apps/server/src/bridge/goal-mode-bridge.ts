/**
 * Per-session bridge for omp goal mode.
 *
 * Goal mode lets the user launch an autonomous goal with a token budget.
 * While active, the session gains a "goal" tool and the bridge tracks
 * budget / status. Goals are paused on Plan Mode enter and on reconnect;
 * they never auto-continue — the user must explicitly resume.
 */
import type { GoalModeContextWire, ServerFrame } from "@omp-deck/protocol";

import { logger } from "../log.ts";

const log = logger("bridge:goal-mode");

const GOAL_TOOL = "goal";

export type GoalAction =
	| { action: "create"; objective: string; tokenBudget?: number }
	| { action: "pause" }
	| { action: "resume" }
	| { action: "cancel" }
	| { action: "set_budget"; tokenBudget?: number };

/** Minimal AgentSession surface the bridge needs. */
export interface GoalModeSessionSurface {
	getActiveToolNames(): string[];
	setActiveToolsByName(toolNames: string[]): Promise<void>;
	readonly isStreaming: boolean;
	abort(): Promise<void>;
	prompt(text: string): Promise<boolean>;
}

export type GoalModeFrame = Extract<ServerFrame, { type: "goal_updated" }>;

type FrameListener = (frame: GoalModeFrame) => void;

export interface GoalModeBridgeArgs {
	sessionId: string;
	session: GoalModeSessionSurface;
}

export class GoalModeBridge {
	private readonly sessionId: string;
	private readonly session: GoalModeSessionSurface;
	private goal: GoalModeContextWire | null = null;
	private startTimestamp: number | null = null;
	private listeners = new Set<FrameListener>();
	private disposed = false;

	constructor(args: GoalModeBridgeArgs) {
		this.sessionId = args.sessionId;
		this.session = args.session;
	}

	subscribe(listener: FrameListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	getContext(): GoalModeContextWire | undefined {
		if (!this.goal) return undefined;
		return { ...this.goal, timeUsedSeconds: this.goal.timeUsedSeconds + this.elapsedSeconds() };
	}

	/**
	 * Restore goal state from a snapshot (reconnect). Active goals become
	 * paused — they never auto-continue after reconnect; user must resume.
	 */
	restore(state: GoalModeContextWire): void {
		if (state.status === "active") {
			// Active goals become paused on reconnect — user must explicitly resume.
			this.goal = { ...state, status: "paused" };
		} else {
			this.goal = { ...state };
		}
		this.startTimestamp = null;
	}

	async act(action: GoalAction): Promise<void> {
		this.ensureNotDisposed();

		switch (action.action) {
			case "create":
				await this.handleCreate(action.objective, action.tokenBudget);
				break;
			case "pause":
				await this.handlePause();
				break;
			case "resume":
				await this.handleResume();
				break;
			case "cancel":
				await this.handleCancel();
				break;
			case "set_budget":
				await this.handleSetBudget(action.tokenBudget);
				break;
		}
	}

	async pauseForPlanMode(): Promise<void> {
		if (!this.goal || this.goal.status !== "active") return;
		await this.handlePause();
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.listeners.clear();
	}

	// ─── Private ──────────────────────────────────────────────────────────

	private elapsedSeconds(): number {
		if (!this.startTimestamp) return 0;
		return Math.round((Date.now() - this.startTimestamp) / 1000);
	}

	private ensureNotDisposed(): void {
		if (this.disposed) throw new Error("GoalModeBridge disposed");
	}

	private broadcast(): void {
		const ctx = this.getContext() ?? null;
		const frame: GoalModeFrame = {
			type: "goal_updated",
			sessionId: this.sessionId,
			goal: ctx,
		};
		for (const listener of this.listeners) {
			try {
				listener(frame);
			} catch (err) {
				log.warn(`listener failed`, err);
			}
		}
	}

	private async handleCreate(objective: string, tokenBudget?: number): Promise<void> {
		const trimmed = objective.trim();
		if (!trimmed) throw new Error("objective required");

		this.goal = {
			enabled: true,
			objective: trimmed,
			status: "active",
			tokenBudget,
			tokensUsed: 0,
			timeUsedSeconds: 0,
		};
		this.startTimestamp = Date.now();

		await this.ensureGoalTool(true);
		this.broadcast();
	}

	private async handlePause(): Promise<void> {
		if (!this.goal) return;
		this.goal = { ...this.goal, status: "paused", timeUsedSeconds: this.goal.timeUsedSeconds + this.elapsedSeconds() };
		this.startTimestamp = null;
		await this.ensureGoalTool(false);
		this.broadcast();
	}

	private async handleResume(): Promise<void> {
		if (!this.goal || this.goal.status !== "paused") {
			throw new Error("no paused goal to resume");
		}
		this.goal = { ...this.goal, status: "active" };
		this.startTimestamp = Date.now();
		await this.ensureGoalTool(true);
		this.broadcast();
	}

	private async handleCancel(): Promise<void> {
		if (!this.goal) return;
		if (this.session.isStreaming) {
			await this.session.abort();
		}
		await this.ensureGoalTool(false);
		this.goal = null;
		this.startTimestamp = null;
		this.broadcast();
	}

	private async handleSetBudget(tokenBudget?: number): Promise<void> {
		if (!this.goal) throw new Error("no active goal");
		this.goal = { ...this.goal, tokenBudget };
		this.broadcast();
	}

	private async ensureGoalTool(add: boolean): Promise<void> {
		const tools = this.session.getActiveToolNames();
		const hasGoal = tools.includes(GOAL_TOOL);

		if (add && !hasGoal) {
			await this.session.setActiveToolsByName([...tools, GOAL_TOOL]);
		} else if (!add && hasGoal) {
			await this.session.setActiveToolsByName(tools.filter((t) => t !== GOAL_TOOL));
		}
	}
}