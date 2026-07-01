import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AgentConfigEntry } from "@omp-deck/protocol";
import { settingsApi } from "@/lib/settings-api";

const BOOL_KEYS = ["eval.py", "eval.js", "eval.rb", "eval.jl"];
const STRING_KEYS = ["python.interpreter", "ruby.interpreter", "julia.interpreter"];

export function EvalSection() {
	const { t } = useTranslation();
	const [entries, setEntries] = useState<AgentConfigEntry[]>([]);
	const [configPath, setConfigPath] = useState("");
	const [error, setError] = useState<string | undefined>();
	const [drafts, setDrafts] = useState<Record<string, string>>({});

	async function refresh() {
		try {
			const data = await settingsApi.getAgentConfig();
			setEntries(data.entries);
			setConfigPath(data.configPath);
			setError(undefined);
		} catch (e) {
			setError(String(e));
		}
	}

	useEffect(() => {
		void refresh();
	}, []);

	function get(key: string): AgentConfigEntry | undefined {
		return entries.find((e) => e.key === key);
	}

	async function put(key: string, value: boolean | string | null) {
		try {
			await settingsApi.updateAgentConfig({ [key]: value });
			setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, value } : e)));
		} catch (e) {
			setError(String(e));
		}
	}

	const kernelMode = get("python.kernelMode");

	return (
		<div className="mx-auto max-w-3xl space-y-4">
			<div>
				<h1 className="text-xl font-semibold tracking-tight">{t("settings.eval.heading")}</h1>
				<p className="mt-1 text-sm text-ink-3">{t("settings.eval.intro")}</p>
			</div>
			{error ? (
				<div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">
					{error}
				</div>
			) : null}

			<div className="divide-y divide-line overflow-hidden rounded-md border border-line bg-paper">
				{BOOL_KEYS.map((key) => {
					const e = get(key);
					if (!e) return null;
					return (
						<label key={key} className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-paper-2">
							<div className="min-w-0">
								<div className="font-mono text-xs font-medium text-ink">{key}</div>
								<div className="mt-0.5 text-xs text-ink-3">{e.description}</div>
							</div>
							<input type="checkbox" className="h-4 w-4 shrink-0" checked={e.value === true} onChange={(ev) => void put(key, ev.target.checked)} />
						</label>
					);
				})}
			</div>

			{kernelMode ? (
				<label className="block">
					<div className="meta mb-1">{t("settings.eval.kernelMode")}</div>
					<select className="field h-9 w-full px-2 text-sm" value={typeof kernelMode.value === "string" ? kernelMode.value : "session"} onChange={(ev) => void put("python.kernelMode", ev.target.value)}>
						{(kernelMode.options ?? ["session", "per-call"]).map((opt) => (
							<option key={opt} value={opt}>
								{opt}
							</option>
						))}
					</select>
				</label>
			) : null}

			{STRING_KEYS.map((key) => {
				const e = get(key);
				if (!e) return null;
				const current = typeof e.value === "string" ? e.value : "";
				const draft = drafts[key] ?? current;
				return (
					<label key={key} className="block">
						<div className="meta mb-1 font-mono">{key}</div>
						<input
							className="field h-9 w-full px-2 font-mono text-sm"
							value={draft}
							placeholder={t("settings.eval.interpreterPlaceholder")}
							onChange={(ev) => setDrafts((d) => ({ ...d, [key]: ev.target.value }))}
							onBlur={() => {
								if (draft !== current) void put(key, draft.trim() === "" ? null : draft.trim());
							}}
						/>
						<div className="mt-0.5 text-xs text-ink-3">{e.description}</div>
					</label>
				);
			})}

			<div className="rounded-md border border-line bg-paper-2 px-3 py-2 text-xs text-ink-3">{t("settings.eval.idleHint")}</div>
			<div className="rounded-md border border-line bg-paper-2 px-3 py-2 font-mono text-2xs text-ink-3">config.yml: {configPath || "..."}</div>
		</div>
	);
}
