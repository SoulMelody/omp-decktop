import { useState, useMemo } from "react";
import type { ToolRendererProps } from "./ToolCallCard";
import { extractResultText } from "./shared";
import { MaybeJsonBlock } from "@/lib/code";
import { formatCost, formatDurationMs, truncate, cn } from "@/lib/utils";
import { AgentOutputPanel } from "@/components/AgentOutputPanel";
import type { SubagentRun } from "@/lib/types";

const STATUS_TONE: Record<string, string> = {
	complete: "text-success",
	error: "text-danger",
	running: "text-accent",
	queued: "text-ink-4",
	aborted: "text-ink-4",
};

const STATUS_LABEL: Record<string, string> = {
	queued: "queued",
	running: "running",
	complete: "complete",
	error: "failed",
	aborted: "aborted",
};

export function TaskTool({ args, stream, sessionId }: ToolRendererProps) {
	const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
	const agent = String((args.agent as string | undefined) ?? "");
	const tasks = Array.isArray(args.tasks) ? (args.tasks as Array<Record<string, unknown>>) : [];

	const result = stream?.result ?? stream?.partialResult;
	const runs = useMemo(() => normalizeTaskRuns(tasks, stream?.subagents, result), [tasks, stream?.subagents, result]);
	const selectedRun = selectedAgent ? runs[selectedAgent] : null;

	const summary = useMemo(() => {
		const counts: Record<string, number> = {};
		for (const r of Object.values(runs)) {
			const s = r.status;
			counts[s] = (counts[s] ?? 0) + 1;
		}
		const parts: string[] = [];
		if (counts.running) parts.push(`${counts.running} running`);
		if (counts.complete) parts.push(`${counts.complete} complete`);
		if (counts.queued) parts.push(`${counts.queued} queued`);
		if (counts.error) parts.push(`${counts.error} failed`);
		if (counts.aborted) parts.push(`${counts.aborted} aborted`);
		return parts.join(" \u00b7 ") || null;
	}, [runs]);

	return (
		<>
			<div className="space-y-2">
				<div className="font-mono text-2xs">
					<span className="text-accent">{agent || "task"}</span>
					<span className="text-ink-3">
						{" \u00b7 "}{tasks.length} subagent{tasks.length === 1 ? "" : "s"}
						{summary ? <span className="text-ink-4"> \u00b7 {summary}</span> : null}
					</span>
				</div>
				<div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
					{Object.values(runs).map((run) => {
						const isClickable =
							sessionId &&
							run.outputAvailable &&
							["complete", "error", "aborted"].includes(run.status);
						const lastOut: string | null =
							run.recentOutput && run.recentOutput.length > 0
								? run.recentOutput[run.recentOutput.length - 1] ?? null
								: null;
						return (
							<div key={run.id} className="border-l border-line pl-2">
								<div className="flex items-baseline justify-between gap-2 font-mono text-2xs">
									{isClickable ? (
										<button
											type="button"
											onClick={() => setSelectedAgent(run.id)}
											className="truncate font-medium text-accent hover:underline text-left cursor-pointer"
										>
											{run.id}
										</button>
									) : (
										<span className="truncate font-medium text-ink">{run.id}</span>
									)}
									<span className={cn("shrink-0", STATUS_TONE[run.status] ?? "text-ink-4")}>
										{STATUS_LABEL[run.status] ?? run.status}
									</span>
								</div>
								{run.description ? (
									<div className="mt-0.5 text-2xs text-ink-3">{truncate(run.description, 100)}</div>
								) : null}
								<div className="mt-0.5 flex gap-2 font-mono text-2xs text-ink-4">
									{run.durationMs ? <span>{formatDurationMs(run.durationMs)}</span> : null}
									{run.cost != null ? <span>{formatCost(run.cost)}</span> : null}
								</div>
								{run.status === "running" && (run.currentTool || run.lastIntent || lastOut) ? (
									<div className="mt-0.5 space-y-0.5">
										{run.currentTool ? (
											<div className="text-2xs text-ink-4">
												<span className="text-ink-3">tool </span>
												{truncate(run.currentTool, 60)}
											</div>
										) : null}
										{run.lastIntent ? (
											<div className="text-2xs text-ink-4">
												<span className="text-ink-3">intent </span>
												{truncate(run.lastIntent, 80)}
											</div>
										) : null}
										{lastOut ? (
											<div className="text-2xs text-ink-4">{truncate(lastOut, 160)}</div>
										) : null}
									</div>
								) : null}
							</div>
						);
					})}
				</div>
				{result ? (
					<details>
						<summary className="cursor-pointer font-mono text-2xs uppercase tracking-meta text-ink-3 hover:text-ink">
							findings
						</summary>
						<div className="mt-1">
							<MaybeJsonBlock text={extractResultText(result)} />
						</div>
					</details>
				) : null}
			</div>
			{selectedAgent && sessionId && (
				<AgentOutputPanel
					sessionId={sessionId}
					agentId={selectedAgent}
					open={!!selectedAgent}
					onClose={() => setSelectedAgent(null)}
					status={selectedRun?.status}
					description={selectedRun?.description}
					durationMs={selectedRun?.durationMs}
					cost={selectedRun?.cost}
				/>
			)}
		</>
	);
}

interface FallbackRun {
	status?: string;
	durationMs?: number;
	cost?: number;
}

function normalizeTaskRuns(
	tasks: Array<Record<string, unknown>>,
	live?: Record<string, SubagentRun>,
	result?: unknown,
): Record<string, SubagentRun> {
	const fallback = extractFallbackRuns(result);
	const merged: Record<string, SubagentRun> = {};

	for (let i = 0; i < tasks.length; i++) {
		const t = tasks[i];
		const id = String(t?.id ?? `task-${i}`);
		const liveRun = live?.[id];

		if (liveRun) {
			merged[id] = { ...liveRun };
		} else {
			const fb = fallback[id];
			merged[id] = {
				id,
				index: i,
				label: String(t?.id ?? id),
				description: String(t?.description ?? ""),
				agent: String(t?.agent ?? ""),
				status: (fb?.status as SubagentRun["status"]) ?? "queued",
				durationMs: fb?.durationMs,
				cost: fb?.cost,
				outputAvailable: fb?.status === "complete" || fb?.status === "error",
			};
		}
	}

	if (live) {
		for (const [id, run] of Object.entries(live)) {
			if (!merged[id]) {
				merged[id] = { ...run };
			}
		}
	}

	return merged;
}

function extractFallbackRuns(
	result: unknown,
): Record<string, FallbackRun> {
	const map: Record<string, FallbackRun> = {};
	if (!result || typeof result !== "object") return map;
	const r = result as Record<string, unknown>;
	const subs = (r.subagents ?? r.tasks ?? r.findings) as unknown;
	if (Array.isArray(subs)) {
		for (const s of subs) {
			if (!s || typeof s !== "object") continue;
			const obj = s as Record<string, unknown>;
			const id = String(obj.id ?? "");
			if (!id) continue;
			const cost =
				typeof obj.cost === "number"
					? (obj.cost as number)
					: typeof (obj.cost as Record<string, unknown> | undefined)?.total === "number"
						? ((obj.cost as Record<string, unknown>).total as number)
						: undefined;
			map[id] = {
				status: typeof obj.status === "string" ? obj.status : undefined,
				durationMs: typeof obj.durationMs === "number" ? (obj.durationMs as number) : undefined,
				cost,
			};
		}
	}
	return map;
}