import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Save, X } from "lucide-react";
import type { EnvEntry, ListEnvSettingsResponse } from "@omp-deck/protocol";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { settingsApi } from "@/lib/settings-api";
import { sourceLabel, sourceTone, envApplyBadge } from "@/components/settings/settings-helpers";

export function EnvSection() {
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
				<h1 className="text-xl font-semibold tracking-tight">Environment variables</h1>
				<p className="mt-1 max-w-3xl text-sm text-ink-3">
					Edits write to the deck-managed env file only. Variables from the launching process stay
					higher priority until you remove them from that shell/profile.
				</p>
			</div>

			{data?.restartRequired ? (
				<div className="flex items-center gap-3 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
					<div className="min-w-0 flex-1">
						Restart server to apply one or more restart-required values from the managed .env.
					</div>
					<Button variant="outline" size="sm" onClick={() => void restart()}>
						<RotateCcw className="h-3.5 w-3.5" />
						Restart
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

			{loading ? <div className="text-sm text-ink-3">Loading...</div> : null}
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
								Replace
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
					<div className="truncate font-mono text-xs font-semibold text-ink">{entry.key}</div>
					<div className="text-xs text-ink-3">Writes to managed .env only</div>
				</div>
				<Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
					<X className="h-4 w-4" />
				</Button>
			</div>
			<div className="space-y-3 overflow-auto p-4">
				<div className="flex flex-wrap gap-1.5">
					<Badge tone={sourceTone(entry.source)}>{sourceLabel(entry.source)}</Badge>
					{entry.sensitive ? <Badge tone="danger">secret</Badge> : null}
					{entry.restartRequired ? <Badge tone="warn">restart required</Badge> : <Badge tone="success">hot apply</Badge>}
				</div>
				<p className="text-sm text-ink-3">{entry.description}</p>
				{entry.source === "process-env" ? (
					<div className="rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
						This key is currently supplied by the launching process. Replacing it here writes the
						managed env file, but process env remains higher priority until removed upstream.
					</div>
				) : null}
				<label className="block">
					<div className="meta mb-1">New value</div>
					<input
						className="field h-9 w-full px-2 font-mono text-sm"
						type={entry.sensitive ? "password" : "text"}
						value={value}
						onChange={(e) => setValue(e.target.value)}
						placeholder={entry.sensitive ? "Paste replacement value" : entry.defaultValue ?? "Unset"}
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
					Unset
				</Button>
				<div className="flex gap-2">
					<Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
						Cancel
					</Button>
					<Button variant="primary" size="sm" onClick={() => void save(value)} disabled={saving}>
						<Save className="h-3.5 w-3.5" />
						Save
					</Button>
				</div>
			</div>
		</Modal>
	);
}
