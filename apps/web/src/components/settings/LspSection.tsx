import { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { LspConfigResponse, LspServerConfig, ProjectLspConfigResponse } from "@omp-deck/protocol";
import { settingsApi } from "@/lib/settings-api";
import { ServerCard, type ServerCardField } from "./ServerCard";

const LSP_FIELDS: ServerCardField[] = [
	{ key: "command", label: "Command", type: "text", placeholder: "clangd" },
	{ key: "args", label: "Args", type: "stringList", placeholder: "--log=error" },
	{ key: "fileTypes", label: "File Types", type: "stringList", placeholder: ".c,.cpp,.h" },
	{ key: "rootMarkers", label: "Root Markers", type: "stringList", placeholder: "CMakeLists.txt" },
	{ key: "disabled", label: "Disabled", type: "toggle" },
	{ key: "warmupTimeoutMs", label: "Warmup Timeout (ms)", type: "text", placeholder: "30000" },
	{ key: "isLinter", label: "Is Linter", type: "toggle" },
	{ key: "initOptions", label: "Init Options", type: "json", placeholder: "{}", advanced: true },
	{ key: "settings", label: "Settings", type: "json", placeholder: "{}", advanced: true },
	{ key: "capabilities", label: "Capabilities", type: "json", placeholder: '{"flycheck": true}', advanced: true },
	{ key: "workspaceReadyTimings", label: "Workspace Ready Timings", type: "json", placeholder: "{}", advanced: true },
];

function getCwd(): string {
	return (globalThis as Record<string, unknown>).__OMP_DEFAULT_CWD__ as string ?? globalThis.location?.pathname ?? ".";
}

export function LspSection() {
	const { t } = useTranslation();
	const [globalConfig, setGlobalConfig] = useState<LspConfigResponse | null>(null);
	const [projectConfig, setProjectConfig] = useState<ProjectLspConfigResponse | null>(null);
	const [error, setError] = useState<string | undefined>();
	const [saving, setSaving] = useState<"global" | "project" | undefined>();

	const cwd = useMemo(() => getCwd(), []);

	const refresh = useCallback(async () => {
		try {
			const [global, project] = await Promise.all([
				settingsApi.getLspConfig(),
				settingsApi.getWorkspaceLsp(cwd),
			]);
			setGlobalConfig(global);
			setProjectConfig(project);
			setError(undefined);
		} catch (e) {
			setError(String(e));
		}
	}, [cwd]);

	useEffect(() => { void refresh(); }, [refresh]);

	async function saveGlobal() {
		if (!globalConfig) return;
		setSaving("global");
		try {
			await settingsApi.updateLspConfig({ servers: globalConfig.servers as Record<string, LspServerConfig>, idleTimeoutMs: globalConfig.idleTimeoutMs ?? null });
		} finally {
			setSaving(undefined);
		}
	}

	async function saveProject() {
		if (!projectConfig) return;
		setSaving("project");
		try {
			await settingsApi.updateWorkspaceLsp(projectConfig.cwd, { servers: projectConfig.servers as Record<string, LspServerConfig>, idleTimeoutMs: projectConfig.idleTimeoutMs ?? null });
		} finally {
			setSaving(undefined);
		}
	}

	function updateServer(scope: "global" | "project", name: string, server: Record<string, unknown>) {
		if (scope === "global" && globalConfig) {
			setGlobalConfig({ ...globalConfig, servers: { ...globalConfig.servers, [name]: server as unknown as LspServerConfig } });
		} else if (scope === "project" && projectConfig) {
			setProjectConfig({ ...projectConfig, servers: { ...projectConfig.servers, [name]: server as unknown as LspServerConfig } });
		}
	}

	function removeServer(scope: "global" | "project", name: string) {
		if (scope === "global" && globalConfig) {
			const servers = { ...globalConfig.servers };
			delete servers[name];
			setGlobalConfig({ ...globalConfig, servers });
		} else if (scope === "project" && projectConfig) {
			const servers = { ...projectConfig.servers };
			delete servers[name];
			setProjectConfig({ ...projectConfig, servers });
		}
	}

	const serverNames = (servers: Record<string, unknown>) => Object.keys(servers).sort();

	return (
		<div className="mx-auto max-w-3xl space-y-4">
			<div>
				<h1 className="text-xl font-semibold tracking-tight">{t("settings.lsp.heading")}</h1>
				<p className="mt-1 text-sm text-ink-3">{t("settings.lsp.intro")}</p>
			</div>
			{error ? <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">{error}</div> : null}

			{/* Global LSP */}
			<div className="space-y-3 rounded-md border border-line bg-paper p-3">
				<div className="flex items-center justify-between">
					<div>
						<div className="font-mono text-xs font-medium uppercase tracking-meta">Global LSP</div>
						<div className="text-xs text-ink-3">{globalConfig?.configPath ?? "..."}</div>
					</div>
					<button className="rounded-md border border-line px-2 py-1 text-xs" onClick={() => void saveGlobal()} disabled={saving === "global" || !globalConfig}>
						{t("common.actions.save", "Save")}
					</button>
				</div>
				{globalConfig && serverNames(globalConfig.servers as Record<string, unknown>).map((name) => (
					<ServerCard
						key={name}
						serverName={name}
						server={globalConfig.servers[name] as unknown as Record<string, unknown>}
						fields={LSP_FIELDS}
						onUpdate={(n, s) => updateServer("global", n, s)}
						onRemove={(n) => removeServer("global", n)}
					/>
				))}
			</div>

			{/* Workspace LSP */}
			<div className="space-y-3 rounded-md border border-line bg-paper p-3">
				<div className="flex items-center justify-between">
					<div>
						<div className="font-mono text-xs font-medium uppercase tracking-meta">Workspace LSP</div>
						<div className="text-xs text-ink-3">{projectConfig?.projectConfigPath ?? "..."}</div>
					</div>
					<button className="rounded-md border border-line px-2 py-1 text-xs" onClick={() => void saveProject()} disabled={saving === "project" || !projectConfig}>
						{t("common.actions.save", "Save")}
					</button>
				</div>
				<div className="text-xs text-ink-3">cwd: {projectConfig?.cwd ?? "..."} · merged: {projectConfig?.mergedFromProject ? "yes" : "no"}</div>
				{projectConfig && serverNames(projectConfig.servers as Record<string, unknown>).map((name) => (
					<ServerCard
						key={name}
						serverName={name}
						server={projectConfig.servers[name] as unknown as Record<string, unknown>}
						fields={LSP_FIELDS}
						onUpdate={(n, s) => updateServer("project", n, s)}
						onRemove={(n) => removeServer("project", n)}
					/>
				))}
			</div>
		</div>
	);
}
