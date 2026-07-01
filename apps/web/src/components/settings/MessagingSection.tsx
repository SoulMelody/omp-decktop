import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Play, RotateCcw, Square } from "lucide-react";
import type { BridgeInfo, BridgeName, EnvEntry, ListEnvSettingsResponse } from "@omp-deck/protocol";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { bridgesApi } from "@/lib/bridges-api";
import { settingsApi } from "@/lib/settings-api";
import { cn } from "@/lib/utils";
import {
	sourceLabel,
	sourceTone,
	envApplyBadge,
	bridgeStatusTone,
	bridgeStatusLabel,
	formatUptime,
} from "@/components/settings/settings-helpers";
import { EnvTable, EditEnvModal } from "@/components/settings/EnvSection";
export function MessagingSection() {
	const { t } = useTranslation();
	const [data, setData] = useState<ListEnvSettingsResponse | null>(null);
	const [bridges, setBridges] = useState<BridgeInfo[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | undefined>();
	const [editing, setEditing] = useState<EnvEntry | null>(null);

	async function refresh(): Promise<void> {
		try {
			const [envResp, bridgeResp] = await Promise.all([settingsApi.listEnv(), bridgesApi.list()]);
			setData(envResp);
			setBridges(bridgeResp.bridges);
			setError(undefined);
		} catch (e) {
			setError(String(e));
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		void refresh();
		const id = window.setInterval(() => {
			if (document.visibilityState === "visible") void refresh();
		}, 4000);
		return () => window.clearInterval(id);
	}, []);

	const entries = data?.entries ?? [];
	const telegramToken = entries.find((entry) => entry.key === "TELEGRAM_BOT_TOKEN");
	const telegramAllowed = entries.find((entry) => entry.key === "TELEGRAM_ALLOWED_USERS");
	const telegramDb = entries.find((entry) => entry.key === "TELEGRAM_BRIDGE_DB_PATH");
	const telegramInfo = bridges.find((b) => b.name === "telegram");

	function applyBridge(next: BridgeInfo): void {
		setBridges((prev) => {
			const idx = prev.findIndex((b) => b.name === next.name);
			if (idx === -1) return [...prev, next];
			const out = prev.slice();
			out[idx] = next;
			return out;
		});
	}

	return (
		<div className="mx-auto max-w-5xl space-y-4">
			<div>
				<h1 className="text-xl font-semibold tracking-tight">{t("settings.messaging.heading")}</h1>
				<p className="mt-1 max-w-3xl text-sm text-ink-3">
					{t("settings.messaging.intro")}
				</p>
			</div>

			{error ? (
				<div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">
					{error}
				</div>
			) : null}
			{loading ? <div className="text-sm text-ink-3">{t("common.status.loading")}</div> : null}
			<BridgeCard
				title="Telegram"
				description="DM-only long-poll bridge to local omp-deck."
				info={telegramInfo}
				credentialRows={[
					{ label: t("settings.messaging.botToken"), entry: telegramToken },
					{ label: t("settings.messaging.allowedUsers"), entry: telegramAllowed },
					{ label: "Mapping DB path", entry: telegramDb },
				]}
				onEdit={setEditing}
				onApplyBridge={applyBridge}
				onError={setError}
			/>

			<div className="rounded-md border border-dashed border-line bg-paper-2 p-4">
				<div className="meta">Slack</div>
				<p className="mt-1 text-sm text-ink-3">
					{t("settings.messaging.reserved")}
				</p>
			</div>

			<EditEnvModal
				entry={editing}
				onClose={() => setEditing(null)}
				onSaved={(next) => {
					setData(next);
					setEditing(null);
					void refresh();
				}}
			/>
		</div>
	);
}

function BridgeCard({
	title,
	description,
	info,
	credentialRows,
	onEdit,
	onApplyBridge,
	onError,
}: {
	title: string;
	description: string;
	info: BridgeInfo | undefined;
	credentialRows: Array<{ label: string; entry: EnvEntry | undefined }>;
	onEdit: (entry: EnvEntry) => void;
	onApplyBridge: (next: BridgeInfo) => void;
	onError: (message: string | undefined) => void;
}) {
	const { t } = useTranslation();
	const [busy, setBusy] = useState<"start" | "stop" | "restart" | undefined>();

	async function run(action: "start" | "stop" | "restart", name: BridgeName): Promise<void> {
		setBusy(action);
		onError(undefined);
		try {
			const next = await bridgesApi[action](name);
			onApplyBridge(next);
		} catch (e) {
			onError(String((e as Error).message ?? e));
		} finally {
			setBusy(undefined);
		}
	}

	const status = info?.status ?? "stopped";
	const missing = info?.missingEnv ?? [];
	const canStart = status !== "running" && status !== "starting" && missing.length === 0;
	const canStop = status === "running" || status === "starting";
	const canRestart = status === "running";

	return (
		<div className="overflow-hidden rounded-md border border-line bg-paper">
			<div className="flex items-center justify-between gap-3 border-b border-line bg-paper-2 px-3 py-2">
				<div>
					<div className="meta">{title}</div>
					<div className="mt-0.5 text-xs text-ink-3">{description}</div>
				</div>
				<div className="flex items-center gap-2">
					<Badge tone={bridgeStatusTone(status)}>{bridgeStatusLabel(status, info)}</Badge>
				</div>
			</div>
			<div className="space-y-3 p-3">
				{missing.length > 0 ? (
					<div className="rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
						{t("settings.messaging.missingEnv")} <span className="font-mono">{missing.join(", ")}</span>. Set
						these below before starting the bridge.
					</div>
				) : null}
				{info?.lastError ? (
					<div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">
						{info.lastError}
					</div>
				) : null}
				<div className="flex flex-wrap items-center gap-2">
					<Button
						variant="primary"
						size="sm"
						disabled={!canStart || busy !== undefined}
						onClick={() => info && void run("start", info.name)}
					>
						<Play className="h-3.5 w-3.5" />
						{busy === "start" ? "Starting..." : t("common.actions.start")}
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={!canStop || busy !== undefined}
						onClick={() => info && void run("stop", info.name)}
					>
						<Square className="h-3.5 w-3.5" />
						{busy === "stop" ? "Stopping..." : t("common.actions.stop")}
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={!canRestart || busy !== undefined}
						onClick={() => info && void run("restart", info.name)}
					>
						<RotateCcw className="h-3.5 w-3.5" />
						{busy === "restart" ? "Restarting..." : t("common.actions.restart")}
					</Button>
					{info ? <BridgeMeta info={info} /> : null}
				</div>
				<div className="divide-y divide-line rounded-md border border-line">
					{credentialRows.map((row) => (
						<MessagingCredentialRow key={row.label} label={row.label} entry={row.entry} onEdit={onEdit} />
					))}
				</div>
				{info ? <BridgeLogsPanel name={info.name} /> : null}
			</div>
		</div>
	);
}

function BridgeMeta({ info }: { info: BridgeInfo }) {
	const parts: string[] = [];
	if (info.status === "running") {
		if (info.pid !== undefined) parts.push(`pid ${info.pid}`);
		if (info.startedAt) parts.push(`up ${formatUptime(info.startedAt)}`);
	} else if (info.exitCode !== undefined) {
		parts.push(`exit ${info.exitCode}`);
	}
	if (info.crashCount > 0) parts.push(`crashes ${info.crashCount}`);
	if (parts.length === 0) return null;
	return <div className="font-mono text-2xs text-ink-3">{parts.join(" · ")}</div>;
}

function BridgeLogsPanel({ name }: { name: BridgeName }) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const [lines, setLines] = useState<Array<{ stream: string; text: string; timestamp: string }>>([]);
	const [fetching, setFetching] = useState(false);

	async function load(): Promise<void> {
		setFetching(true);
		try {
			const resp = await bridgesApi.logs(name);
			setLines(resp.lines);
		} catch (e) {
			setLines([{ stream: "stderr", text: String(e), timestamp: new Date().toISOString() }]);
		} finally {
			setFetching(false);
		}
	}

	useEffect(() => {
		if (!open) return;
		void load();
		const id = window.setInterval(() => {
			if (document.visibilityState === "visible") void load();
		}, 2500);
		return () => window.clearInterval(id);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, name]);

	return (
		<div className="rounded-md border border-line bg-paper-2">
			<button
				type="button"
				className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-ink-2 hover:bg-paper-3"
				onClick={() => setOpen((v) => !v)}
			>
				<span className="font-mono text-2xs text-ink-3">{open ? "hide" : "show"}</span>
			</button>
			{open ? (
				<div className="max-h-64 overflow-auto border-t border-line bg-paper p-2 font-mono text-2xs">
					{fetching && lines.length === 0 ? <div className="text-ink-3">{t("common.status.loading")}</div> : null}
					{!fetching && lines.length === 0 ? <div className="text-ink-3">{t("settings.messaging.noLogLines")}</div> : null}
					{lines.map((line, idx) => (
						<div
							key={`${line.timestamp}-${idx}`}
							className={cn("whitespace-pre-wrap", line.stream === "stderr" ? "text-danger" : "text-ink-2")}
						>
							{line.text}
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}

function MessagingCredentialRow({
	label,
	entry,
	onEdit,
}: {
	label: string;
	entry: EnvEntry | undefined;
	onEdit: (entry: EnvEntry) => void;
}) {
	const { t } = useTranslation();
	return (
		<div className="grid grid-cols-[160px_1fr_120px] items-center gap-3 px-3 py-2 text-sm">
			<div>
				<div className="font-medium text-ink">{label}</div>
				<div className="font-mono text-2xs text-ink-4">{entry?.key ?? "missing schema"}</div>
			</div>
			<div className="min-w-0">
				<div className="truncate font-mono text-xs text-ink-2">{entry?.masked ?? "unavailable"}</div>
				<div className="mt-0.5 flex flex-wrap gap-1">
					{entry ? <Badge tone={sourceTone(entry.source)}>{sourceLabel(entry.source)}</Badge> : null}
					{entry ? envApplyBadge(entry) : null}
				</div>
			</div>
			<div className="flex justify-end">
				<Button variant="outline" size="sm" disabled={!entry} onClick={() => entry && onEdit(entry)}>
					{t("common.actions.replace")}
				</Button>
			</div>
		</div>
	);
}
