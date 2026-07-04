import { useEffect, useState } from "react";
import { RotateCcw, Save, Trash2 } from "lucide-react";
import type { ModelInfo, ModelRoleEntry, ModelRolesResponse } from "@omp-deck/protocol";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { settingsApi } from "@/lib/settings-api";
import { cn } from "@/lib/utils";

export function ModelRolesSection() {
	const [roles, setRoles] = useState<ModelRolesResponse | null>(null);
	const [draft, setDraft] = useState<Map<string, DraftRoleValue>>(new Map());
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | undefined>();
	const [saved, setSaved] = useState(false);
	const [saving, setSaving] = useState(false);

	async function refresh(): Promise<void> {
		setLoading(true);
		setError(undefined);
		try {
			const resp = await settingsApi.modelRoles.list();
			setRoles(resp);
			const m = new Map<string, DraftRoleValue>();
			for (const r of resp.roles) {
				m.set(r.key, parseModelRoleValue(r.modelId ?? null));
			}
			setDraft(m);
		} catch (e) {
			setError(String(e));
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => { void refresh(); }, []);

	const isDirty = (() => {
		if (!roles) return false;
		for (const r of roles.roles) {
			const current = draft.get(r.key) ?? EMPTY_DRAFT_ROLE_VALUE;
			if (formatModelRoleValue(current.modelId, current.thinkingLevel) !== (r.modelId ?? null)) return true;
		}
		return false;
	})();

	async function handleSave(): Promise<void> {
		setSaving(true);
		setError(undefined);
		setSaved(false);
		try {
			const updates: Record<string, string | null> = {};
			for (const [key, val] of draft) {
				updates[key] = formatModelRoleValue(val.modelId, val.thinkingLevel);
			}
			await settingsApi.modelRoles.save(updates);
			setSaved(true);
			setTimeout(() => setSaved(false), 2000);
			await refresh();
		} catch (e) {
			setError(String(e));
		} finally {
			setSaving(false);
		}
	}

	async function handleClear(role: string): Promise<void> {
		setError(undefined);
		try {
			await settingsApi.modelRoles.clear(role);
			await refresh();
		} catch (e) {
			setError(String(e));
		}
	}

	async function handleResetAll(): Promise<void> {
		if (!confirm("Reset all model roles to SDK defaults?")) return;
		setError(undefined);
		try {
			await settingsApi.modelRoles.resetAll();
			await refresh();
		} catch (e) {
			setError(String(e));
		}
	}

	const modelGroups = (() => {
		if (!roles?.models?.length) return [];
		const byProvider = new Map<string, ModelInfo[]>();
		for (const m of roles.models.filter((m) => m.isAvailable)) {
			const list = byProvider.get(m.provider) ?? [];
			list.push(m);
			byProvider.set(m.provider, list);
		}
		return Array.from(byProvider.entries()).sort((a, b) => a[0].localeCompare(b[0]));
	})();

	const currentRoles = roles?.roles ?? [];

	return (
		<div className="mx-auto max-w-6xl space-y-4">
			<div>
				<h1 className="text-xl font-semibold tracking-tight">Model Roles</h1>
				<p className="mt-1 max-w-3xl text-sm text-ink-3">
					Assign specific models to roles. Unset roles inherit from Default.
					{roles?.configPath ? (
						<span className="ml-2 font-mono text-2xs text-ink-4" title={roles.configPath}>
							{roles.configPath.split(/[\\/]/).slice(-2).join("/")}
						</span>
					) : null}
				</p>
			</div>

			{error ? (
				<div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">
					{error}
				</div>
			) : null}
			{saved ? (
				<div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 font-mono text-xs text-success">
					Saved.
				</div>
			) : null}
			{isDirty ? (
				<div className="rounded-md border border-warn/30 bg-warn/10 px-3 py-2 font-mono text-xs text-warn">
					Unsaved changes.
				</div>
			) : null}

			{loading ? (
				<div className="text-sm text-ink-3">Loading...</div>
			) : (
				<>
					<div className="flex flex-wrap gap-2">
						<Button size="sm" onClick={() => void handleSave()} disabled={saving || !isDirty}>
							<Save className="h-3.5 w-3.5" />
							Save
						</Button>
						<Button variant="outline" size="sm" onClick={() => void handleResetAll()}>
							<RotateCcw className="h-3.5 w-3.5" />
							Reset all
						</Button>
						<Button variant="outline" size="sm" onClick={() => void refresh()}>
							<RotateCcw className="h-3.5 w-3.5" />
							Refresh
						</Button>
					</div>

					<div className="overflow-hidden rounded-md border border-line">
						<table className="w-full text-sm">
							<thead className="bg-paper-2">
								<tr>
									<th className="px-3 py-2 text-left font-mono text-2xs uppercase tracking-meta text-ink-3">
										Role
									</th>
									<th className="px-3 py-2 text-left font-mono text-2xs uppercase tracking-meta text-ink-3">
										Description
									</th>
									<th className="px-3 py-2 text-left font-mono text-2xs uppercase tracking-meta text-ink-3">
										Model
									</th>
									<th className="px-3 py-2 text-left font-mono text-2xs uppercase tracking-meta text-ink-3">
										Thinking
									</th>
									<th className="px-3 py-2 text-right font-mono text-2xs uppercase tracking-meta text-ink-3" />
								</tr>
							</thead>
							<tbody>
								{currentRoles.map((r) => {
									const current = draft.get(r.key) ?? EMPTY_DRAFT_ROLE_VALUE;
									const isDefault = r.key === "default";
									const placeholder = isDefault ? "SDK default" : "Inherits Default";
									return (
										<tr
											key={r.key}
											className={cn(
												"border-t border-line",
												currentRoles.indexOf(r) % 2 === 1 && "bg-paper-2/30",
											)}
										>
											<td className="px-3 py-2">
												<div className="flex items-center gap-2">
													<Badge tone={isDefault ? "accent" : "muted"}>
														{r.label}
													</Badge>
													<span className="font-mono text-2xs text-ink-4">{r.key}</span>
												</div>
											</td>
											<td className="px-3 py-2 text-xs text-ink-3">{r.description}</td>
										<td className="px-3 py-2">
											<select
												value={current.modelId}
												onChange={(e) => {
													const modelId = e.target.value;
													const next = new Map(draft);
													next.set(r.key, {
														modelId,
														thinkingLevel: modelId ? current.thinkingLevel : "",
													});
													setDraft(next);
												}}
												className="field h-8 w-full max-w-[320px] px-2 font-mono text-xs"
											>
												<option value="">{placeholder}</option>
												{modelGroups.map(([provider, models]) => (
													<optgroup key={provider} label={models[0]?.providerName ?? provider}>
														{models.map((m) => (
															<option
																key={`${m.provider}/${m.id}`}
																value={`${m.provider}/${m.id}`}
															>
																{m.label} ({m.id})
																{m.contextWindow ? ` · ${formatCtx(m.contextWindow)}` : ""}
															</option>
														))}
													</optgroup>
												))}
											</select>
										</td>
										<td className="px-3 py-2">
											<select
												value={current.thinkingLevel}
												disabled={!current.modelId}
												onChange={(e) => {
													const next = new Map(draft);
													next.set(r.key, {
														modelId: current.modelId,
														thinkingLevel: e.target.value,
													});
													setDraft(next);
												}}
												className="field h-8 w-28 px-2 font-mono text-xs disabled:opacity-60"
											>
												<option value="">Default</option>
												{THINKING_LEVELS.map((level) => (
													<option key={level} value={level}>
														{level}
													</option>
												))}
											</select>
										</td>
										<td className="px-3 py-2 text-right">
											{current.modelId ? (
												<button
													type="button"
													title="Clear"
													onClick={() => void handleClear(r.key)}
													className="inline-flex h-6 w-6 items-center justify-center rounded text-ink-4 hover:bg-danger/10 hover:text-danger"
												>
													<Trash2 className="h-3 w-3" />
												</button>
											) : null}
										</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</>
			)}
		</div>
	);
}

const THINKING_LEVELS = ["minimal", "low", "medium", "high", "xhigh"] as const;

type ThinkingLevel = (typeof THINKING_LEVELS)[number];

type DraftRoleValue = { modelId: string; thinkingLevel: string };

const EMPTY_DRAFT_ROLE_VALUE: DraftRoleValue = { modelId: "", thinkingLevel: "" };

function isThinkingLevel(value: string): value is ThinkingLevel {
	return THINKING_LEVELS.includes(value as ThinkingLevel);
}

export function parseModelRoleValue(value: string | null): { modelId: string; thinkingLevel: string } {
	if (!value) return { modelId: "", thinkingLevel: "" };

	const suffixStart = value.lastIndexOf(":");
	if (suffixStart === -1) return { modelId: value, thinkingLevel: "" };

	const suffix = value.slice(suffixStart + 1);
	if (!isThinkingLevel(suffix)) return { modelId: value, thinkingLevel: "" };

	return { modelId: value.slice(0, suffixStart), thinkingLevel: suffix };
}

export function formatModelRoleValue(modelId: string | null, thinkingLevel: string): string | null {
	if (!modelId) return null;
	if (!thinkingLevel) return modelId;
	return `${modelId}:${thinkingLevel}`;
}

function formatCtx(tokens: number): string {
	if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
	if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
	return String(tokens);
}
