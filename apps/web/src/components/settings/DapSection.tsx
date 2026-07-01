import { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { DapAdapterConfig, DapConfigResponse, ProjectDapConfigResponse } from "@omp-deck/protocol";
import { settingsApi } from "@/lib/settings-api";
import { ServerCard, type ServerCardField } from "./ServerCard";

const DAP_FIELDS: ServerCardField[] = [
	{ key: "command", label: "Command", type: "text", placeholder: "gdb" },
	{ key: "args", label: "Args", type: "stringList", placeholder: "-i dap" },
	{ key: "languages", label: "Languages", type: "stringList", placeholder: "c,cpp,rust" },
	{ key: "fileTypes", label: "File Types", type: "stringList", placeholder: ".c,.cpp,.h" },
	{ key: "rootMarkers", label: "Root Markers", type: "stringList", placeholder: "Cargo.toml" },
	{ key: "connectMode", label: "Connect Mode", type: "select", options: ["stdio", "socket"] },
	{ key: "acceptsDirectoryProgram", label: "Accepts Directory Program", type: "toggle" },
	{ key: "launchDefaults", label: "Launch Defaults", type: "json", placeholder: "{}", advanced: true },
	{ key: "attachDefaults", label: "Attach Defaults", type: "json", placeholder: "{}", advanced: true },
];

function getCwd(): string {
	return (globalThis as Record<string, unknown>).__OMP_DEFAULT_CWD__ as string ?? globalThis.location?.pathname ?? ".";
}

export function DapSection() {
	const { t } = useTranslation();
	const [globalConfig, setGlobalConfig] = useState<DapConfigResponse | null>(null);
	const [projectConfig, setProjectConfig] = useState<ProjectDapConfigResponse | null>(null);
	const [error, setError] = useState<string | undefined>();
	const [saving, setSaving] = useState<"global" | "project" | undefined>();

	const cwd = useMemo(() => getCwd(), []);

	const refresh = useCallback(async () => {
		try {
			const [global, project] = await Promise.all([
				settingsApi.getDapConfig(),
				settingsApi.getWorkspaceDap(cwd),
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
			await settingsApi.updateDapConfig({ adapters: globalConfig.adapters as Record<string, DapAdapterConfig> });
		} finally {
			setSaving(undefined);
		}
	}

	async function saveProject() {
		if (!projectConfig) return;
		setSaving("project");
		try {
			await settingsApi.updateWorkspaceDap(projectConfig.cwd, { adapters: projectConfig.adapters as Record<string, DapAdapterConfig> });
		} finally {
			setSaving(undefined);
		}
	}

	function updateAdapter(scope: "global" | "project", name: string, adapter: Record<string, unknown>) {
		if (scope === "global" && globalConfig) {
			setGlobalConfig({ ...globalConfig, adapters: { ...globalConfig.adapters, [name]: adapter as unknown as DapAdapterConfig } });
		} else if (scope === "project" && projectConfig) {
			setProjectConfig({ ...projectConfig, adapters: { ...projectConfig.adapters, [name]: adapter as unknown as DapAdapterConfig } });
		}
	}

	function removeAdapter(scope: "global" | "project", name: string) {
		if (scope === "global" && globalConfig) {
			const adapters = { ...globalConfig.adapters };
			delete adapters[name];
			setGlobalConfig({ ...globalConfig, adapters });
		} else if (scope === "project" && projectConfig) {
			const adapters = { ...projectConfig.adapters };
			delete adapters[name];
			setProjectConfig({ ...projectConfig, adapters });
		}
	}

	const newAdapterDefaults: Record<string, unknown> = { command: "", languages: [], fileTypes: [], rootMarkers: [] };

	function addAdapter(scope: "global" | "project") {
		const name = window.prompt("Adapter name:");
		if (!name) return;
		if (scope === "global" && globalConfig) {
			if (globalConfig.adapters[name]) { setError(`Adapter "${name}" already exists`); return; }
			setGlobalConfig({ ...globalConfig, adapters: { ...globalConfig.adapters, [name]: { ...newAdapterDefaults } as unknown as DapAdapterConfig } });
		} else if (scope === "project" && projectConfig) {
			if (projectConfig.adapters[name]) { setError(`Adapter "${name}" already exists`); return; }
			setProjectConfig({ ...projectConfig, adapters: { ...projectConfig.adapters, [name]: { ...newAdapterDefaults } as unknown as DapAdapterConfig } });
		}
	}

	const adapterNames = (adapters: Record<string, unknown>) => Object.keys(adapters).sort();

	return (
		<div className="mx-auto max-w-3xl space-y-4">
			<div>
				<h1 className="text-xl font-semibold tracking-tight">{t("settings.dap.heading", "Debug Adapters")}</h1>
				<p className="mt-1 text-sm text-ink-3">{t("settings.dap.intro", "Debug adapter configuration for the DAP debug tool.")}</p>
			</div>
			{error ? <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">{error}</div> : null}

			{/* Global DAP */}
			<div className="space-y-3 rounded-md border border-line bg-paper p-3">
				<div className="flex items-center justify-between">
					<div>
						<div className="font-mono text-xs font-medium uppercase tracking-meta">Global DAP</div>
						<div className="text-xs text-ink-3">{globalConfig?.configPath ?? "..."}</div>
					</div>
					<div className="flex items-center gap-2">
						<button className="rounded-md border border-line px-2 py-1 text-xs" onClick={() => addAdapter("global")}>
							+ Add
						</button>
						<button className="rounded-md border border-line px-2 py-1 text-xs" onClick={() => void saveGlobal()} disabled={saving === "global" || !globalConfig}>
							{t("common.actions.save", "Save")}
						</button>
					</div>
				</div>
				{globalConfig && adapterNames(globalConfig.adapters as Record<string, unknown>).map((name) => (
					<ServerCard
						key={name}
						serverName={name}
						server={globalConfig.adapters[name] as unknown as Record<string, unknown>}
						fields={DAP_FIELDS}
						onUpdate={(n, s) => updateAdapter("global", n, s)}
						onRemove={(n) => removeAdapter("global", n)}
					/>
				))}
			</div>

			{/* Workspace DAP */}
			<div className="space-y-3 rounded-md border border-line bg-paper p-3">
				<div className="flex items-center justify-between">
					<div>
						<div className="font-mono text-xs font-medium uppercase tracking-meta">Workspace DAP</div>
						<div className="text-xs text-ink-3">{projectConfig?.projectConfigPath ?? "..."}</div>
					</div>
					<div className="flex items-center gap-2">
						<button className="rounded-md border border-line px-2 py-1 text-xs" onClick={() => addAdapter("project")}>
							+ Add
						</button>
						<button className="rounded-md border border-line px-2 py-1 text-xs" onClick={() => void saveProject()} disabled={saving === "project" || !projectConfig}>
							{t("common.actions.save", "Save")}
						</button>
					</div>
				</div>
				<div className="text-xs text-ink-3">cwd: {projectConfig?.cwd ?? "..."} · merged: {projectConfig?.mergedFromProject ? "yes" : "no"}</div>
				{projectConfig && adapterNames(projectConfig.adapters as Record<string, unknown>).map((name) => (
					<ServerCard
						key={name}
						serverName={name}
						server={projectConfig.adapters[name] as unknown as Record<string, unknown>}
						fields={DAP_FIELDS}
						onUpdate={(n, s) => updateAdapter("project", n, s)}
						onRemove={(n) => removeAdapter("project", n)}
					/>
				))}
			</div>
		</div>
	);
}
