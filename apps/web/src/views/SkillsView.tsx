import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Package, Search, Sparkles } from "lucide-react";
import type { ListSkillsResponse, SkillDetailResponse, SkillSummary } from "@omp-deck/protocol";

import { Layout } from "@/components/Layout";
import { Markdown } from "@/lib/markdown";
import { skillsApi } from "@/lib/skills-api";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type ScopeFilter = "all" | "user" | "project";

export function SkillsView() {
	const [data, setData] = useState<ListSkillsResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | undefined>();
	const [search, setSearch] = useState("");
	const [scope, setScope] = useState<ScopeFilter>("all");
	const [pluginFilter, setPluginFilter] = useState<string | "all">("all");
	const [selectedId, setSelectedId] = useState<string | undefined>();
	const [detail, setDetail] = useState<SkillDetailResponse | null>(null);
	const [detailLoading, setDetailLoading] = useState(false);
	const [detailError, setDetailError] = useState<string | undefined>();

	const refresh = useCallback(async (): Promise<void> => {
		try {
			const next = await skillsApi.list();
			setData(next);
			setError(undefined);
		} catch (e) {
			setError(String((e as Error).message ?? e));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	// Live updates: any plugin/skill mutation bumps the counter. Refetch when it
	// changes (mirrors TasksView's tasksChangeCounter pattern).
	const skillsChangeCounter = useStore((s) => s.skillsChangeCounter);
	useEffect(() => {
		if (skillsChangeCounter === 0) return;
		void refresh();
	}, [skillsChangeCounter, refresh]);

	const filtered = useMemo(() => {
		const skills = data?.skills ?? [];
		const q = search.trim().toLowerCase();
		return skills.filter((s) => {
			if (scope !== "all" && s.scope !== scope) return false;
			if (pluginFilter !== "all" && s.pluginId !== pluginFilter) return false;
			if (!q) return true;
			const hay = [
				s.frontmatter.name,
				s.dirName,
				s.pluginName,
				s.frontmatter.description ?? "",
				(s.frontmatter.triggers ?? []).join(" "),
				(s.frontmatter.tags ?? []).join(" "),
			]
				.join(" ")
				.toLowerCase();
			return hay.includes(q);
		});
	}, [data, search, scope, pluginFilter]);

	// Default selection: first filtered skill. Updated whenever the filter
	// changes and the prior selection drops out.
	const selected = filtered.find((s) => s.id === selectedId) ?? filtered[0];

	useEffect(() => {
		if (!selected) {
			setDetail(null);
			setDetailError(undefined);
			return;
		}
		let cancelled = false;
		setDetailLoading(true);
		setDetailError(undefined);
		skillsApi
			.detail(selected.pluginId, selected.dirName)
			.then((d) => {
				if (cancelled) return;
				setDetail(d);
			})
			.catch((e) => {
				if (cancelled) return;
				setDetailError(String((e as Error).message ?? e));
			})
			.finally(() => {
				if (cancelled) return;
				setDetailLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [selected?.id, skillsChangeCounter]);

	return (
		<Layout
			sidebar={
				<SkillsSidebar
					skills={data?.skills ?? []}
					scope={scope}
					onScope={setScope}
					pluginFilter={pluginFilter}
					onPluginFilter={setPluginFilter}
				/>
			}
			inspector={<SkillInspector skill={selected} detail={detail} />}
			main={
				<div className="flex h-full min-h-0 flex-col">
					<div className="flex h-10 shrink-0 items-center gap-2 border-b border-line bg-paper px-3">
						<div className="meta">Skills</div>
						<div className="text-xs text-ink-3">
							{loading ? "loading..." : `${filtered.length} / ${data?.skills.length ?? 0}`}
						</div>
						<div className="flex-1" />
						<div className="flex items-center gap-2 rounded-md border border-line bg-paper-2 px-2 py-1 text-xs">
							<Search className="h-3.5 w-3.5 text-ink-3" />
							<input
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								placeholder="Search name, description, triggers, tags"
								className="w-72 bg-transparent text-ink placeholder:text-ink-4 focus:outline-none"
							/>
						</div>
					</div>

					{error ? (
						<div className="mx-3 mt-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">
							{error}
						</div>
					) : null}

					<div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
						<div className="min-h-0 overflow-y-auto border-r border-line">
							{loading && !data ? (
								<div className="px-3 py-6 text-center text-sm text-ink-3">Loading skills...</div>
							) : null}
							{!loading && filtered.length === 0 ? (
								<EmptyState plugins={data?.plugins.length ?? 0} />
							) : null}
							{filtered.map((s) => (
								<SkillRow
									key={s.id}
									skill={s}
									active={selected?.id === s.id}
									onClick={() => setSelectedId(s.id)}
								/>
							))}
						</div>

						<div className="min-h-0 overflow-y-auto">
							{!selected ? null : (
								<SkillDetailPane
									skill={selected}
									detail={detail}
									loading={detailLoading}
									error={detailError}
								/>
							)}
						</div>
					</div>
				</div>
			}
		/>
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
				<span className="truncate text-sm font-medium text-ink">{skill.frontmatter.name}</span>
				{!skill.enabled ? (
					<span className="ml-auto rounded bg-paper-3 px-1.5 py-0.5 font-mono text-2xs uppercase tracking-meta text-ink-3">
						disabled
					</span>
				) : null}
			</div>
			<div className="flex w-full items-center gap-2 font-mono text-2xs text-ink-3">
				<Package className="h-3 w-3 shrink-0" />
				<span className="truncate">{skill.pluginName}</span>
				<span className="text-ink-4">·</span>
				<span className="uppercase tracking-meta">{skill.scope}</span>
			</div>
			{skill.frontmatter.description ? (
				<div className="line-clamp-2 text-xs text-ink-3">{skill.frontmatter.description}</div>
			) : null}
		</button>
	);
}

function SkillDetailPane({
	skill,
	detail,
	loading,
	error,
}: {
	skill: SkillSummary;
	detail: SkillDetailResponse | null;
	loading: boolean;
	error: string | undefined;
}) {
	return (
		<div className="flex h-full flex-col">
			<div className="border-b border-line px-4 py-3">
				<div className="flex items-center gap-2">
					<Sparkles className="h-4 w-4 text-accent" />
					<h1 className="text-base font-medium text-ink">{skill.frontmatter.name}</h1>
					<span className="ml-auto font-mono text-2xs uppercase tracking-meta text-ink-3">
						{skill.scope}
					</span>
				</div>
				<div className="mt-1 font-mono text-2xs text-ink-3">
					<span className="text-ink-4">from</span> {skill.pluginId}
				</div>
				{skill.frontmatter.description ? (
					<p className="mt-2 text-sm text-ink-2">{skill.frontmatter.description}</p>
				) : null}
				{(skill.frontmatter.triggers?.length ?? 0) > 0 ? (
					<TagRow label="triggers" values={skill.frontmatter.triggers ?? []} />
				) : null}
				{(skill.frontmatter.tags?.length ?? 0) > 0 ? (
					<TagRow label="tags" values={skill.frontmatter.tags ?? []} />
				) : null}
			</div>

			{error ? (
				<div className="m-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">
					{error}
				</div>
			) : null}

			{loading && !detail ? (
				<div className="flex items-center gap-2 px-4 py-3 text-sm text-ink-3">
					<Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading SKILL.md...
				</div>
			) : null}

			{detail ? (
				<div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
					<Markdown>{detail.body}</Markdown>
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
				<span
					key={v}
					className="rounded bg-paper-3 px-1.5 py-0.5 font-mono text-2xs text-ink-2"
				>
					{v}
				</span>
			))}
		</div>
	);
}

function EmptyState({ plugins }: { plugins: number }) {
	return (
		<div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
			<Sparkles className="h-6 w-6 text-ink-4" />
			<div className="mt-3 text-sm text-ink-2">No skills found.</div>
			<div className="mt-1 max-w-xs text-xs text-ink-3">
				{plugins === 0
					? "Install a plugin from the Marketplace to see its skills here."
					: "Your installed plugins don't ship any skills, or filters are hiding them all."}
			</div>
		</div>
	);
}

function SkillsSidebar({
	skills,
	scope,
	onScope,
	pluginFilter,
	onPluginFilter,
}: {
	skills: SkillSummary[];
	scope: ScopeFilter;
	onScope: (s: ScopeFilter) => void;
	pluginFilter: string | "all";
	onPluginFilter: (p: string | "all") => void;
}) {
	const byPlugin = useMemo(() => {
		const m = new Map<string, { pluginName: string; count: number }>();
		for (const s of skills) {
			const cur = m.get(s.pluginId);
			if (cur) cur.count += 1;
			else m.set(s.pluginId, { pluginName: s.pluginName, count: 1 });
		}
		return Array.from(m.entries())
			.map(([id, v]) => ({ id, ...v }))
			.sort((a, b) => a.pluginName.localeCompare(b.pluginName));
	}, [skills]);

	const scopeCounts = useMemo(
		() => ({
			all: skills.length,
			user: skills.filter((s) => s.scope === "user").length,
			project: skills.filter((s) => s.scope === "project").length,
		}),
		[skills],
	);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="border-b border-line px-3 py-2">
				<div className="meta">Skills</div>
				<div className="mt-0.5 text-xs text-ink-3">
					Read-only inventory of skills exposed by installed plugins. Enable / disable lives on the
					owning plugin in <span className="text-ink-2">Marketplace</span>.
				</div>
			</div>

			<div className="border-b border-line px-3 py-2">
				<div className="font-mono text-2xs uppercase tracking-meta text-ink-4">Scope</div>
				<ScopeRow label="all" count={scopeCounts.all} active={scope === "all"} onClick={() => onScope("all")} />
				<ScopeRow label="user" count={scopeCounts.user} active={scope === "user"} onClick={() => onScope("user")} />
				<ScopeRow label="project" count={scopeCounts.project} active={scope === "project"} onClick={() => onScope("project")} />
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
				<div className="font-mono text-2xs uppercase tracking-meta text-ink-4">Plugin</div>
				<ScopeRow label="all" count={skills.length} active={pluginFilter === "all"} onClick={() => onPluginFilter("all")} />
				{byPlugin.map((p) => (
					<ScopeRow
						key={p.id}
						label={p.pluginName}
						count={p.count}
						active={pluginFilter === p.id}
						onClick={() => onPluginFilter(p.id)}
					/>
				))}
			</div>
		</div>
	);
}

function ScopeRow({
	label,
	count,
	active,
	onClick,
}: {
	label: string;
	count: number;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-sm transition-colors",
				active ? "bg-accent-soft/40 text-ink" : "text-ink-2 hover:bg-paper-3",
			)}
		>
			<span className="truncate">{label}</span>
			<span className="font-mono text-2xs text-ink-3">{count}</span>
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
	if (!skill) {
		return <div className="px-3 py-4 text-xs text-ink-3">Pick a skill to inspect.</div>;
	}
	return (
		<div className="flex h-full flex-col">
			<div className="border-b border-line px-3 py-2">
				<div className="meta">Inspector</div>
				<div className="mt-0.5 text-xs text-ink-3">SKILL.md frontmatter + co-located files.</div>
			</div>
			<div className="space-y-3 overflow-y-auto px-3 py-3 text-xs">
				<DefRow k="name" v={<span className="font-mono">{skill.frontmatter.name}</span>} />
				<DefRow k="dir" v={<span className="font-mono">{skill.dirName}</span>} />
				<DefRow k="plugin" v={<span className="font-mono">{skill.pluginId}</span>} />
				<DefRow k="scope" v={<span className="font-mono uppercase">{skill.scope}</span>} />
				<DefRow
					k="enabled"
					v={
						<span className={cn("font-mono", skill.enabled ? "text-success" : "text-ink-3")}>
							{skill.enabled ? "yes" : "no (plugin disabled)"}
						</span>
					}
				/>
				{skill.frontmatter.model ? (
					<DefRow k="model" v={<span className="font-mono">{skill.frontmatter.model}</span>} />
				) : null}
				<DefRow k="path" v={<span className="break-all font-mono text-2xs">{skill.skillPath}</span>} />

				{detail && detail.files.length > 0 ? (
					<div>
						<div className="font-mono text-2xs uppercase tracking-meta text-ink-4">
							Files ({detail.files.filter((f) => f.kind === "file").length})
						</div>
						<ul className="mt-1 space-y-0.5 font-mono text-2xs">
							{detail.files.map((f) => (
								<li
									key={f.relPath}
									className={cn(
										"flex items-baseline gap-2",
										f.kind === "dir" ? "text-ink-2" : "text-ink-3",
									)}
								>
									<span className="truncate">{f.relPath}</span>
									{f.kind === "file" && typeof f.size === "number" ? (
										<span className="ml-auto shrink-0 text-ink-4">{formatBytes(f.size)}</span>
									) : null}
								</li>
							))}
						</ul>
					</div>
				) : null}
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
