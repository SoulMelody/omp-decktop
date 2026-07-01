import { useEffect, useMemo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { FolderPlus, RotateCcw, Save, Trash2, X } from "lucide-react";
import type { EnvEntry, ListEnvSettingsResponse } from "@omp-deck/protocol";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { settingsApi } from "@/lib/settings-api";
import { sourceLabel, sourceTone, envApplyBadge } from "@/components/settings/settings-helpers";

export function EnvSection() {
	const { t } = useTranslation();
	const [data, setData] = useState<ListEnvSettingsResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | undefined>();
	const [editing, setEditing] = useState<EnvEntry | null>(null);
	const [restartMessage, setRestartMessage] = useState<string | undefined>();

	async function refresh(): Promise<void> {
		try {
			const next = await settingsApi.listEnv();
			setData(next);
			setError(undefined);
		} catch (e) {
			setError(String(e));
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		void refresh();
	}, []);

	const grouped = useMemo(() => {
		const entries = data?.entries ?? [];
		const isDeckKey = (key: string) =>
			key.startsWith("OMP_DECK_") ||
			key === "OMP_AGENT_DIR" ||
			key === "LOG_LEVEL" ||
			key === "PI_NO_TITLE" ||
			key === "OMP_MODEL";
		const isMessagingKey = (key: string) => key.startsWith("TELEGRAM_") || key.startsWith("SLACK_");
		return {
			deck: entries.filter((e) => isDeckKey(e.key)),
			messaging: entries.filter((e) => isMessagingKey(e.key)),
			sdk: entries.filter((e) => !isDeckKey(e.key) && !isMessagingKey(e.key)),
		};
	}, [data]);

	async function restart(): Promise<void> {
		try {
			const resp = await settingsApi.restartServer();
			setRestartMessage(resp.message || "Restart scheduled");
		} catch (e) {
			setError(String(e));
		}
	}

	return (
		<div className="mx-auto max-w-6xl space-y-4">
			<div>
				<h1 className="text-xl font-semibold tracking-tight">{t("settings.env.heading")}</h1>
				<p className="mt-1 max-w-3xl text-sm text-ink-3">
					{t("settings.env.intro")}
				</p>
			</div>

			{data?.restartRequired ? (
				<div className="flex items-center gap-3 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
					<div className="min-w-0 flex-1">{t("settings.env.restartHint")}</div>
					<Button variant="outline" size="sm" onClick={() => void restart()}>
						<RotateCcw className="h-3.5 w-3.5" />
						{t("common.actions.restart")}
					</Button>
				</div>
			) : null}
			{restartMessage ? (
				<div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 font-mono text-xs text-success">
					{restartMessage}
				</div>
			) : null}
			{error ? (
				<div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">
					{error}
				</div>
			) : null}

			<div className="rounded-md border border-line bg-paper-2 px-3 py-2 font-mono text-2xs text-ink-3">
				<div>dataDir: {data?.dataDir ?? "..."}</div>
				<div>envFile: {data?.envFilePath ?? "..."}</div>
			</div>

			{data ? <WorkspaceQuickCard data={data} onRefresh={() => void refresh()} onError={setError} /> : null}

			{loading ? <div className="text-sm text-ink-3">{t("common.status.loading")}</div> : null}
			{data ? (
				<>
					<EnvTable title="omp-deck" entries={grouped.deck} onEdit={setEditing} />
					<EnvTable title="messaging bridges" entries={grouped.messaging} onEdit={setEditing} />
					<EnvTable title="omp SDK / providers" entries={grouped.sdk} onEdit={setEditing} />
				</>
			) : null}

			<EditEnvModal
				entry={editing}
				onClose={() => setEditing(null)}
				onSaved={(next) => {
					setData(next);
					setEditing(null);
				}}
			/>
		</div>
	);
}

export function EnvTable({
	title,
	entries,
	onEdit,
}: {
	title: string;
	entries: EnvEntry[];
	onEdit: (entry: EnvEntry) => void;
}) {
	const { t } = useTranslation();
	return (
		<div className="overflow-hidden rounded-md border border-line bg-paper">
			<div className="border-b border-line bg-paper-2 px-3 py-2">
				<div className="meta">{title}</div>
			</div>
			<div className="divide-y divide-line">
				{entries.map((entry) => (
					<div key={entry.key} className="grid grid-cols-[220px_1fr_120px_100px] gap-3 px-3 py-2 text-sm">
						<div className="min-w-0">
							<div className="truncate font-mono text-xs font-medium text-ink">{entry.key}</div>
							<div className="mt-0.5 text-xs text-ink-4">{entry.valueType}</div>
						</div>
						<div className="min-w-0">
							<div className="truncate font-mono text-xs text-ink-2">{entry.masked}</div>
							<div className="mt-0.5 truncate text-xs text-ink-3">{entry.description}</div>
						</div>
						<div className="flex flex-col items-start gap-1">
							<Badge tone={sourceTone(entry.source)}>{sourceLabel(entry.source)}</Badge>
							{envApplyBadge(entry)}
						</div>
						<div className="flex justify-end">
							<Button variant="outline" size="sm" onClick={() => onEdit(entry)}>
								{t("common.actions.replace")}
							</Button>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

export function EditEnvModal({
	entry,
	onClose,
	onSaved,
}: {
	entry: EnvEntry | null;
	onClose: () => void;
	onSaved: (next: ListEnvSettingsResponse) => void;
}) {
	const { t } = useTranslation();
	const [value, setValue] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | undefined>();

	useEffect(() => {
		if (!entry) return;
		setValue(entry.sensitive ? "" : entry.source === "unset" ? "" : entry.masked);
		setError(undefined);
	}, [entry]);

	if (!entry) return null;

	async function save(nextValue: string | null): Promise<void> {
		if (!entry) return;
		setSaving(true);
		try {
			const next = await settingsApi.patchEnv({ [entry.key]: nextValue });
			onSaved(next);
		} catch (e) {
			setError(String(e));
		} finally {
			setSaving(false);
		}
	}

	return (
		<Modal open={Boolean(entry)} onClose={onClose} widthClass="max-w-xl">
			<div className="flex h-11 items-center gap-2 border-b border-line px-3">
				<div className="min-w-0 flex-1">
					<div className="text-xs text-ink-3">{t("settings.env.writesTo")}</div>
				</div>
				<Button variant="ghost" size="icon" onClick={onClose} aria-label={t("common.actions.close")}>
					<X className="h-4 w-4" />
				</Button>
			</div>
			<div className="space-y-3 overflow-auto p-4">
				<div className="flex flex-wrap gap-1.5">
					<Badge tone={sourceTone(entry.source)}>{sourceLabel(entry.source)}</Badge>
					{entry.sensitive ? <Badge tone="danger">{t("settings.env.secret")}</Badge> : null}
					{entry.restartRequired ? <Badge tone="warn">{t("settings.env.restartRequired")}</Badge> : <Badge tone="success">{t("settings.env.hotApply")}</Badge>}
				</div>
				<p className="text-sm text-ink-3">{entry.description}</p>
				{entry.source === "process-env" ? (
					<div className="rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
						{t("settings.env.processEnv")}
					</div>
				) : null}
				<label className="block">
					<div className="meta mb-1">{t("settings.env.newValue")}</div>
					<input
						className="field h-9 w-full px-2 font-mono text-sm"
						type={entry.sensitive ? "password" : "text"}
						value={value}
						onChange={(e) => setValue(e.target.value)}
						placeholder={entry.sensitive ? t("settings.env.pasteValue") : entry.defaultValue ?? t("settings.env.unset")}
					/>
				</label>
				{entry.options ? (
					<div className="text-xs text-ink-3">Allowed: {entry.options.join(", ")}</div>
				) : null}
				{error ? (
					<div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">
						{error}
					</div>
				) : null}
			</div>
			<div className="flex items-center justify-between gap-2 border-t border-line px-3 py-3">
				<Button variant="danger" size="sm" disabled={saving} onClick={() => void save(null)}>
					{t("common.actions.unset")}
				</Button>
				<div className="flex gap-2">
					<Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
						{t("common.actions.cancel")}
					</Button>
					<Button variant="primary" size="sm" onClick={() => void save(value)} disabled={saving}>
						<Save className="h-3.5 w-3.5" />
						{t("common.actions.save")}
					</Button>
				</div>
			</div>
		</Modal>
	);
}

const WORKSPACES_KEY = "OMP_DECK_WORKSPACES";

/**
 * Quick-add/remove workspace paths without digging through the full env table.
 * Reads/writes OMP_DECK_WORKSPACES via the same patchEnv path.
 */
function WorkspaceQuickCard({
	data,
	onRefresh,
	onError,
}: {
	data: ListEnvSettingsResponse;
	onRefresh: () => void;
	onError: (msg: string | undefined) => void;
}) {
	const [adding, setAdding] = useState(false);
	const [newPath, setNewPath] = useState("");
	const [saving, setSaving] = useState(false);

	const entry = data.entries.find((e) => e.key === WORKSPACES_KEY);
	const raw = entry?.masked ?? "";
	const paths = raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);

	async function add(path: string): Promise<void> {
		const trimmed = path.trim();
		if (!trimmed) return;
		if (paths.some((p) => p.toLowerCase() === trimmed.toLowerCase())) {
			onError("This workspace path already exists.");
			return;
		}
		setSaving(true);
		onError(undefined);
		try {
			await settingsApi.patchEnv({ [WORKSPACES_KEY]: [...paths, trimmed].join(",") });
			setNewPath("");
			setAdding(false);
			onRefresh();
		} catch (e) {
			onError(String(e));
		} finally {
			setSaving(false);
		}
	}

	async function remove(idx: number): Promise<void> {
		setSaving(true);
		onError(undefined);
		try {
			const next = paths.filter((_, i) => i !== idx);
			await settingsApi.patchEnv({ [WORKSPACES_KEY]: next.length > 0 ? next.join(",") : null });
			onRefresh();
		} catch (e) {
			onError(String(e));
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="rounded-md border border-accent/20 bg-accent-soft/20 px-3 py-2.5">
			<div className="flex items-center justify-between gap-2">
				<div>
					<div className="font-mono text-xs font-medium text-ink">
						{WORKSPACES_KEY}
					</div>
					<div className="mt-0.5 text-xs text-ink-3">
						Comma-separated workspace root paths. Changes take effect on next refresh.
					</div>
				</div>
				<Button
					size="sm"
					variant="outline"
					disabled={adding || saving}
					onClick={() => setAdding(true)}
				>
					<FolderPlus className="h-3.5 w-3.5" />
					Add
				</Button>
			</div>

			{paths.length > 0 ? (
				<div className="mt-2 flex flex-wrap gap-1.5">
					{paths.map((p, i) => (
						<span
							key={`${p}-${i}`}
							className="inline-flex items-center gap-1 rounded bg-paper border border-line px-2 py-0.5 font-mono text-xs text-ink-2"
						>
							<span className="max-w-[360px] truncate">{p}</span>
							<button
								type="button"
								className="text-ink-4 hover:text-danger transition-colors"
								disabled={saving}
								onClick={() => void remove(i)}
								aria-label={`Remove ${p}`}
							>
								<X className="h-3 w-3" />
							</button>
						</span>
					))}
				</div>
			) : (
				<div className="mt-2 font-mono text-xs text-ink-4">
					(unset) — only the default workspace is active.
				</div>
			)}

			{adding ? (
				<div className="mt-2 flex gap-2">
					<input
						className="field h-8 flex-1 px-2 font-mono text-xs"
						type="text"
						value={newPath}
						onChange={(e) => setNewPath(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") void add(newPath);
							if (e.key === "Escape") {
								setAdding(false);
								setNewPath("");
							}
						}}
						placeholder="C:\Users\you\projects\my-repo"
						autoFocus
					/>
					<Button size="sm" variant="primary" disabled={saving || !newPath.trim()} onClick={() => void add(newPath)}>
						Save
					</Button>
					<Button
						size="sm"
						variant="ghost"
						disabled={saving}
						onClick={() => {
							setAdding(false);
							setNewPath("");
						}}
					>
						Cancel
					</Button>
				</div>
			) : null}
		</div>
	);
}
