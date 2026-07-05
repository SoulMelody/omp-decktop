import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Link, Loader2, Pencil, Save, Search, Sparkles, Trash2, X } from "lucide-react";
import MarkdownPreview from "@uiw/react-markdown-preview";
import "@uiw/react-markdown-preview/markdown.css";
import type { ListSkillsResponse, SkillDetailResponse, SkillSummary } from "@omp-deck/protocol";

import { Layout } from "@/components/Layout";
import { skillsApi } from "@/lib/skills-api";
import { useStore } from "@/lib/store";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

type LevelFilter = "all" | "user" | "project";
type InstallScope = "user" | "project";

/**
 * Cockpit for every skill `omp` discovers — across `native`, `claude-plugins`,
 * `claude`, `codex`, and the other discovery providers. Native sits at the top
 * by default; the source filter rail surfaces all other providers.
 */
export function SkillsView() {
	const [data, setData] = useState<ListSkillsResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | undefined>();
	const [search, setSearch] = useState("");
	const [providerFilter, setProviderFilter] = useState<string | "all">("all");
	const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
	const [selectedId, setSelectedId] = useState<string | undefined>();
	const [detail, setDetail] = useState<SkillDetailResponse | null>(null);
	const [detailLoading, setDetailLoading] = useState(false);
	const [detailError, setDetailError] = useState<string | undefined>();
	const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
	const [installDialogOpen, setInstallDialogOpen] = useState(false);
	const [installUrl, setInstallUrl] = useState("");
	const [installScope, setInstallScope] = useState<InstallScope>("user");
	const [installSubmitting, setInstallSubmitting] = useState(false);
	const [installError, setInstallError] = useState<string | undefined>();
	const selectedWorkspaceCwd = useStore((s) => s.selectedWorkspaceCwd);
	const defaultCwd = useStore((s) => s.defaultCwd);
	const currentCwd = selectedWorkspaceCwd || defaultCwd;

	const refresh = useCallback(async (): Promise<void> => {
		try {
			const next = await skillsApi.list(currentCwd || undefined);
			setData(next);
			setError(undefined);
		} catch (e) {
			setError(String((e as Error).message ?? e));
		} finally {
			setLoading(false);
		}
	}, [currentCwd]);

	const loadDetail = useCallback(
		async (id: string): Promise<void> => {
			setDetailLoading(true);
			setDetailError(undefined);
			try {
				const next = await skillsApi.detail(id, currentCwd || undefined);
				setDetail(next);
			} catch (e) {
				setDetailError(String((e as Error).message ?? e));
			} finally {
				setDetailLoading(false);
			}
		},
		[currentCwd],
	);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const skillsChangeCounter = useStore((s) => s.skillsChangeCounter);
	useEffect(() => {
		if (skillsChangeCounter === 0) return;
		void refresh();
	}, [skillsChangeCounter, refresh]);

	const filtered = useMemo(() => {
		const skills = data?.skills ?? [];
		const q = search.trim().toLowerCase();
		return skills.filter((s) => {
			if (providerFilter !== "all" && s.provider !== providerFilter) return false;
			if (levelFilter !== "all" && s.level !== levelFilter) return false;
			if (!q) return true;
			const hay = [
				s.name,
				s.dirName,
				s.providerLabel,
				s.pluginName ?? "",
				s.frontmatter.description ?? "",
				(s.frontmatter.triggers ?? []).join(" "),
				(s.frontmatter.tags ?? []).join(" "),
			]
				.join(" ")
				.toLowerCase();
			return hay.includes(q);
		});
	}, [data, search, providerFilter, levelFilter]);

	const selected = filtered.find((s) => s.id === selectedId) ?? filtered[0];

	useEffect(() => {
		if (!selected) {
			setDetail(null);
			setDetailError(undefined);
			return;
		}
		void loadDetail(selected.id);
	}, [loadDetail, selected?.id, skillsChangeCounter]);

	const submitInstall = useCallback(async (): Promise<void> => {
		const source = installUrl.trim();
		if (!source) {
			setInstallError("Source is required.");
			return;
		}
		setInstallSubmitting(true);
		setInstallError(undefined);
		try {
			// Detect source type: URL vs npm/github shorthand
			const isUrl = source.startsWith("http://") || source.startsWith("https://");
			const cwd = installScope === "project" && currentCwd ? currentCwd : undefined;

			if (isUrl) {
				// URL-based install (direct SKILL.md URL)
				const result = await skillsApi.installFromUrl({
					url: source,
					scope: installScope,
					...(cwd ? { cwd } : {}),
				});
				setInstallDialogOpen(false);
				setInstallUrl("");
				setInstallScope("user");
				await refresh();
				setSelectedId(result.id);
				setMobileDetailOpen(true);
			} else {
				// npm/github shorthand install via bunx skills add
				const result = await skillsApi.installFromNpm({
					source: { source },
					scope: installScope,
					...(cwd ? { cwd } : {}),
				});
				setInstallDialogOpen(false);
				setInstallUrl("");
				setInstallScope("user");
				await refresh();
				// Select the first installed skill
				if (result.skills.length > 0) {
					const skillPath = result.paths[0] ?? "";
					// The id is the encoded path - we need to find it in the refreshed list
					await refresh();
				}
				setMobileDetailOpen(true);
			}
		} catch (e) {
			setInstallError(String((e as Error).message ?? e));
		} finally {
			setInstallSubmitting(false);
		}
	}, [currentCwd, installScope, installUrl, refresh]);

	return (
		<>
			<Layout
				sidebar={
					<SkillsSidebar
						skills={data?.skills ?? []}
						providerFilter={providerFilter}
						onProviderFilter={setProviderFilter}
						levelFilter={levelFilter}
						onLevelFilter={setLevelFilter}
					/>
				}
				inspector={<SkillInspector skill={selected} detail={detail} />}
				main={
					<div className="flex h-full min-h-0 flex-col">
						<div className="flex h-auto shrink-0 flex-wrap items-center gap-2 border-b border-line bg-paper px-3 py-2">
							<div className="meta">Skills</div>
							<div className="text-xs text-ink-3">
								{loading ? "loading..." : `${filtered.length} / ${data?.skills.length ?? 0}`}
							</div>
							<div className="flex-1" />
							<button
								type="button"
								onClick={() => {
									setInstallError(undefined);
									setInstallDialogOpen(true);
								}}
								className="inline-flex items-center gap-1 rounded-md border border-line bg-paper-2 px-2.5 py-1.5 text-xs text-ink-2 transition-colors hover:bg-paper-3 hover:text-ink"
							>
								<Link className="h-3.5 w-3.5" />
								Install
							</button>
							<div className="flex items-center gap-2 rounded-md border border-line bg-paper-2 px-2 py-1 text-xs">
								<Search className="h-3.5 w-3.5 text-ink-3" />
								<input
									value={search}
									onChange={(e) => setSearch(e.target.value)}
									placeholder="Search name, description, triggers, tags"
									className="w-full bg-transparent text-ink placeholder:text-ink-4 focus:outline-none sm:w-72"
								/>
							</div>
						</div>

						{error ? (
							<div className="mx-3 mt-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">
								{error}
							</div>
						) : null}

						<div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
							<div
								className={cn(
									"min-h-0 overflow-y-auto border-line lg:block lg:border-r",
									mobileDetailOpen ? "hidden" : "block",
								)}
							>
								{loading && !data ? (
									<div className="px-3 py-6 text-center text-sm text-ink-3">Loading skills...</div>
								) : null}
								{!loading && filtered.length === 0 ? <EmptyState total={data?.skills.length ?? 0} /> : null}
								{filtered.map((s) => (
									<SkillRow
										key={s.id}
										skill={s}
										active={selected?.id === s.id}
										onClick={() => {
											setSelectedId(s.id);
											setMobileDetailOpen(true);
										}}
									/>
								))}
							</div>

							<div className={cn("min-h-0 overflow-y-auto lg:block", mobileDetailOpen ? "block" : "hidden")}>
								{!selected ? null : (
									<SkillDetailPane
										skill={selected}
										detail={detail}
										loading={detailLoading}
										error={detailError}
										cwd={currentCwd || undefined}
										onBack={() => setMobileDetailOpen(false)}
										onReload={() => loadDetail(selected.id)}
										onDeleted={async () => {
											setData((cur) => (cur ? { ...cur, skills: cur.skills.filter((s) => s.id !== selected.id) } : cur));
											setSelectedId(undefined);
											setDetail(null);
											setMobileDetailOpen(false);
											await refresh();
										}}
									/>
								)}
							</div>
						</div>
					</div>
				}
			/>

			{installDialogOpen ? (
				<InstallFromUrlDialog
					url={installUrl}
					scope={installScope}
					submitting={installSubmitting}
					error={installError}
					onUrlChange={setInstallUrl}
					onScopeChange={setInstallScope}
					onClose={() => {
						if (installSubmitting) return;
						setInstallDialogOpen(false);
					}}
					onSubmit={() => void submitInstall()}
				/>
			) : null}
		</>
	);
}

function SkillRow({ skill, active, onClick }: { skill: SkillSummary; active: boolean; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex w-full flex-col items-start gap-1 border-b border-line px-3 py-2 text-left transition-colors",
				active ? "bg-accent-soft/30" : "hover:bg-paper-3",
				!skill.enabled && "opacity-60",
			)}
		>
			<div className="flex w-full items-center gap-2">
				<Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" />
				<span className="truncate text-sm font-medium text-ink">{skill.name}</span>
				{!skill.enabled ? (
					<span className="ml-auto rounded bg-paper-3 px-1.5 py-0.5 font-mono text-2xs uppercase tracking-meta text-ink-3">
						hidden
					</span>
				) : null}
			</div>
			<div className="flex w-full items-center gap-2 font-mono text-2xs text-ink-3">
				<ProviderBadge provider={skill.provider} label={skill.providerLabel} />
				<span className="uppercase tracking-meta">{skill.level}</span>
				{skill.pluginName ? (
					<>
						<span className="text-ink-4">·</span>
						<span className="truncate">{skill.pluginName}</span>
					</>
				) : null}
			</div>
			{skill.frontmatter.description ? (
				<div className="line-clamp-2 text-xs text-ink-3">{skill.frontmatter.description}</div>
			) : null}
		</button>
	);
}

function ProviderBadge({ provider, label }: { provider: string; label: string }) {
	const tone = provider === "native" ? "bg-accent-soft/50 text-accent" : "bg-paper-3 text-ink-2";
	return (
		<span className={cn("rounded px-1.5 py-0.5 font-mono text-2xs uppercase tracking-meta", tone)}>
			{label}
		</span>
	);
}

function SkillDetailPane({
	skill,
	detail,
	loading,
	error,
	cwd,
	onBack,
	onReload,
	onDeleted,
}: {
	skill: SkillSummary;
	detail: SkillDetailResponse | null;
	loading: boolean;
	error: string | undefined;
	cwd?: string;
	onBack?: () => void;
	onReload: () => void | Promise<void>;
	onDeleted: () => void | Promise<void>;
}) {
	const [editing, setEditing] = useState(false);
	const [editBody, setEditBody] = useState("");
	const [saving, setSaving] = useState(false);
	const [localError, setLocalError] = useState<string | undefined>();
	const [deleteConfirm, setDeleteConfirm] = useState(false);
	const theme = useTheme();
	const previewColorMode = theme.active === "paper" ? "light" : "dark";
	const [deleting, setDeleting] = useState(false);

	useEffect(() => {
		if (!detail) return;
		setEditBody(detail.rawContent);
		setEditing(false);
		setLocalError(undefined);
		setDeleteConfirm(false);
	}, [detail?.id]);

	const editable = skill.provider === "native";

	const save = useCallback(async (): Promise<void> => {
		setSaving(true);
		setLocalError(undefined);
		try {
			await skillsApi.update(skill.id, { body: editBody });
			await onReload();
			setEditing(false);
		} catch (e) {
			setLocalError(String((e as Error).message ?? e));
		} finally {
			setSaving(false);
		}
	}, [editBody, onReload, skill.id]);

	const remove = useCallback(async (): Promise<void> => {
		setDeleting(true);
		setLocalError(undefined);
		try {
			await skillsApi.deleteSkill(skill.id, cwd);
			await onDeleted();
		} catch (e) {
			setLocalError(String((e as Error).message ?? e));
			setDeleting(false);
		}
	}, [cwd, onDeleted, skill.id]);

	return (
		<div className="flex h-full flex-col">
			<div className="border-b border-line px-4 py-3">
				<div className="flex items-center gap-2">
					{onBack ? (
						<button
							type="button"
							onClick={onBack}
							aria-label="Back to skill list"
							className="-ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-paper-3 hover:text-ink lg:hidden"
						>
							<ArrowLeft className="h-4 w-4" />
						</button>
					) : null}
					<Sparkles className="h-4 w-4 text-accent" />
					<h1 className="text-base font-medium text-ink">{skill.name}</h1>
					<div className="ml-auto flex items-center gap-2">
						{editable ? (
							<>
								{editing ? (
									<>
										<button
											type="button"
											onClick={() => void save()}
											disabled={saving || deleting}
											className="inline-flex items-center gap-1 rounded-md border border-line bg-accent-soft/40 px-2 py-1 text-xs text-ink transition-colors hover:bg-accent-soft/60 disabled:opacity-50"
										>
											{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
											Save
										</button>
										<button
											type="button"
											onClick={() => {
												setEditing(false);
												setEditBody(detail?.rawContent ?? "");
												setLocalError(undefined);
											}}
											disabled={saving || deleting}
											className="inline-flex items-center gap-1 rounded-md border border-line bg-paper-2 px-2 py-1 text-xs text-ink-2 transition-colors hover:bg-paper-3 hover:text-ink disabled:opacity-50"
										>
											<X className="h-3.5 w-3.5" />
											Cancel
										</button>
									</>
								) : (
									<button
										type="button"
										onClick={() => {
											setEditing(true);
											setLocalError(undefined);
										}}
										className="inline-flex items-center gap-1 rounded-md border border-line bg-paper-2 px-2 py-1 text-xs text-ink-2 transition-colors hover:bg-paper-3 hover:text-ink"
									>
										<Pencil className="h-3.5 w-3.5" />
										Edit
									</button>
								)}
								<button
									type="button"
									onClick={() => {
										if (deleteConfirm) {
											void remove();
											return;
										}
										setDeleteConfirm(true);
										setLocalError(undefined);
									}}
									disabled={saving || deleting}
									className={cn(
										"inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors disabled:opacity-50",
										deleteConfirm
											? "border-danger/40 bg-danger/10 text-danger hover:bg-danger/20"
											: "border-line bg-paper-2 text-ink-2 hover:bg-paper-3 hover:text-ink",
									)}
								>
									{deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
									{deleteConfirm ? "Confirm delete" : "Delete"}
								</button>
							</>
						) : null}
						<ProviderBadge provider={skill.provider} label={skill.providerLabel} />
						<span className="font-mono text-2xs uppercase tracking-meta text-ink-3">{skill.level}</span>
					</div>
				</div>
				<div className="mt-1 font-mono text-2xs text-ink-3">
					{skill.pluginId ? (
						<>
							<span className="text-ink-4">from plugin</span> {skill.pluginId}
						</>
					) : (
						<>
							<span className="text-ink-4">from</span> {skill.providerLabel}
							<span className="text-ink-4"> · dir</span> {skill.dirName}
						</>
					)}
				</div>
				{skill.frontmatter.description ? <p className="mt-2 text-sm text-ink-2">{skill.frontmatter.description}</p> : null}
				{(skill.frontmatter.triggers?.length ?? 0) > 0 ? <TagRow label="triggers" values={skill.frontmatter.triggers ?? []} /> : null}
				{(skill.frontmatter.tags?.length ?? 0) > 0 ? <TagRow label="tags" values={skill.frontmatter.tags ?? []} /> : null}
				{deleteConfirm ? (
					<div className="mt-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
						Delete <span className="font-mono">{skill.dirName}</span>? Click <span className="font-medium">Confirm delete</span> again to remove the whole native skill directory.
					</div>
				) : null}
			</div>

			{error || localError ? (
				<div className="m-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">
					{localError ?? error}
				</div>
			) : null}

			{loading && !detail ? (
				<div className="flex items-center gap-2 px-4 py-3 text-sm text-ink-3">
					<Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading SKILL.md...
				</div>
			) : null}

			{detail ? (
				<div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
					{editing ? (
						<div className="grid min-h-[520px] gap-3 xl:grid-cols-2">
							<textarea
								value={editBody}
								onChange={(e) => setEditBody(e.target.value)}
								spellCheck={false}
								className="min-h-[520px] resize-y rounded-md border border-line bg-paper-2 px-3 py-3 font-mono text-xs leading-relaxed text-ink outline-none transition-colors placeholder:text-ink-4 focus:border-accent"
							/>
							<MarkdownPreview
								source={editBody}
								wrapperElement={{ "data-color-mode": previewColorMode }}
								className="skill-md-preview min-h-[520px] rounded-md border border-line bg-paper-2 px-4 py-3"
							/>
						</div>
					) : (
						<MarkdownPreview
							source={detail.body}
							wrapperElement={{ "data-color-mode": previewColorMode }}
							className="skill-md-preview bg-transparent"
						/>
					)}
				</div>
			) : null}
		</div>
	);
}

function TagRow({ label, values }: { label: string; values: readonly string[] }) {
	return (
		<div className="mt-2 flex flex-wrap items-center gap-1">
			<span className="font-mono text-2xs uppercase tracking-meta text-ink-4">{label}</span>
			{values.map((v) => (
				<span key={v} className="rounded bg-paper-3 px-1.5 py-0.5 font-mono text-2xs text-ink-2">
					{v}
				</span>
			))}
		</div>
	);
}

function EmptyState({ total }: { total: number }) {
	return (
		<div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
			<Sparkles className="h-6 w-6 text-ink-4" />
			<div className="mt-3 text-sm text-ink-2">{total === 0 ? "No skills discovered" : "No skills match the current filters"}</div>
			<div className="mt-1 max-w-xs text-xs text-ink-3">
				{total === 0
					? "Drop a SKILL.md into ~/.omp/agent/skills/<name>/, or install one from a URL."
					: "Try clearing the source / level filters or the search box."}
			</div>
		</div>
	);
}

function SkillsSidebar({
	skills,
	providerFilter,
	onProviderFilter,
	levelFilter,
	onLevelFilter,
}: {
	skills: SkillSummary[];
	providerFilter: string | "all";
	onProviderFilter: (p: string | "all") => void;
	levelFilter: LevelFilter;
	onLevelFilter: (l: LevelFilter) => void;
}) {
	const providers = useMemo(() => {
		const m = new Map<string, { label: string; count: number; priority: number }>();
		for (const s of skills) {
			const cur = m.get(s.provider);
			if (cur) cur.count += 1;
			else m.set(s.provider, { label: s.providerLabel, count: 1, priority: providerPriority(s.provider) });
		}
		return Array.from(m.entries())
			.map(([id, v]) => ({ id, ...v }))
			.sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label));
	}, [skills]);

	const levelCounts = useMemo(
		() => ({
			all: skills.length,
			user: skills.filter((s) => s.level === "user").length,
			project: skills.filter((s) => s.level === "project").length,
		}),
		[skills],
	);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="border-b border-line px-3 py-2">
				<div className="meta">Skills</div>
				<div className="mt-0.5 text-xs text-ink-3">
					Every skill <span className="text-ink-2">omp</span> can reach — native, marketplace, and sibling agent-tool configs. Native skills can be edited here.
				</div>
			</div>

			<div className="border-b border-line px-3 py-2">
				<div className="font-mono text-2xs uppercase tracking-meta text-ink-4">Source</div>
				<FilterRow label="all" count={skills.length} active={providerFilter === "all"} onClick={() => onProviderFilter("all")} />
				{providers.map((p) => (
					<FilterRow
						key={p.id}
						label={p.label}
						count={p.count}
						active={providerFilter === p.id}
						onClick={() => onProviderFilter(p.id)}
						highlight={p.id === "native"}
					/>
				))}
			</div>

			<div className="min-h-0 px-3 py-2">
				<div className="font-mono text-2xs uppercase tracking-meta text-ink-4">Level</div>
				<FilterRow label="all" count={levelCounts.all} active={levelFilter === "all"} onClick={() => onLevelFilter("all")} />
				<FilterRow label="user" count={levelCounts.user} active={levelFilter === "user"} onClick={() => onLevelFilter("user")} />
				<FilterRow label="project" count={levelCounts.project} active={levelFilter === "project"} onClick={() => onLevelFilter("project")} />
			</div>
		</div>
	);
}

function FilterRow({
	label,
	count,
	active,
	onClick,
	highlight,
}: {
	label: string;
	count: number;
	active: boolean;
	onClick: () => void;
	highlight?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-sm transition-colors",
				active ? "bg-accent-soft/40 text-ink" : highlight ? "text-accent hover:bg-paper-3" : "text-ink-2 hover:bg-paper-3",
			)}
		>
			<span className="truncate">{label}</span>
			<span className={cn("font-mono text-2xs", active ? "text-ink-2" : "text-ink-3")}>{count}</span>
		</button>
	);
}

function SkillInspector({
	skill,
	detail,
}: {
	skill: SkillSummary | undefined;
	detail: SkillDetailResponse | null;
}) {
	if (!skill) return <div className="px-3 py-4 text-xs text-ink-3">Pick a skill to inspect.</div>;
	return (
		<div className="flex h-full flex-col">
			<div className="border-b border-line px-3 py-2">
				<div className="meta">Inspector</div>
				<div className="mt-0.5 text-xs text-ink-3">SKILL.md frontmatter + co-located files.</div>
			</div>
			<div className="space-y-3 overflow-y-auto px-3 py-3 text-xs">
				<DefRow k="name" v={<span className="font-mono">{skill.name}</span>} />
				<DefRow k="dir" v={<span className="font-mono">{skill.dirName}</span>} />
				<DefRow k="provider" v={<span className="font-mono">{skill.providerLabel} ({skill.provider})</span>} />
				<DefRow k="level" v={<span className="font-mono uppercase">{skill.level}</span>} />
				{skill.pluginId ? <DefRow k="plugin" v={<span className="font-mono">{skill.pluginId}</span>} /> : null}
				<DefRow
					k="enabled"
					v={<span className={cn("font-mono", skill.enabled ? "text-success" : "text-ink-3")}>{skill.enabled ? "yes" : "hidden (frontmatter)"}</span>}
				/>
				{skill.frontmatter.model ? <DefRow k="model" v={<span className="font-mono">{skill.frontmatter.model}</span>} /> : null}
				<DefRow k="path" v={<span className="break-all font-mono text-2xs">{skill.skillPath}</span>} />

				{detail && detail.files.length > 0 ? (
					<div>
						<div className="font-mono text-2xs uppercase tracking-meta text-ink-4">
							Bundled files ({detail.files.filter((f) => f.kind === "file").length})
						</div>
						<div className="mt-1 text-2xs text-ink-4">Reachable on demand — not auto-injected into the agent's context.</div>
						<ul className="mt-2 space-y-0.5 font-mono text-2xs">
							{detail.files.map((f) => (
								<li
									key={f.relPath}
									className={cn("flex items-baseline gap-2", f.kind === "dir" ? "text-ink-2" : "text-ink-3")}
								>
									<span className="truncate">{f.relPath}</span>
									{f.kind === "file" && typeof f.size === "number" ? <span className="ml-auto shrink-0 text-ink-4">{formatBytes(f.size)}</span> : null}
								</li>
							))}
						</ul>
					</div>
				) : null}
			</div>
		</div>
	);
}

function InstallFromUrlDialog({
	url,
	scope,
	submitting,
	error,
	onUrlChange,
	onScopeChange,
	onClose,
	onSubmit,
}: {
	url: string;
	scope: InstallScope;
	submitting: boolean;
	error: string | undefined;
	onUrlChange: (value: string) => void;
	onScopeChange: (value: InstallScope) => void;
	onClose: () => void;
	onSubmit: () => void;
}) {
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
			<div className="w-full max-w-xl rounded-lg border border-line bg-paper shadow-2xl">
				<div className="flex items-center gap-2 border-b border-line px-4 py-3">
					<Link className="h-4 w-4 text-accent" />
					<div className="text-sm font-medium text-ink">Install skill</div>
					<button
						type="button"
						onClick={onClose}
						disabled={submitting}
						className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-paper-3 hover:text-ink disabled:opacity-50"
					>
						<X className="h-4 w-4" />
					</button>
				</div>
				<div className="space-y-4 px-4 py-4">
					<div>
						<label className="font-mono text-2xs uppercase tracking-meta text-ink-4">Source</label>
						<input
							value={url}
							onChange={(e) => onUrlChange(e.target.value)}
							placeholder="owner/repo, https://github.com/owner/repo, or SKILL.md URL"
							className="mt-1 w-full rounded-md border border-line bg-paper-2 px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:border-accent focus:outline-none"
						/>
						<div className="mt-1 text-xs text-ink-4">
							URLs install directly; GitHub shorthand (owner/repo) uses bunx skills add
						</div>
					</div>
					<div>
						<label className="font-mono text-2xs uppercase tracking-meta text-ink-4">Scope</label>
						<div className="mt-1 flex gap-2">
							<button
								type="button"
								onClick={() => onScopeChange("user")}
								className={cn(
									"rounded-md border px-3 py-1.5 text-xs transition-colors",
									scope === "user" ? "border-accent bg-accent-soft/40 text-ink" : "border-line bg-paper-2 text-ink-2 hover:bg-paper-3 hover:text-ink",
								)}
							>
								User
							</button>
							<button
								type="button"
								onClick={() => onScopeChange("project")}
								className={cn(
									"rounded-md border px-3 py-1.5 text-xs transition-colors",
									scope === "project" ? "border-accent bg-accent-soft/40 text-ink" : "border-line bg-paper-2 text-ink-2 hover:bg-paper-3 hover:text-ink",
								)}
							>
								Project
							</button>
						</div>
					</div>
					{error ? <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">{error}</div> : null}
				</div>
				<div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
					<button
						type="button"
						onClick={onClose}
						disabled={submitting}
						className="rounded-md border border-line bg-paper-2 px-3 py-1.5 text-xs text-ink-2 transition-colors hover:bg-paper-3 hover:text-ink disabled:opacity-50"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={onSubmit}
						disabled={submitting}
						className="inline-flex items-center gap-1 rounded-md border border-line bg-accent-soft/40 px-3 py-1.5 text-xs text-ink transition-colors hover:bg-accent-soft/60 disabled:opacity-50"
					>
						{submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link className="h-3.5 w-3.5" />}
						Install
					</button>
				</div>
			</div>
		</div>
	);
}
function DefRow({ k, v }: { k: string; v: React.ReactNode }) {
	return (
		<div>
			<div className="font-mono text-2xs uppercase tracking-meta text-ink-4">{k}</div>
			<div className="mt-0.5 text-ink-2">{v}</div>
		</div>
	);
}

function formatBytes(n: number): string {
	if (n < 1024) return `${n}B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}K`;
	return `${(n / (1024 * 1024)).toFixed(1)}M`;
}

function providerPriority(provider: string): number {
	switch (provider) {
		case "native":
			return 0;
		case "claude-plugins":
			return 1;
		case "claude":
			return 2;
		case "codex":
			return 3;
		case "opencode":
			return 4;
		case "cursor":
			return 5;
		case "windsurf":
			return 6;
		case "cline":
			return 7;
		case "gemini":
			return 8;
		case "agents":
			return 9;
		case "custom":
			return 10;
		default:
			return 100;
	}
}

