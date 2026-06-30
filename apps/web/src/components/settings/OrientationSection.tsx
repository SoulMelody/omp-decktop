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
	return (
		<div className="mx-auto max-w-5xl space-y-6">
			<div>
				<h1 className="text-xl font-semibold tracking-tight">Orientation</h1>
				<p className="mt-1 max-w-3xl text-sm text-ink-3">
					Three artifacts shape every deck session: the system-prompt prelude,
					the <code className="font-mono text-xs">/start</code> orchestrator
					fired on boot, and the maintenance-gate extension that nudges the
					agent to capture work mid-session. Edit each in place; changes
					take effect on the next session create (prelude) or the next slash
					invocation (start) or the next gate evaluation (maintenance).
				</p>
			</div>
			<PreludeCard />
			<StartCommandCard />
			<MaintenanceGateCard />
		</div>
	);
}

function PreludeCard() {
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
			setStatus("Saved. New sessions will use this prelude.");
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
			setStatus("Override cleared. New sessions will use the bundled default.");
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
					<div className="meta">Prelude</div>
					{usingOverride ? <Badge tone="accent">override</Badge> : <Badge tone="muted">default</Badge>}
				</div>
				<p className="mt-1 text-xs text-ink-3">
					Prepended to every session&rsquo;s system prompt at{" "}
					<code className="font-mono">createAgentSession</code>. Imperatives belong
					in <code className="font-mono">/start</code>, not here&mdash; the prelude
					is reference material that the orchestrator can rely on.
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
					<div className="text-sm text-ink-3">Loading...</div>
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
								Save
							</Button>
							<Button
								size="sm"
								variant="outline"
								onClick={() => void resetToDefault()}
								disabled={saving || !usingOverride}
							>
								<RotateCcw className="h-3.5 w-3.5" />
								Reset to default
							</Button>
							{dirty ? (
								<span className="font-mono text-2xs text-warn">Unsaved changes</span>
							) : null}
						</div>
					</>
				)}
			</div>
		</div>
	);
}

function StartCommandCard() {
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
			setStatus(enabled ? "Auto-start enabled. New sessions will fire /start." : "Auto-start disabled. New sessions will open silently.");
			window.setTimeout(() => setStatus(undefined), 3000);
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
			setStatus("Saved. Next /start invocation will use this body.");
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
					<div className="meta">/start orchestrator</div>
					{data?.exists ? <Badge tone="default">on disk</Badge> : <Badge tone="warn">missing</Badge>}
					<span className="ml-auto" />
					<label className="flex items-center gap-2 text-xs text-ink-2">
						<input
							type="checkbox"
							checked={autoStartEnabled}
							disabled={autoStartSaving}
							onChange={(e) => void toggleAutoStart(e.target.checked)}
						/>
						<span>Auto-start on new session</span>
					</label>
				</div>
				<p className="mt-1 text-xs text-ink-3">
					First user message fired on session boot. Re-read every invocation,
					so saves take effect immediately. Numbered procedures here outrank
					prelude imperatives by recency&mdash;put DO-THIS instructions in this
					body, not in the prelude above. Toggle &ldquo;Auto-start&rdquo; to
					control whether <code className="font-mono">/start</code> fires
					automatically on every new session.
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
					<div className="text-sm text-ink-3">Loading...</div>
				) : (
					<>
						<label className="block space-y-1">
							<span className="meta">description</span>
							<input
								type="text"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="One-line summary (frontmatter description:)"
								className="block w-full rounded-md border border-line bg-paper-2 px-3 py-2 font-mono text-xs text-ink"
							/>
						</label>
						<label className="block space-y-1">
							<span className="meta">body</span>
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
								Save
							</Button>
							{dirty ? (
								<span className="font-mono text-2xs text-warn">Unsaved changes</span>
							) : null}
						</div>
					</>
				)}
			</div>
		</div>
	);
}

function MaintenanceGateCard() {
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
			setError("Each knob must be a positive integer or empty (to clear override).");
			return;
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
			setStatus("Saved. Gate will use these values on the next evaluation.");
			setError(undefined);
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
					<div className="meta">Maintenance gate</div>
					{profile === "deck" ? <Badge tone="accent">deck profile</Badge> : null}
					{profile === "flat-file" ? <Badge tone="default">flat-file profile</Badge> : null}
					{profile === "inactive" ? <Badge tone="muted">inactive</Badge> : null}
				</div>
				<p className="mt-1 text-xs text-ink-3">
					Nudges the agent at <code className="font-mono">turn_end</code> to capture
					insights / decisions / tasks into the appropriate destination. Fires at
					most once per release segment, gated by three floors. Disabling here
					skips org-root detection so even an unaltered installed extension
					stays silent.
				</p>
				<div className="mt-1 space-y-0.5 font-mono text-2xs text-ink-3">
					<div>extension: {data?.installedExtensionPath ?? "..."}</div>
					<div>installed: {data ? (data.installedExtensionPresent ? "yes" : "missing") : "..."}</div>
					<div>OMP_DECK_ORG_ROOT: {data?.orgRoot ?? "(unset)"} ({data?.orgRootSource ?? ""})</div>
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
					<div className="text-sm text-ink-3">Loading...</div>
				) : (
					<>
						<label className="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={draft.enabled}
								onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
							/>
							<span>Enabled</span>
							<span className="ml-2 font-mono text-2xs text-ink-3">
								OMP_DECK_MAINTENANCE_GATE_DISABLED = {data.disabledRaw ?? "(unset)"} ({data.disabledSource})
							</span>
						</label>

						<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
							<GateKnobInput
								label="minOpMsgs"
								help="Operator messages since last release"
								knob={data.knobs.minOpMsgs}
								value={draft.minOpMsgs}
								onChange={(v) => setDraft({ ...draft, minOpMsgs: v })}
							/>
							<GateKnobInput
								label="minReleaseAgeMs"
								help="Wall-clock ms since last release"
								knob={data.knobs.minReleaseAgeMs}
								value={draft.minReleaseAgeMs}
								onChange={(v) => setDraft({ ...draft, minReleaseAgeMs: v })}
							/>
							<GateKnobInput
								label="fireFloorMs"
								help="Wall-clock ms between fires (cross-session)"
								knob={data.knobs.fireFloorMs}
								value={draft.fireFloorMs}
								onChange={(v) => setDraft({ ...draft, fireFloorMs: v })}
							/>
						</div>

						<div className="flex flex-wrap items-center gap-2">
							<Button size="sm" onClick={() => void save()} disabled={saving}>
								<Save className="h-3.5 w-3.5" />
								Save
							</Button>
							<Button size="sm" variant="outline" onClick={() => void refresh()} disabled={saving}>
								<RotateCcw className="h-3.5 w-3.5" />
								Reload
							</Button>
							{!data.installedExtensionPresent ? (
								<span className="font-mono text-2xs text-warn">
									Extension not installed at expected path; knob changes won&rsquo;t take effect until
									it&rsquo;s restored.
								</span>
							) : null}
						</div>

						<div className="overflow-hidden rounded-md border border-line bg-paper-2">
							<div className="flex items-center gap-2 border-b border-line px-3 py-2">
								<div className="meta">Reminder preview</div>
								<div className="ml-auto flex items-center gap-1">
									<Button
										size="sm"
										variant={previewMode === "deck" ? "primary" : "outline"}
										onClick={() => setPreviewMode("deck")}
									>
										deck
									</Button>
									<Button
										size="sm"
										variant={previewMode === "flat-file" ? "primary" : "outline"}
										onClick={() => setPreviewMode("flat-file")}
									>
										flat-file
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
				effective {knob.value} · default {knob.default} · source {knob.source}
			</div>
		</label>
	);
}
