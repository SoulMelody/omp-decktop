import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
	ModelProviderCompatibility,
	ModelThinkingEffort,
	ModelThinkingMode,
	RedactedModelDefinition,
} from "@omp-deck/protocol";

import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import {
	modelSourceLabel,
	projectEditedModel,
	sparsePersist,
	validateModelDraft,
} from "@/components/settings/providers/catalog";

export interface ModelEditorProps {
	providerId: string;
	model: RedactedModelDefinition | null;
	compatibility: ModelProviderCompatibility | undefined;
	sentinel: string;
	onClose: () => void;
	onCommit: (model: RedactedModelDefinition) => void;
}

type EditorTab = "general" | "thinking" | "compat" | "advanced";

export function ModelEditor({ model, compatibility, sentinel, onClose, onCommit }: ModelEditorProps) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const [tab, setTab] = useState<EditorTab>("general");
	const [draft, setDraft] = useState<RedactedModelDefinition | null>(null);
	const [advancedDraft, setAdvancedDraft] = useState<string>("");
	const [advancedError, setAdvancedError] = useState<string | null>(null);

	useEffect(() => {
		if (model) {
			setDraft(model);
			setAdvancedDraft(JSON.stringify(model, null, 2));
			setAdvancedError(null);
			setTab("general");
			setOpen(true);
		} else {
			setOpen(false);
			setDraft(null);
		}
	}, [model]);

	const validation = useMemo(() => (draft ? validateModelDraft(draft) : []), [draft]);

	const handleSave = useCallback(() => {
		if (!draft) return;
		const next: RedactedModelDefinition = { ...draft };
		if (tab === "advanced") {
			try {
				const parsed = JSON.parse(advancedDraft);
				if (!parsed || typeof parsed !== "object") throw new Error("must be an object");
				onCommit({ ...(parsed as RedactedModelDefinition), id: draft.id });
			} catch (error) {
				setAdvancedError(error instanceof Error ? error.message : "invalid json");
				return;
			}
		} else if (draft) {
			if (model && draft !== model) {
				const projected = sparsePersist(draft, model);
				const sparse: RedactedModelDefinition = { id: draft.id, ...projected };
				onCommit({ ...model, ...sparse, id: draft.id });
			} else if (model) {
				onCommit({ ...model, id: draft.id });
			} else {
				onCommit({ ...draft, id: draft.id });
			}
		} else {
			return;
		}
		setOpen(false);
		onClose();
	}, [draft, advancedDraft, model, onCommit, onClose, tab]);

	const handleClose = useCallback(() => {
		setOpen(false);
		onClose();
	}, [onClose]);

	const thinkingModes: ModelThinkingMode[] = (compatibility?.thinkingModes?.length
		? (compatibility.thinkingModes as ModelThinkingMode[])
		: ["effort", "budget", "google-level", "anthropic-adaptive", "anthropic-budget-effort"]);
	const thinkingEfforts: ModelThinkingEffort[] = (compatibility?.thinkingEfforts?.length
		? (compatibility.thinkingEfforts as ModelThinkingEffort[])
		: ["minimal", "low", "medium", "high", "xhigh", "max"]);

	if (!open || !draft) return null;
	return (
		<div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-line bg-paper shadow-xl" role="dialog" aria-modal>
			<header className="flex items-center gap-2 border-b border-line px-4 py-3">
				<div className="flex flex-col">
					<div className="font-mono text-sm font-semibold text-ink">{draft.id}</div>
					<div className="text-2xs text-ink-3">
						{model ? modelSourceLabel(model, draft.id ? [draft.id] : []) : "configured"}
					</div>
				</div>
				<div className="ml-auto flex items-center gap-2">
					{validation.length > 0 ? <Badge tone="danger">{t("settings.providerWs.catalog.invalid")}</Badge> : null}
					<button type="button" className="btn-ghost h-7 px-2 text-xs" onClick={handleClose}>
						{t("common.actions.close")}
					</button>
				</div>
			</header>
			<nav className="flex gap-1 border-b border-line bg-paper-2/40 p-2" aria-label={t("settings.providerWs.catalog.drawerAria")}>
				{(["general", "thinking", "compat", "advanced"] as const).map((value) => (
					<button
						key={value}
						type="button"
						role="tab"
						aria-selected={tab === value}
						onClick={() => setTab(value)}
						className={cn(
							"rounded-md px-2 py-1 text-xs",
							tab === value ? "bg-accent-soft text-accent" : "text-ink-3 hover:bg-paper-3",
						)}
					>
						{t(`settings.providerWs.catalog.editor.${value}`)}
					</button>
				))}
			</nav>
			<div className="flex-1 overflow-auto p-4 text-xs">
				{tab === "general" ? (
					<GeneralEditor draft={draft} setDraft={setDraft} sentinel={sentinel} />
				) : tab === "thinking" ? (
					<ThinkingEditor
						draft={draft}
						setDraft={setDraft}
						modes={thinkingModes}
						efforts={thinkingEfforts}
					/>
				) : tab === "compat" ? (
					<CompatEditor draft={draft} setDraft={setDraft} />
				) : (
					<AdvancedEditor
						value={advancedDraft}
						setValue={setAdvancedDraft}
						error={advancedError}
						setError={setAdvancedError}
						sentinel={sentinel}
					/>
				)}
			</div>
			<footer className="border-t border-line bg-paper-2/40 px-4 py-3">
				{validation.length > 0 ? (
					<ul className="mb-2 space-y-1 text-2xs text-danger">
						{validation.map((issue, idx) => (
							<li key={idx}>{issue}</li>
						))}
					</ul>
				) : null}
				<div className="flex items-center justify-end gap-2">
					<button
						type="button"
						className="btn-ghost h-8 px-3 text-xs"
						onClick={handleClose}
					>
						{t("common.actions.cancel")}
					</button>
					<button
						type="button"
						className="btn-primary h-8 px-3 text-xs"
						onClick={handleSave}
						disabled={validation.length > 0}
					>
						{t("common.actions.save")}
					</button>
				</div>
			</footer>
		</div>
	);
}

function GeneralEditor({
	draft,
	setDraft,
	sentinel,
}: {
	draft: RedactedModelDefinition;
	setDraft: (next: RedactedModelDefinition) => void;
	sentinel: string;
}) {
	return (
		<dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2">
			<dt className="text-ink-3">id</dt>
			<dd>
				<input
					className="field h-7 w-full max-w-xs px-2 font-mono text-2xs"
					value={draft.id}
					onChange={(event) => setDraft({ ...draft, id: event.target.value })}
				/>
			</dd>
			<dt className="text-ink-3">name</dt>
			<dd>
				<input
					className="field h-7 w-full max-w-xs px-2 text-2xs"
					value={draft.name ?? ""}
					onChange={(event) => setDraft({ ...draft, name: event.target.value })}
				/>
			</dd>
			<dt className="text-ink-3">api</dt>
			<dd>
				<input
					className="field h-7 w-full max-w-xs px-2 font-mono text-2xs"
					value={draft.api ?? ""}
					onChange={(event) => setDraft({ ...draft, api: event.target.value as RedactedModelDefinition["api"] })}
				/>
			</dd>
			<dt className="text-ink-3">baseUrl</dt>
			<dd>
				<input
					className="field h-7 w-full max-w-md px-2 font-mono text-2xs"
					value={draft.baseUrl ?? ""}
					onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
				/>
			</dd>
			<dt className="text-ink-3">contextWindow</dt>
			<dd>
				<input
					type="number"
					className="field h-7 w-full max-w-xs px-2 font-mono text-2xs"
					value={draft.contextWindow ?? ""}
					onChange={(event) =>
						setDraft({
							...draft,
							contextWindow: event.target.value === "" ? undefined : Number(event.target.value),
						})
					}
				/>
			</dd>
			<dt className="text-ink-3">maxTokens</dt>
			<dd>
				<input
					type="number"
					className="field h-7 w-full max-w-xs px-2 font-mono text-2xs"
					value={draft.maxTokens ?? ""}
					onChange={(event) =>
						setDraft({
							...draft,
							maxTokens: event.target.value === "" ? undefined : Number(event.target.value),
						})
					}
				/>
			</dd>
			<dt className="text-ink-3">reasoning</dt>
			<dd>
				<label className="flex items-center gap-2 text-2xs">
					<input
						type="checkbox"
						checked={!!draft.reasoning}
						onChange={(event) => setDraft({ ...draft, reasoning: event.target.checked })}
					/>
					enable reasoning
				</label>
			</dd>
			<dt className="text-ink-3">input</dt>
			<dd>
				<div className="flex gap-3 text-2xs">
					{(["text", "image"] as const).map((modality) => (
						<label key={modality} className="flex items-center gap-2">
							<input
								type="checkbox"
								checked={!!draft.input?.includes(modality)}
								onChange={(event) => {
									const next = new Set(draft.input ?? []);
									if (event.target.checked) next.add(modality);
									else next.delete(modality);
									setDraft({ ...draft, input: Array.from(next) });
								}}
							/>
							{modality}
						</label>
					))}
				</div>
			</dd>
			<dt className="text-ink-3">supportsTools</dt>
			<dd>
				<label className="flex items-center gap-2 text-2xs">
					<input
						type="checkbox"
						checked={!!draft.supportsTools}
						onChange={(event) => setDraft({ ...draft, supportsTools: event.target.checked })}
					/>
					allow tool calls
				</label>
			</dd>
			<dt className="text-ink-3">headers</dt>
			<dd>
				<HeadersTable
					sentinel={sentinel}
					value={draft.headers ?? {}}
					onChange={(headers) => setDraft({ ...draft, headers })}
				/>
			</dd>
		</dl>
	);
}

function ThinkingEditor({
	draft,
	setDraft,
	modes,
	efforts,
}: {
	draft: RedactedModelDefinition;
	setDraft: (next: RedactedModelDefinition) => void;
	modes: ModelThinkingMode[];
	efforts: ModelThinkingEffort[];
}) {
	const thinking = draft.thinking;
	const update = (next: Partial<NonNullable<RedactedModelDefinition["thinking"]>>) => {
		setDraft({ ...draft, thinking: { mode: thinking?.mode ?? modes[0]!, efforts: thinking?.efforts ?? [], ...next } });
	};
	return (
		<dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-3">
			<dt className="text-ink-3">mode</dt>
			<dd>
				<select
					className="field h-7 w-full max-w-xs px-2 text-2xs"
					value={thinking?.mode ?? ""}
					onChange={(event) => update({ mode: event.target.value as ModelThinkingMode })}
				>
					<option value="">inherit</option>
					{modes.map((mode) => (
						<option key={mode} value={mode}>
							{mode}
						</option>
					))}
				</select>
			</dd>
			<dt className="text-ink-3">efforts</dt>
			<dd>
				<div className="flex flex-wrap gap-2 text-2xs">
					{efforts.map((effort) => (
						<label key={effort} className="flex items-center gap-1">
							<input
								type="checkbox"
								checked={thinking?.efforts?.includes(effort) ?? false}
								onChange={(event) => {
									const next = new Set(thinking?.efforts ?? []);
									if (event.target.checked) next.add(effort);
									else next.delete(effort);
									update({ efforts: Array.from(next) });
								}}
							/>
							{effort}
						</label>
					))}
				</div>
			</dd>
			<dt className="text-ink-3">default</dt>
			<dd>
				<select
					className="field h-7 w-full max-w-xs px-2 text-2xs"
					value={thinking?.defaultLevel ?? ""}
					onChange={(event) =>
						update({ defaultLevel: (event.target.value || undefined) as ModelThinkingEffort | undefined })
					}
				>
					<option value="">none</option>
					{efforts.map((effort) => (
						<option key={effort} value={effort}>
							{effort}
						</option>
					))}
				</select>
			</dd>
		</dl>
	);
}

function CompatEditor({
	draft,
	setDraft,
}: {
	draft: RedactedModelDefinition;
	setDraft: (next: RedactedModelDefinition) => void;
}) {
	return (
		<dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2">
			<dt className="text-ink-3">compat</dt>
			<dd>
				<textarea
					value={JSON.stringify(draft.compat ?? {}, null, 2)}
					onChange={(event) => {
						try {
							const parsed = JSON.parse(event.target.value);
							setDraft({ ...draft, compat: parsed });
						} catch {
							// ignore — the user is mid-edit
						}
					}}
					className="field min-h-[160px] w-full p-2 font-mono text-2xs"
					spellCheck={false}
				/>
			</dd>
			<dt className="text-ink-3">remoteCompaction</dt>
			<dd>
				<textarea
					value={JSON.stringify(draft.remoteCompaction ?? {}, null, 2)}
					onChange={(event) => {
						try {
							const parsed = JSON.parse(event.target.value);
							setDraft({ ...draft, remoteCompaction: parsed });
						} catch {
							// ignore — the user is mid-edit
						}
					}}
					className="field min-h-[120px] w-full p-2 font-mono text-2xs"
					spellCheck={false}
				/>
			</dd>
			<dt className="text-ink-3">omission</dt>
			<dd>
				<label className="flex items-center gap-2 text-2xs">
					<input
						type="checkbox"
						checked={!!draft.omitMaxOutputTokens}
						onChange={(event) => setDraft({ ...draft, omitMaxOutputTokens: event.target.checked })}
					/>
					omit maxTokens from each request
				</label>
			</dd>
		</dl>
	);
}

function AdvancedEditor({
	value,
	setValue,
	error,
	setError,
	sentinel,
}: {
	value: string;
	setValue: (next: string) => void;
	error: string | null;
	setError: (next: string | null) => void;
	sentinel: string;
}) {
	return (
		<div className="flex flex-col gap-2">
			<textarea
				value={value}
				onChange={(event) => {
					setValue(event.target.value);
					setError(null);
				}}
				className="field min-h-[320px] w-full p-2 font-mono text-2xs"
				spellCheck={false}
			/>
			{error ? <p className="text-2xs text-danger">{error}</p> : null}
			<p className="text-2xs text-ink-3">
				Use <code>{sentinel}</code> to mask a header value when saving.
			</p>
		</div>
	);
}

function HeadersTable({
	value,
	onChange,
	sentinel,
}: {
	value: Record<string, string>;
	onChange: (next: Record<string, string>) => void;
	sentinel: string;
}) {
	const entries = Object.entries(value);
	const update = (index: number, patch: Partial<{ name: string; value: string }>) => {
		const next = entries.map((entry, idx) => (idx === index ? { ...entry, ...patch } : entry));
		const reduced: Record<string, string> = {};
		for (const [key, val] of next) if (key) reduced[key] = val;
		onChange(reduced);
	};
	return (
		<div className="flex flex-col gap-1">
			{entries.map(([name, v], index) => (
				<div key={name} className="flex gap-1">
					<input
						className="field h-7 w-1/3 px-2 font-mono text-2xs"
						value={name}
						onChange={(event) => update(index, { name: event.target.value })}
					/>
					<input
						type="password"
						className="field h-7 flex-1 px-2 font-mono text-2xs"
						value={v}
						onChange={(event) => update(index, { value: event.target.value })}
					/>
				</div>
			))}
			<button
				type="button"
				className="btn-ghost h-6 px-2 text-2xs"
				onClick={() => onChange({ ...value, "": "" })}
			>
				+ header
			</button>
			<p className="text-2xs text-ink-3">Use {sentinel} to preserve an existing value.</p>
		</div>
	);
}

void projectEditedModel;
