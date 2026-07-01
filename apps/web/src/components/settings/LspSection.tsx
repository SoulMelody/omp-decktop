import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AgentConfigEntry } from "@omp-deck/protocol";
import { settingsApi } from "@/lib/settings-api";

const LSP_KEYS = [
	"lsp.enabled",
	"lsp.lazy",
	"lsp.formatOnWrite",
	"lsp.diagnosticsOnWrite",
	"lsp.diagnosticsOnEdit",
	"lsp.diagnosticsDeduplicate",
];

export function LspSection() {
	const { t } = useTranslation();
	const [entries, setEntries] = useState<AgentConfigEntry[]>([]);
	const [configPath, setConfigPath] = useState("");
	const [error, setError] = useState<string | undefined>();
	const [saving, setSaving] = useState<string | undefined>();

	async function refresh() {
		try {
			const data = await settingsApi.getAgentConfig();
			setEntries(data.entries.filter((e) => LSP_KEYS.includes(e.key)));
			setConfigPath(data.configPath);
			setError(undefined);
		} catch (e) {
			setError(String(e));
		}
	}

	useEffect(() => {
		void refresh();
	}, []);

	async function toggle(key: string, next: boolean) {
		setSaving(key);
		try {
			await settingsApi.updateAgentConfig({ [key]: next });
			setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, value: next } : e)));
		} catch (e) {
			setError(String(e));
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
			{error ? (
				<div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">
					{error}
				</div>
			) : null}
			<div className="divide-y divide-line overflow-hidden rounded-md border border-line bg-paper">
				{entries.map((entry) => (
					<label key={entry.key} className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-paper-2">
						<div className="min-w-0">
							<div className="font-mono text-xs font-medium text-ink">{entry.key}</div>
							<div className="mt-0.5 text-xs text-ink-3">{entry.description}</div>
						</div>
						<input type="checkbox" className="h-4 w-4 shrink-0" disabled={saving === entry.key} checked={entry.value === true} onChange={(e) => void toggle(entry.key, e.target.checked)} />
					</label>
				))}
			</div>
			<div className="rounded-md border border-line bg-paper-2 px-3 py-2 font-mono text-2xs text-ink-3">
				config.yml: {configPath || "..."}
			</div>
		</div>
	);
}
