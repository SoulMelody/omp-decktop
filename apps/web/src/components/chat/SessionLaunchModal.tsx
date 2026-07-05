import { useEffect, useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import type { ModelRef } from "@omp-deck/protocol";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { api } from "@/lib/api";
import {
	modelKey,
	modelLabel,
	modelMatches,
	toModelRef,
	useModelCatalog,
} from "@/lib/model-catalog";
import { useStore } from "@/lib/store";
import { cn, shortPath } from "@/lib/utils";

export interface SessionLaunchOpts {
	cwd: string;
	model?: ModelRef;
	planMode: boolean;
	initialPrompt?: string;
}

interface Props {
	open: boolean;
	title?: string;
	confirmLabel?: string;
	initialCwd: string;
	initialPrompt?: string;
	allowWorkspaceChange?: boolean;
	showInitialPrompt?: boolean;
	onCancel: () => void;
	onConfirm: (opts: SessionLaunchOpts) => Promise<void>;
}

export function SessionLaunchModal({
	open,
	title = "New session",
	confirmLabel = "Start session",
	initialCwd,
	initialPrompt = "",
	allowWorkspaceChange = true,
	showInitialPrompt = true,
	onCancel,
	onConfirm,
}: Props) {
	const workspaces = useStore((s) => s.workspaces);
	const defaultCwd = useStore((s) => s.defaultCwd);
	const refreshWorkspaces = useStore((s) => s.refreshWorkspaces);
	const { models, grouped, loading, error: catalogError } = useModelCatalog();
	const [cwd, setCwd] = useState(initialCwd);
	const [customPath, setCustomPath] = useState(false);
	const [model, setModel] = useState<ModelRef | undefined>();
	const [planMode, setPlanMode] = useState(false);
	const [prompt, setPrompt] = useState(initialPrompt);
	const [showUnauth, setShowUnauth] = useState(false);
	const [query, setQuery] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | undefined>();

	useEffect(() => {
		if (!open) return;
		const nextCwd = initialCwd || defaultCwd;
		setCwd(nextCwd);
		setCustomPath(!workspaces.some((w) => w.cwd === nextCwd));
		setPlanMode(false);
		setPrompt(initialPrompt);
		setQuery("");
		setShowUnauth(false);
		setError(undefined);
		const pref = workspaces.find((w) => w.cwd === nextCwd)?.defaultModel;
		setModel(pref);
	}, [open, initialCwd, defaultCwd, initialPrompt, workspaces]);

	useEffect(() => {
		if (!open) return;
		const pref = workspaces.find((w) => w.cwd === cwd)?.defaultModel;
		setModel(pref);
	}, [open, cwd, workspaces]);

	const filteredGroups = useMemo(() => {
		const q = query.trim().toLowerCase();
		return grouped
			.map((group) => ({
				...group,
				items: group.items.filter((entry) => {
					const info = entry.info;
					if (!showUnauth && !info.isAvailable) return false;
					if (!q) return true;
					return (
						info.id.toLowerCase().includes(q) ||
						info.label.toLowerCase().includes(q) ||
						info.provider.toLowerCase().includes(q)
					);
				}),
			}))
			.filter((group) => group.items.length > 0);
	}, [grouped, query, showUnauth]);

	const selectedKey = model ? modelKey(model) : "";
	const cwdKnown = workspaces.some((w) => w.cwd === cwd);

	async function addWorkspacePath(): Promise<void> {
		if (!cwd.trim() || cwdKnown) return;
		const currentExtra = workspaces.filter((w) => w.cwd !== defaultCwd).map((w) => w.cwd);
		await api.patchEnv({ OMP_DECK_WORKSPACES: [...currentExtra, cwd.trim()].join(";") });
		await refreshWorkspaces();
	}

	async function submit(): Promise<void> {
		const trimmedCwd = cwd.trim() || defaultCwd;
		if (!trimmedCwd) return;
		setBusy(true);
		setError(undefined);
		try {
			await onConfirm({
				cwd: trimmedCwd,
				model,
				planMode,
				initialPrompt: showInitialPrompt ? prompt.trim() || undefined : undefined,
			});
		} catch (err) {
			setError(String((err as Error).message ?? err));
		} finally {
			setBusy(false);
		}
	}

	return (
		<Modal open={open} onClose={onCancel} widthClass="max-w-3xl" heightClass="max-h-[90vh]">
			<div className="flex h-11 items-center gap-2 border-b border-line px-3">
				<div className="meta">{title}</div>
				<div className="min-w-0 flex-1 truncate text-xs text-ink-3">
					{cwd ? shortPath(cwd, 80) : "Choose workspace"}
				</div>
				<Button variant="ghost" size="icon" onClick={onCancel} aria-label="Close">
					<X className="h-4 w-4" />
				</Button>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto p-4">
				{error ? (
					<div className="mb-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">
						{error}
					</div>
				) : null}
				<div className="grid gap-4 lg:grid-cols-[260px_1fr]">
					<section className="space-y-3">
						<div>
							<div className="meta mb-1.5">Workspace</div>
							{allowWorkspaceChange ? (
								<>
									<select
										value={customPath ? "__custom__" : cwd}
										onChange={(e) => {
											if (e.target.value === "__custom__") {
												setCustomPath(true);
												return;
											}
											setCustomPath(false);
											setCwd(e.target.value);
										}}
										className="field h-8 w-full px-2 font-mono text-xs"
									>
										{workspaces.map((w) => (
											<option key={w.cwd} value={w.cwd}>
												{w.label} · {w.sessionCount}
											</option>
										))}
										<option value="__custom__">New path…</option>
									</select>
									{customPath ? (
										<div className="mt-2 flex gap-1.5">
											<input
												value={cwd}
												onChange={(e) => setCwd(e.target.value)}
												placeholder="C:\\Users\\SoulMelody\\Projects\\my-app"
												className="field h-8 min-w-0 flex-1 px-2 font-mono text-xs"
											/>
							<Button size="sm" variant="outline" onClick={() => void addWorkspacePath()} disabled={!cwd.trim() || cwdKnown}>
												<Plus className="h-3.5 w-3.5" />
												Pin
											</Button>
										</div>
									) : null}
								</>
							) : (
								<div className="rounded-md border border-line bg-paper-2 px-2 py-1.5 font-mono text-xs text-ink-2" title={cwd}>
									{shortPath(cwd, 80)}
								</div>
							)}
						</div>

						<label className="flex items-start gap-2 rounded-md border border-line bg-paper-2 p-3">
							<input
								type="checkbox"
								checked={planMode}
								onChange={(e) => setPlanMode(e.target.checked)}
								className="mt-0.5"
							/>
							<span>
								<span className="block text-sm font-medium text-ink">Plan Mode</span>
								<span className="block text-xs text-ink-3">Start read/propose-only before the first prompt.</span>
							</span>
						</label>

						{showInitialPrompt ? (
							<div>
								<div className="meta mb-1.5">Initial prompt</div>
								<textarea
									value={prompt}
									onChange={(e) => setPrompt(e.target.value)}
									rows={6}
									placeholder="Optional first message"
									className="field min-h-28 w-full resize-y px-2 py-2 text-sm"
								/>
							</div>
						) : null}
					</section>

					<section className="min-w-0 rounded-md border border-line bg-paper-2">
						<div className="flex items-center gap-2 border-b border-line px-3 py-2">
							<div className="meta">Model</div>
							<div className="min-w-0 flex-1 truncate text-xs text-ink-3">{modelLabel(model)}</div>
							<button type="button" onClick={() => setModel(undefined)} className="font-mono text-2xs text-ink-3 hover:text-ink">
								SDK default
							</button>
						</div>
						<div className="flex items-center gap-2 border-b border-line px-3 py-2">
							<button
								type="button"
								onClick={() => setShowUnauth((v) => !v)}
								className={cn("rounded px-2 py-1 font-mono text-2xs uppercase tracking-meta", showUnauth ? "bg-accent-soft text-accent" : "bg-paper-3 text-ink-3")}
							>
								{showUnauth ? "All" : "Available"}
							</button>
							<div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-paper px-2 py-1.5">
								<Search className="h-3.5 w-3.5 text-ink-3" />
								<input
									value={query}
									onChange={(e) => setQuery(e.target.value)}
									placeholder="Filter models"
									className="min-w-0 flex-1 bg-transparent text-sm focus:outline-none"
								/>
							</div>
						</div>
						{catalogError ? <div className="px-3 py-2 font-mono text-xs text-danger">{catalogError}</div> : null}
						<div className="max-h-[48vh] overflow-y-auto">
							{loading ? <div className="px-3 py-6 text-center text-sm text-ink-3">Loading models…</div> : null}
							{filteredGroups.map((group) => (
								<div key={group.provider} className="border-b border-line last:border-b-0">
									<div className="sticky top-0 bg-paper-3 px-3 py-1.5 meta">{group.providerLabel}</div>
									{group.items.map((entry) => {
										const ref = toModelRef(entry.info);
										const selected = selectedKey === modelKey(ref) || modelMatches(model, ref);
										return (
											<button
												key={modelKey(ref)}
												type="button"
												onClick={() => setModel(ref)}
												className={cn("block w-full px-3 py-2 text-left hover:bg-paper-3/70", selected && "bg-accent-soft/50", !entry.info.isAvailable && "opacity-60")}
											>
												<div className="flex items-center gap-2">
													<span className={cn("truncate text-sm", selected ? "font-semibold text-accent" : "text-ink")}>{entry.label}</span>
													{!entry.info.isAvailable ? <span className="font-mono text-2xs text-warn">no auth</span> : null}
												</div>
												<div className="mt-0.5 truncate font-mono text-2xs text-ink-3">{entry.info.id}</div>
											</button>
										);
									})}
								</div>
							))}
						</div>
					</section>
				</div>
			</div>
			<div className="flex h-12 items-center justify-end gap-2 border-t border-line px-3">
				<Button variant="ghost" onClick={onCancel}>Cancel</Button>
				<Button variant="primary" onClick={() => void submit()} disabled={busy || !cwd.trim()}>{busy ? "Starting…" : confirmLabel}</Button>
			</div>
		</Modal>
	);
}
