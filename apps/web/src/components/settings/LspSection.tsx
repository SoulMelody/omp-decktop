import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LspConfigResponse, ProjectLspConfigResponse } from "@omp-deck/protocol";
import { settingsApi } from "@/lib/settings-api";

function formatJson(value: unknown): string {
	return JSON.stringify(value, null, 2);
}

export function LspSection() {
	const { t } = useTranslation();
	const [globalConfig, setGlobalConfig] = useState<LspConfigResponse | null>(null);
	const [projectConfig, setProjectConfig] = useState<ProjectLspConfigResponse | null>(null);
	const [error, setError] = useState<string | undefined>();
	const [saving, setSaving] = useState<"global" | "project" | undefined>();

	async function refresh() {
		try {
			const [global, project] = await Promise.all([settingsApi.getLspConfig(), settingsApi.getWorkspaceLsp((globalThis as any).__OMP_DEFAULT_CWD__ ?? globalThis.location?.pathname ?? ".")]);
			setGlobalConfig(global);
			setProjectConfig(project);
			setError(undefined);
		} catch (e) {
			setError(String(e));
		}
	}

	useEffect(() => {
		void refresh();
	}, []);

	const globalJson = useMemo(() => formatJson(globalConfig?.servers ?? {}), [globalConfig]);
	const projectJson = useMemo(() => formatJson(projectConfig?.servers ?? {}), [projectConfig]);

	async function saveGlobal() {
		if (!globalConfig) return;
		setSaving("global");
		try {
			await settingsApi.updateLspConfig({ servers: globalConfig.servers, idleTimeoutMs: globalConfig.idleTimeoutMs ?? null });
		} finally {
			setSaving(undefined);
		}
	}

	async function saveProject() {
		if (!projectConfig) return;
		setSaving("project");
		try {
			await settingsApi.updateWorkspaceLsp(projectConfig.cwd, { servers: projectConfig.servers, idleTimeoutMs: projectConfig.idleTimeoutMs ?? null });
		} finally {
			setSaving(undefined);
		}
	}

	return (
		<div className="mx-auto max-w-3xl space-y-4">
			<div>
				<h1 className="text-xl font-semibold tracking-tight">{t("settings.lsp.heading")}</h1>
				<p className="mt-1 text-sm text-ink-3">{t("settings.lsp.intro")}</p>
			</div>
			{error ? <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">{error}</div> : null}
			<div className="space-y-3 rounded-md border border-line bg-paper p-3">
				<div className="flex items-center justify-between">
					<div>
						<div className="font-mono text-xs font-medium uppercase tracking-meta">Global LSP</div>
						<div className="text-xs text-ink-3">{globalConfig?.configPath ?? "..."}</div>
					</div>
					<button className="rounded-md border border-line px-2 py-1 text-xs" onClick={() => void saveGlobal()} disabled={saving === "global"}>Save</button>
				</div>
				<pre className="overflow-auto rounded-md bg-paper-2 p-3 font-mono text-2xs">{globalJson}</pre>
			</div>
			<div className="space-y-3 rounded-md border border-line bg-paper p-3">
				<div className="flex items-center justify-between">
					<div>
						<div className="font-mono text-xs font-medium uppercase tracking-meta">Workspace LSP</div>
						<div className="text-xs text-ink-3">{projectConfig?.projectConfigPath ?? "..."}</div>
					</div>
					<button className="rounded-md border border-line px-2 py-1 text-xs" onClick={() => void saveProject()} disabled={saving === "project"}>Save</button>
				</div>
				<div className="text-xs text-ink-3">cwd: {projectConfig?.cwd ?? "..."} · merged: {projectConfig?.mergedFromProject ? "yes" : "no"}</div>
				<pre className="overflow-auto rounded-md bg-paper-2 p-3 font-mono text-2xs">{projectJson}</pre>
			</div>
		</div>
	);
}
