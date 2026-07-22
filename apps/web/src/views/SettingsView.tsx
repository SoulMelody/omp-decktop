import { useCallback, useEffect, useMemo, useState } from "react";
import { AppearanceSection } from "@/components/settings/AppearanceSection";
import { ModelRolesSection } from "@/components/settings/ModelRolesSection";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { ModelRef, WorkspaceEntry } from "@omp-deck/protocol";

import { Layout } from "@/components/Layout";
import { EnvSection } from "@/components/settings/EnvSection";
import { MessagingSection } from "@/components/settings/MessagingSection";
import { OrientationSection } from "@/components/settings/OrientationSection";
import { NotificationsSection } from "@/components/settings/NotificationsSection";
import { ProviderWorkspace } from "@/components/settings/providers/ProviderWorkspace";
import { DapSection } from "@/components/settings/DapSection";
import { LspSection } from "@/components/settings/LspSection";
import { SECTIONS, normalizeSection, type SectionId } from "@/components/settings/settings-helpers";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { modelKey, modelLabel, toModelRef, useModelCatalog } from "@/lib/model-catalog";

export function SettingsView() {
	const [params, setParams] = useSearchParams();
	const { t } = useTranslation();
	const selected = normalizeSection(params.get("section"));

	function setSection(section: SectionId): void {
		const next = new URLSearchParams(params);
		next.set("section", section);
		setParams(next, { replace: true });
	}

	return (
		<Layout
			sidebar={<SettingsSideRail selected={selected} onSelect={setSection} />}
			inspector={<SettingsInspector />}
			main={
				<div className="flex h-full min-h-0 flex-col">
					<div className="flex h-10 shrink-0 items-center gap-2 border-b border-line bg-paper px-3">
						<div className="meta">{t("settings.title")}</div>
						<div className="text-xs text-ink-3">{t("settings.subtitle")}</div>
					</div>
					<section className="min-h-0 flex-1 overflow-auto">
						{selected === "env" ? (
							<EnvSection />
						) : selected === "providers" ? (
							<ProviderWorkspace />
						) : selected === "messaging" ? (
							<MessagingSection />
						) : selected === "orientation" ? (
							<OrientationSection />
						) : selected === "appearance" ? (
							<AppearanceSection />
						) : selected === "notifications" ? (
							<NotificationsSection />
						) : selected === "modelRoles" ? (
							<ModelRolesSection />
						) : selected === "workspaces" ? (
							<WorkspacesSection />
						) : selected === "lsp" ? (
							<LspSection />
						) : selected === "dap" ? (
							<DapSection />
						) : (
							<StubSection section={selected} />
						)}
					</section>
				</div>
			}
		/>
	);
}

function StubSection({
	section,
}: {
	section: Exclude<SectionId, "env" | "providers" | "messaging" | "orientation" | "appearance" | "notifications" | "modelRoles" | "workspaces" | "lsp" | "dap">;
}) {
	const spec = SECTIONS.find((s) => s.id === section)!;
	const { t } = useTranslation();
	return (
		<div className="mx-auto max-w-3xl rounded-md border border-dashed border-line bg-paper-2 p-6">
			<div className="meta">{spec.label}</div>
			<h1 className="mt-2 text-xl font-semibold">{t("settings.stub.heading")}</h1>
			<p className="mt-1 text-sm text-ink-3">{t("settings.stub.body")}</p>
		</div>
	);
}

function WorkspacesSection() {
	const [workspaces, setWorkspaces] = useState<WorkspaceEntry[]>([]);
	const [saving, setSaving] = useState<string | undefined>();
	const [error, setError] = useState<string | undefined>();
	const { models, loading } = useModelCatalog();

	const availableModels = useMemo(() => models.filter((m) => m.info.isAvailable), [models]);

	const load = useCallback(async () => {
		setError(undefined);
		try {
			const resp = await api.listWorkspaces();
			setWorkspaces(resp.workspaces);
		} catch (err) {
			setError(String((err as Error).message ?? err));
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	async function setDefault(cwd: string, model: ModelRef | null): Promise<void> {
		setSaving(cwd);
		setError(undefined);
		try {
			await api.setWorkspacePreference(cwd, model);
			await load();
		} catch (err) {
			setError(String((err as Error).message ?? err));
		} finally {
			setSaving(undefined);
		}
	}

	return (
		<div className="mx-auto max-w-4xl space-y-4">
			<div>
				<div className="meta">Workspaces</div>
				<h1 className="mt-2 text-xl font-semibold text-ink">Workspace defaults</h1>
				<p className="mt-1 text-sm text-ink-3">Choose the model preselected for each workspace. Launch-time choices still override this default.</p>
			</div>
			{error ? <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">{error}</div> : null}
			<div className="overflow-hidden rounded-md border border-line bg-paper">
				<table className="w-full text-sm">
					<thead className="bg-paper-2 text-left meta">
						<tr>
							<th className="px-3 py-2">Workspace</th>
							<th className="px-3 py-2">Default model</th>
							<th className="px-3 py-2">Sessions</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-line">
						{workspaces.map((workspace) => (
							<tr key={workspace.cwd}>
								<td className="px-3 py-2">
									<div className="font-medium text-ink">{workspace.label}</div>
									<div className="truncate font-mono text-2xs text-ink-3">{workspace.cwd}</div>
								</td>
								<td className="px-3 py-2">
									<select
										value={workspace.defaultModel ? modelKey(workspace.defaultModel) : ""}
										onChange={(event) => {
											const selected = availableModels.find((entry) => modelKey(entry.ref) === event.target.value);
											void setDefault(workspace.cwd, selected ? toModelRef(selected.info) : null);
										}}
										disabled={saving === workspace.cwd || loading}
										className="field h-8 w-full max-w-md px-2 font-mono text-xs"
									>
										<option value="">SDK default</option>
										{availableModels.map((entry) => (
											<option key={modelKey(entry.ref)} value={modelKey(entry.ref)}>
												{entry.ref.providerName ?? entry.ref.provider} / {entry.info.label}
											</option>
										))}
									</select>
									<div className="mt-1 font-mono text-2xs text-ink-3">{modelLabel(workspace.defaultModel)}</div>
								</td>
								<td className="px-3 py-2 font-mono text-xs text-ink-3">{workspace.sessionCount}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

function SettingsSideRail({
	selected,
	onSelect,
}: {
	selected: SectionId;
	onSelect: (section: SectionId) => void;
}) {
	const { t } = useTranslation();
	return (
		<div className="flex h-full min-h-0 flex-col gap-1 overflow-auto p-3">
			<div className="meta mb-1 text-ink-3">{t("settings.title")}</div>
			<nav className="flex flex-col" aria-label={t("settings.title")}>
				{SECTIONS.map((section) => (
					<button
						key={section.id}
						type="button"
						onClick={() => onSelect(section.id)}
						className={cn(
							"mb-1 block w-full rounded-md px-2 py-2 text-left transition-colors",
							selected === section.id ? "bg-accent-soft text-accent" : "hover:bg-paper-3",
						)}
						aria-current={selected === section.id ? "page" : undefined}
					>
						<div className="font-mono text-xs font-medium uppercase tracking-meta">
							{section.label}
						</div>
						<div className="mt-0.5 text-xs text-ink-3">{section.description}</div>
					</button>
				))}
			</nav>
		</div>
	);
}

function SettingsInspector() {
	return (
		<div className="space-y-2 p-3 text-xs text-ink-3">
			<div className="meta">Settings notes</div>
			<p>Secrets are masked in list responses. Replace values here; do not reveal unless using the loopback API directly.</p>
		</div>
	);
}
