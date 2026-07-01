import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import type {
	EnvEntry,
	GateKnob,
	MaintenanceGateState,
	PreludeResponse,
	StartCommand,
} from "@omp-deck/protocol";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { orientationApi } from "@/lib/orientation-api";
import { settingsApi } from "@/lib/settings-api";

/**
 * Orientation section — surfaces the three artifacts that shape every deck
 * session so non-developer users can view and tweak them without touching
 * server source. See kb://system/imperatives-belong-in-orchestrator-not-prelude
 * for the prelude-vs-orchestrator architecture that motivated this surface.
 */
export function OrientationSection() {
	const { t } = useTranslation();
	return (
		<div className="mx-auto max-w-5xl space-y-6">
			<div>
				<h1 className="text-xl font-semibold tracking-tight">{t("settings.orientation.heading")}</h1>
				<p className="mt-1 max-w-3xl text-sm text-ink-3">
					{t("settings.orientation.intro")}
				</p>
			</div>
			<PreludeCard />
			<StartCommandCard />
			<MaintenanceGateCard />
		</div>
	);
}

function PreludeCard() {
	const { t } = useTranslation();
	const [data, setData] = useState<PreludeResponse | null>(null);
	const [draft, setDraft] = useState("");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | undefined>();
	const [status, setStatus] = useState<string | undefined>();

	async function refresh(): Promise<void> {
		try {
			const next = await orientationApi.getPrelude();
			setData(next);
			setDraft(next.override ?? next.default);
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

	const usingOverride = data ? data.override !== null : false;
	const dirty = data ? draft !== (data.override ?? data.default) : false;

	async function save(): Promise<void> {
		setSaving(true);
		try {
			const next = await orientationApi.putPrelude({ value: draft });
			setData(next);
			setDraft(next.override ?? next.default);
			setStatus(t("settings.orientation.savedPrelude"));
			setError(undefined);
			window.setTimeout(() => setStatus(undefined), 3000);
		} catch (e) {
			setError(String(e));
		} finally {
			setSaving(false);
		}
	}

	async function resetToDefault(): Promise<void> {
		setSaving(true);
		try {
			const next = await orientationApi.putPrelude({ value: null });
			setData(next);
			setDraft(next.default);
			setStatus(t("settings.orientation.overrideCleared"));
			setError(undefined);
			window.setTimeout(() => setStatus(undefined), 3000);
		} catch (e) {
			setError(String(e));
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="overflow-hidden rounded-md border border-line bg-paper">
			<div className="border-b border-line bg-paper-2 px-3 py-2">
				<div className="flex items-center gap-2">
					<div className="meta">{t("settings.orientation.prelude")}</div>
					{usingOverride ? <Badge tone="accent">{t("settings.orientation.overridden")}</Badge> : <Badge tone="muted">{t("settings.orientation.byDefault")}</Badge>}
				</div>
				<p className="mt-1 text-xs text-ink-3">
					{t("settings.orientation.preludeDesc")}
				</p>
				<div className="mt-1 font-mono text-2xs text-ink-3">
					{data?.path ?? "..."}
				</div>
			</div>
			<div className="space-y-3 p-4">
				{error ? (
					<div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">
						{error}
					</div>
				) : null}
				{status ? (
					<div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 font-mono text-xs text-success">
						{status}
					</div>
				) : null}
				{loading ? (
					<div className="text-sm text-ink-3">{t("common.status.loading")}</div>
				) : (
					<>
						<textarea
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
							spellCheck={false}
							className="block min-h-[320px] w-full resize-y rounded-md border border-line bg-paper-2 px-3 py-2 font-mono text-xs leading-relaxed text-ink"
						/>
						<div className="flex flex-wrap items-center gap-2">
							<Button size="sm" onClick={() => void save()} disabled={saving || !dirty}>
								<Save className="h-3.5 w-3.5" />
								{t("common.actions.save")}
							</Button>
							<Button
								size="sm"
								variant="outline"
								onClick={() => void resetToDefault()}
								disabled={saving || !usingOverride}
							>
								<RotateCcw className="h-3.5 w-3.5" />
								{t("common.actions.reset")}
							</Button>
							{dirty ? (
								<span className="font-mono text-2xs text-warn">{t("settings.orientation.unsavedPrelude")}</span>
							) : null}
						</div>
					</>
				)}
			</div>
		</div>
	);
}

function StartCommandCard() {
	const { t } = useTranslation();
	const [data, setData] = useState<StartCommand | null>(null);
	const [description, setDescription] = useState("");
	const [body, setBody] = useState("");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | undefined>();
	const [status, setStatus] = useState<string | undefined>();
	// Auto-start toggle: controls OMP_DECK_AUTO_START env var
	const [autoStartEnabled, setAutoStartEnabled] = useState(false);
	const [autoStartSaving, setAutoStartSaving] = useState(false);

	async function refresh(): Promise<void> {
		try {
			const [next, envResp] = await Promise.all([
				orientationApi.getStartCommand(),
				settingsApi.listEnv(),
			]);
			setData(next);
			setDescription(next.description);
			setBody(next.body);
			// Determine auto-start state from env
			const entry = envResp.entries.find((e: EnvEntry) => e.key === "OMP_DECK_AUTO_START");
			const raw = entry?.masked ?? "";
			const trimmed = raw.trim();
			setAutoStartEnabled(entry?.isSet === true && trimmed !== "" && trimmed !== "0" && trimmed.toLowerCase() !== "false");
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

	async function toggleAutoStart(enabled: boolean): Promise<void> {
		setAutoStartSaving(true);
		try {
			await settingsApi.patchEnv({
				OMP_DECK_AUTO_START: enabled ? "/start" : "",
			});
			setAutoStartEnabled(enabled);
			setStatus(enabled ? t("settings.startOrchestrator.autoStartEnabled") : t("settings.startOrchestrator.autoStartDisabled"));
		} catch (e) {
			setError(String(e));
		} finally {
			setAutoStartSaving(false);
		}
	}

	const dirty = data ? description !== data.description || body !== data.body : false;

	async function save(): Promise<void> {
		setSaving(true);
		try {
			const next = await orientationApi.putStartCommand({ description, body });
			setData(next);
			setDescription(next.description);
			setBody(next.body);
			setStatus(t("settings.startOrchestrator.saved"));
			window.setTimeout(() => setStatus(undefined), 3000);
		} catch (e) {
			setError(String(e));
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="overflow-hidden rounded-md border border-line bg-paper">
			<div className="border-b border-line bg-paper-2 px-3 py-2">
				<div className="flex items-center gap-2">
					<div className="meta">{t("settings.startOrchestrator.title")}</div>
					{data?.exists ? <Badge tone="default">{t("settings.startOrchestrator.onDisk")}</Badge> : <Badge tone="warn">{t("settings.startOrchestrator.missing")}</Badge>}
					<span className="ml-auto" />
					<label className="flex items-center gap-2 text-xs text-ink-2">
						<input
							type="checkbox"
							checked={autoStartEnabled}
							disabled={autoStartSaving}
							onChange={(e) => void toggleAutoStart(e.target.checked)}
						/>
						<span>{t("settings.startOrchestrator.autoStart")}</span>
					</label>
				</div>
				<p className="mt-1 text-xs text-ink-3">
					{t("settings.startOrchestrator.desc")}
				</p>
				<div className="mt-1 font-mono text-2xs text-ink-3">
					{data?.path ?? "..."}
				</div>
			</div>
			<div className="space-y-3 p-4">
				{error ? (
					<div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">
						{error}
					</div>
				) : null}
				{status ? (
					<div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 font-mono text-xs text-success">
						{status}
					</div>
				) : null}
				{loading ? (
					<div className="text-sm text-ink-3">{t("common.status.loading")}</div>
				) : (
					<>
						<label className="block space-y-1">
							<span className="meta">{t("settings.startOrchestrator.descriptionLabel")}</span>
							<input
								type="text"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder={t("settings.startOrchestrator.placeholder")}
								className="block w-full rounded-md border border-line bg-paper-2 px-3 py-2 font-mono text-xs text-ink"
							/>
						</label>
						<label className="block space-y-1">
							<span className="meta">{t("settings.startOrchestrator.bodyLabel")}</span>
							<textarea
								value={body}
								onChange={(e) => setBody(e.target.value)}
								spellCheck={false}
								className="block min-h-[280px] w-full resize-y rounded-md border border-line bg-paper-2 px-3 py-2 font-mono text-xs leading-relaxed text-ink"
							/>
						</label>
						<div className="flex flex-wrap items-center gap-2">
							<Button size="sm" onClick={() => void save()} disabled={saving || !dirty}>
								<Save className="h-3.5 w-3.5" />
								{t("common.actions.save")}
							</Button>
							{dirty ? (
								<span className="font-mono text-2xs text-warn">{t("settings.orientation.unsaved")}</span>
							) : null}
						</div>
					</>
				)}
			</div>
		</div>
	);
}

function MaintenanceGateCard() {
	const { t } = useTranslation();
	const [data, setData] = useState<MaintenanceGateState | null>(null);
	const [draft, setDraft] = useState<{
		enabled: boolean;
		minOpMsgs: string;
		minReleaseAgeMs: string;
		fireFloorMs: string;
	} | null>(null);
	const [previewMode, setPreviewMode] = useState<"deck" | "flat-file">("deck");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | undefined>();
	const [status, setStatus] = useState<string | undefined>();

	async function refresh(): Promise<void> {
		try {
			const next = await orientationApi.getMaintenanceGate();
			setData(next);
			setDraft({
				enabled: next.enabled,
				minOpMsgs: String(next.knobs.minOpMsgs.rawValue ?? ""),
				minReleaseAgeMs: String(next.knobs.minReleaseAgeMs.rawValue ?? ""),
				fireFloorMs: String(next.knobs.fireFloorMs.rawValue ?? ""),
			});
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

	function parseKnob(value: string): number | null {
		const trimmed = value.trim();
		if (trimmed === "") return null;
		const n = Number.parseInt(trimmed, 10);
		return Number.isFinite(n) && n > 0 ? n : NaN;
	}

	async function save(): Promise<void> {
		if (!draft) return;
		const parsedOp = parseKnob(draft.minOpMsgs);
		const parsedRel = parseKnob(draft.minReleaseAgeMs);
		const parsedFire = parseKnob(draft.fireFloorMs);
		if (Number.isNaN(parsedOp) || Number.isNaN(parsedRel) || Number.isNaN(parsedFire)) {
			setError(t("settings.maintenance.knobError"));
		}
		setSaving(true);
		try {
			const next = await orientationApi.putMaintenanceGate({
				enabled: draft.enabled,
				minOpMsgs: parsedOp,
				minReleaseAgeMs: parsedRel,
				fireFloorMs: parsedFire,
			});
			setData(next);
			setDraft({
				enabled: next.enabled,
				minOpMsgs: String(next.knobs.minOpMsgs.rawValue ?? ""),
				minReleaseAgeMs: String(next.knobs.minReleaseAgeMs.rawValue ?? ""),
				fireFloorMs: String(next.knobs.fireFloorMs.rawValue ?? ""),
			});
			setStatus(t("settings.maintenance.saved"));
			window.setTimeout(() => setStatus(undefined), 3000);
		} catch (e) {
			setError(String(e));
		} finally {
			setSaving(false);
		}
	}

	const profile: "deck" | "flat-file" | "inactive" = !data
		? "inactive"
		: !data.enabled
			? "inactive"
			: data.orgRoot
				? "deck"
				: "flat-file";

	return (
		<div className="overflow-hidden rounded-md border border-line bg-paper">
			<div className="border-b border-line bg-paper-2 px-3 py-2">
				<div className="flex items-center gap-2">
					<div className="meta">{t("settings.maintenance.gate")}</div>
					{profile === "deck" ? <Badge tone="accent">{t("settings.maintenance.deckProfile")}</Badge> : null}
					{profile === "flat-file" ? <Badge tone="default">{t("settings.maintenance.flatFileProfile")}</Badge> : null}
					{profile === "inactive" ? <Badge tone="muted">{t("settings.maintenance.inactive")}</Badge> : null}
				</div>
				<p className="mt-1 text-xs text-ink-3">
					{t("settings.maintenance.desc")}
				</p>
				<div className="mt-1 space-y-0.5 font-mono text-2xs text-ink-3">
					<div>extension: {data?.installedExtensionPath ?? "..."}</div>
					<div>installed: {data ? (data.installedExtensionPresent ? t("settings.maintenance.installedYes") : t("settings.maintenance.installedMissing")) : "..."}</div>
					<div>OMP_DECK_ORG_ROOT: {data?.orgRoot ?? t("settings.maintenance.unset")} ({data?.orgRootSource ?? ""})</div>
				</div>
			</div>
			<div className="space-y-4 p-4">
				{error ? (
					<div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">
						{error}
					</div>
				) : null}
				{status ? (
					<div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 font-mono text-xs text-success">
						{status}
					</div>
				) : null}
				{loading || !draft || !data ? (
					<div className="text-sm text-ink-3">{t("common.status.loading")}</div>
				) : (
					<>
						<label className="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={draft.enabled}
								onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
							/>
							<span>{t("settings.maintenance.enabled")}</span>
							<span className="ml-2 font-mono text-2xs text-ink-3">
								OMP_DECK_MAINTENANCE_GATE_DISABLED = {data.disabledRaw ?? "(unset)"} ({data.disabledSource})
							</span>
						</label>

						<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
							<GateKnobInput
								label={t("settings.maintenance.minOpMsgs")}
								help={t("settings.maintenance.minOpMsgs")}
								knob={data.knobs.minOpMsgs}
								value={draft.minOpMsgs}
								onChange={(v) => setDraft({ ...draft, minOpMsgs: v })}
							/>
							<GateKnobInput
								label={t("settings.maintenance.minReleaseAge")}
								help={t("settings.maintenance.minReleaseAge")}
								knob={data.knobs.minReleaseAgeMs}
								value={draft.minReleaseAgeMs}
								onChange={(v) => setDraft({ ...draft, minReleaseAgeMs: v })}
							/>
							<GateKnobInput
								label={t("settings.maintenance.fireFloor")}
								help={t("settings.maintenance.fireFloor")}
								knob={data.knobs.fireFloorMs}
								value={draft.fireFloorMs}
								onChange={(v) => setDraft({ ...draft, fireFloorMs: v })}
							/>
						</div>

						<div className="flex flex-wrap items-center gap-2">
							<Button size="sm" onClick={() => void save()} disabled={saving}>
								<Save className="h-3.5 w-3.5" />
								{t("common.actions.save")}
							</Button>
							<Button size="sm" variant="outline" onClick={() => void refresh()} disabled={saving}>
								<RotateCcw className="h-3.5 w-3.5" />
								{t("settings.maintenance.reload")}
							</Button>
							{!data.installedExtensionPresent ? (
								<span className="font-mono text-2xs text-warn">
									{t("settings.maintenance.extensionMissing")}
								</span>
							) : null}
						</div>

						<div className="overflow-hidden rounded-md border border-line bg-paper-2">
							<div className="flex items-center gap-2 border-b border-line px-3 py-2">
								<div className="meta">{t("settings.maintenance.reminderPreview")}</div>
								<div className="ml-auto flex items-center gap-1">
									<Button
										size="sm"
										variant={previewMode === "deck" ? "primary" : "outline"}
										onClick={() => setPreviewMode("deck")}
									>
										{t("settings.maintenance.deck")}
									</Button>
									<Button
										size="sm"
										variant={previewMode === "flat-file" ? "primary" : "outline"}
										onClick={() => setPreviewMode("flat-file")}
									>
										{t("settings.maintenance.flatFile")}
									</Button>
								</div>
							</div>
							<pre className="overflow-x-auto whitespace-pre-wrap px-3 py-2 font-mono text-2xs leading-relaxed text-ink-2">
								{previewMode === "deck" ? data.preview.deckMode : data.preview.flatFileMode}
							</pre>
						</div>
					</>
				)}
			</div>
		</div>
	);
}

function GateKnobInput({
	label,
	help,
	knob,
	value,
	onChange,
}: {
	label: string;
	help: string;
	knob: GateKnob;
	value: string;
	onChange: (v: string) => void;
}) {
	const { t } = useTranslation();
	return (
		<label className="block space-y-1">
			<span className="meta">{label}</span>
			<input
				type="text"
				inputMode="numeric"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={String(knob.default)}
				className="block w-full rounded-md border border-line bg-paper-2 px-2 py-1 font-mono text-xs text-ink"
			/>
			<div className="font-mono text-2xs text-ink-3">
				{help}
			</div>
			<div className="font-mono text-2xs text-ink-3">
				{t("settings.maintenance.effective", { value: knob.value })} · {t("settings.maintenance.defaultValue", { value: knob.default })} · {t("settings.maintenance.sourceLabel", { source: knob.source })}
			</div>
		</label>
	);
}
