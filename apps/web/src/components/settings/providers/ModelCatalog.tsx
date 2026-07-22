import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	DiscoveredModel,
	ModelProviderCompatibility,
	ModelProviderRecord,
	PutModelProviderRequest,
	type RedactedModelDefinition,
} from "@omp-deck/protocol";

import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import {
	EMPTY_DRAFT,
	addDiscoveredModels,
	applyAction,
	deriveMode,
	isDuplicateId,
	modelSourceLabel,
	validateModelDraft,
	type CatalogDraft,
	type ModelAction,
} from "@/components/settings/providers/catalog";
import { ModelEditor } from "@/components/settings/providers/ModelEditor";
import { ProviderApiError, modelProviderApi } from "@/lib/model-providers-api";

const SECRET_SENTINEL = "__OMP_DECK_SECRET__";

export interface ModelCatalogProps {
	provider: ModelProviderRecord;
	compatibility: ModelProviderCompatibility | undefined;
	workspaceRevision: string;
	onSaved: () => Promise<void>;
}

export function ModelCatalog({
	provider,
	compatibility,
	workspaceRevision,
	onSaved,
}: ModelCatalogProps) {
	const { t } = useTranslation();
	const sentinel = compatibility?.secretSentinel ?? SECRET_SENTINEL;
	const baselineModels = useMemo<RedactedModelDefinition[]>(
		() => [...(provider.definition?.models ?? [])],
		[provider.definition?.models],
	);
	const baselineOverrides = useMemo(
		() => ({ ...(provider.definition?.modelOverrides ?? {}) }),
		[provider.definition?.modelOverrides],
	);
	const registryAvailable = provider.runtime.availableModelCount;

	const [draft, setDraft] = useState<CatalogDraft>(() => ({
		...EMPTY_DRAFT,
		mode: deriveMode(baselineModels, baselineOverrides, registryAvailable),
		models: baselineModels,
		overrides: baselineOverrides,
		discoveredIds: provider.runtime.discovery?.modelIds ?? [],
	}));
	const [saved, setSaved] = useState<CatalogDraft>(draft);
	const [search, setSearch] = useState("");
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [drawerModelId, setDrawerModelId] = useState<string | null>(null);
	const [pendingBulk, setPendingBulk] = useState<{
		models: RedactedModelDefinition[];
		source: "remote" | "omp-registry" | "configured";
		warnings: string[];
		providerId?: string;
	} | null>(null);
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<ProviderApiError | null>(null);
	const [discovering, setDiscovering] = useState(false);
	const [refreshError, setRefreshError] = useState<string | null>(null);
	const [modeDialog, setModeDialog] = useState<null | "pin-locally" | "extend">(null);

	useEffect(() => {
		const next: CatalogDraft = {
			...EMPTY_DRAFT,
			mode: deriveMode(baselineModels, baselineOverrides, registryAvailable),
			models: baselineModels,
			overrides: baselineOverrides,
			discoveredIds: provider.runtime.discovery?.modelIds ?? [],
		};
		setDraft(next);
		setSaved(next);
		setSelected(new Set());
		setDrawerModelId(null);
		setPendingBulk(null);
		setSaveError(null);
		setRefreshError(null);
	}, [provider.id]);

	const isDirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
	const filteredDraftModels = useMemo(
		() => filterModels(draft.models, search),
		[draft.models, search],
	);

	const dispatch = useCallback((action: ModelAction) => {
		setDraft((current) => applyAction(current, action));
	}, []);

	const handleModeChange = useCallback(
		(mode: CatalogDraft["mode"]) => {
			if (mode === draft.mode) return;
			if (mode === "pinned" && draft.models.length === 0) {
				setModeDialog("pin-locally");
				return;
			}
			setDraft((current) => ({ ...current, mode }));
		},
		[draft.mode, draft.models.length],
	);

	const handleDiscover = useCallback(async () => {
		setDiscovering(true);
		setRefreshError(null);
		try {
			const response = await modelProviderApi.discover({
				providerId: provider.id,
				forceRefresh: true,
			});
			if (response.source === "none") {
				setRefreshError(t("settings.providerWs.catalog.noResults"));
				return;
			}
			setPendingBulk({
				models: response.models.map(toModelDefinition),
				source: response.source,
				warnings: response.warnings,
			});
		} catch (error) {
			setRefreshError(error instanceof Error ? error.message : "discover failed");
		} finally {
			setDiscovering(false);
		}
	}, [provider.id, t]);

	const acceptPendingBulk = useCallback(() => {
		if (!pendingBulk) return;
		setDraft((current) => addDiscoveredModels(current, pendingBulk.models));
		setPendingBulk(null);
	}, [pendingBulk]);

	const handleManualAdd = useCallback(() => {
		const newId = suggestNextId(draft.models);
		const draft_model: RedactedModelDefinition = { id: newId, name: newId };
		dispatch({ kind: "add", model: draft_model });
		setDrawerModelId(newId);
	}, [draft.models, dispatch]);

	const handleSelectAll = useCallback(() => {
		setSelected(new Set(filteredDraftModels.map((m) => m.id)));
	}, [filteredDraftModels]);
	const handleSelectNone = useCallback(() => setSelected(new Set()), []);

	const selectedModels = useMemo(
		() => draft.models.filter((m) => selected.has(m.id)),
		[draft.models, selected],
	);

	const handleBulkRemove = useCallback(() => {
		if (selectedModels.length === 0) return;
		for (const model of selectedModels) {
			dispatch({ kind: "remove", id: model.id });
		}
		setSelected(new Set());
	}, [selectedModels, dispatch]);

	const handleSave = useCallback(async () => {
		if (!workspaceRevision) return;
		setSaving(true);
		setSaveError(null);
		try {
			const payload: PutModelProviderRequest = {
				revision: workspaceRevision,
				definition: {
					...(provider.definition ?? {}),
					mode: undefined,
					...(draft.models.length > 0 ? { models: draft.models } : { models: [] }),
					...(Object.keys(draft.overrides).length > 0
						? { modelOverrides: draft.overrides }
						: { modelOverrides: {} }),
					...(provider.definition?.discovery ?? {}),
				},
				credential: { action: "preserve" },
			};
			delete (payload.definition as Record<string, unknown>).mode;
			await modelProviderApi.putProvider(provider.id, payload);
			setSaved(draft);
			await onSaved();
		} catch (error) {
			setSaveError(error instanceof ProviderApiError ? error : new ProviderApiError(500, "unknown", String(error)));
		} finally {
			setSaving(false);
		}
	}, [draft, provider, workspaceRevision, onSaved]);

	const handleDiscard = useCallback(() => {
		setDraft(saved);
		setSelected(new Set());
		setPendingBulk(null);
		setSaveError(null);
	}, [saved]);

	const handlePinAll = useCallback(() => {
		setDraft((current) => ({
			...current,
			mode: "pinned",
			models: provider.runtime.discovery?.modelIds?.length
				? provider.runtime.discovery.modelIds.map((id) => ({ id, name: id } as RedactedModelDefinition))
				: current.models,
		}));
		setModeDialog(null);
	}, [provider.runtime.discovery]);

	const handleExtend = useCallback(() => {
		setDraft((current) => ({
			...current,
			mode: "hybrid",
		}));
		setModeDialog(null);
	}, []);

	const validationWarnings = useMemo(() => {
		const issues: Array<{ id: string; problems: string[] }> = [];
		for (const model of draft.models) {
			const problems = validateModelDraft(model);
			if (problems.length > 0) issues.push({ id: model.id, problems });
		}
		return issues;
	}, [draft.models]);

	const drawerModel = drawerModelId ? draft.models.find((m) => m.id === drawerModelId) ?? null : null;

	return (
		<div className="space-y-3">
			<section className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-paper p-3">
				<div className="flex items-center gap-2 text-xs">
					<span className="meta">{t("settings.providerWs.catalog.modeLabel")}</span>
					<ModeToggle mode={draft.mode} onChange={handleModeChange} t={t} />
					<Badge tone={draft.mode === "dynamic" ? "accent" : "muted"}>{draft.mode}</Badge>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						className="btn-ghost h-7 px-2 text-xs"
						disabled={discovering}
						onClick={() => void handleDiscover()}
					>
						{discovering ? t("common.actions.refresh") + "…" : t("settings.providerWs.catalog.discover")}
					</button>
					<button
						type="button"
						className="btn-ghost h-7 px-2 text-xs"
						onClick={handleManualAdd}
					>
						{t("settings.providerWs.catalog.manualAdd")}
					</button>
				</div>
			</section>

			{refreshError ? (
				<p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-2xs text-danger">
					{refreshError}
				</p>
			) : null}
			{pendingBulk ? (
				<section className="rounded-md border border-accent/30 bg-accent-soft/40 p-3 text-xs">
					<div className="meta">{t("settings.providerWs.catalog.discoveredTitle")}</div>
					<p className="mt-1 text-ink-3">{t("settings.providerWs.catalog.discoveredHelp", { source: pendingBulk.source, count: pendingBulk.models.length })}</p>
					{pendingBulk.warnings.length > 0 ? (
						<ul className="mt-2 list-disc pl-4 text-2xs text-ink-3">
							{pendingBulk.warnings.map((warning) => (
								<li key={warning}>{warning}</li>
							))}
						</ul>
					) : null}
					<div className="mt-3 flex justify-end gap-2">
						<button
							type="button"
							className="btn-ghost h-7 px-2 text-xs"
							onClick={() => setPendingBulk(null)}
						>
							{t("common.actions.cancel")}
						</button>
						<button
							type="button"
							className="btn-primary h-7 px-3 text-xs"
							onClick={acceptPendingBulk}
						>
							{t("settings.providerWs.catalog.accept")}
						</button>
					</div>
				</section>
			) : null}

			<section className="rounded-md border border-line bg-paper">
				<header className="flex items-center gap-2 border-b border-line p-3 text-xs">
					<input
						type="search"
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder={t("settings.providerWs.catalog.search")}
						className="field h-7 w-full max-w-xs px-2 text-xs"
					/>
					<button type="button" className="btn-ghost h-7 px-2 text-2xs" onClick={handleSelectAll}>
						{t("settings.providerWs.catalog.selectAll")}
					</button>
					<button type="button" className="btn-ghost h-7 px-2 text-2xs" onClick={handleSelectNone}>
						{t("settings.providerWs.catalog.selectNone")}
					</button>
					<button
						type="button"
						className="btn-ghost h-7 px-2 text-2xs"
						disabled={selectedModels.length === 0}
						onClick={handleBulkRemove}
					>
						{t("settings.providerWs.catalog.bulkRemove", { count: selectedModels.length })}
					</button>
					<Badge tone="muted">
						{t("settings.providerWs.catalog.counts", {
							visible: filteredDraftModels.length,
							total: draft.models.length,
						})}
					</Badge>
				</header>
				{filteredDraftModels.length === 0 ? (
					<p className="p-3 text-2xs text-ink-3">{t("settings.providerWs.catalog.empty")}</p>
				) : (
					<table className="w-full table-fixed text-xs">
						<thead className="bg-paper-2 text-left text-2xs uppercase tracking-meta text-ink-3">
							<tr>
								<th className="w-8 px-2 py-2"></th>
								<th className="px-2 py-2">id</th>
								<th className="px-2 py-2">name</th>
								<th className="px-2 py-2 text-right">ctx</th>
								<th className="px-2 py-2 text-right">max</th>
								<th className="px-2 py-2">{t("settings.providerWs.catalog.reasoning")}</th>
								<th className="px-2 py-2">{t("settings.providerWs.catalog.input")}</th>
								<th className="px-2 py-2">{t("settings.providerWs.catalog.tools")}</th>
								<th className="px-2 py-2">{t("settings.providerWs.catalog.actions")}</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-line">
							{filteredDraftModels.map((model) => {
								const source = modelSourceLabel(model, draft.discoveredIds);
								const issues = validationWarnings.find((entry) => entry.id === model.id);
								return (
									<tr
										key={model.id}
										className={cn(
											"hover:bg-paper-2/60",
											issues && "bg-danger/5",
										)}
									>
										<td className="px-2 py-2 text-left">
											<input
												type="checkbox"
												checked={selected.has(model.id)}
												onChange={(event) => {
													setSelected((current) => {
														const next = new Set(current);
														if (event.target.checked) next.add(model.id);
														else next.delete(model.id);
														return next;
													});
												}}
												aria-label={t("settings.providerWs.catalog.selectRow", { id: model.id })}
											/>
										</td>
										<td className="px-2 py-2 font-mono">{model.id}</td>
										<td className="px-2 py-2">
											<button
												type="button"
												className="text-left text-ink underline-offset-2 hover:underline"
												onClick={() => setDrawerModelId(model.id)}
											>
												{model.name ?? model.id}
											</button>
											<div className="text-2xs text-ink-3">{source}</div>
										</td>
										<td className="px-2 py-2 text-right font-mono">
											{model.contextWindow ? Math.round(model.contextWindow / 1000) + "k" : "—"}
										</td>
										<td className="px-2 py-2 text-right font-mono">{model.maxTokens ?? "—"}</td>
										<td className="px-2 py-2">
											{model.reasoning ? <Badge tone="thinking">thinking</Badge> : "—"}
										</td>
										<td className="px-2 py-2">
											<Badge tone="muted">{model.input?.join("/") ?? "—"}</Badge>
										</td>
										<td className="px-2 py-2">
											{model.supportsTools ? <Badge tone="success">✓</Badge> : "—"}
										</td>
										<td className="px-2 py-2">
											<div className="flex flex-wrap gap-1">
												<button
													type="button"
													className="btn-ghost h-6 px-2 text-2xs"
													onClick={() => setDrawerModelId(model.id)}
												>
													{t("common.actions.edit")}
												</button>
												<button
													type="button"
													className="btn-ghost h-6 px-2 text-2xs"
													disabled={isDuplicateId(`${model.id}-copy`, draft.models)}
													onClick={() => dispatch({ kind: "duplicate", id: model.id })}
												>
													{t("settings.providerWs.catalog.duplicate")}
												</button>
												<button
													type="button"
													className="btn-ghost h-6 px-2 text-2xs"
													onClick={() => dispatch({ kind: "remove", id: model.id })}
												>
													{t("common.actions.delete")}
												</button>
											</div>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				)}
			</section>

			{validationWarnings.length > 0 ? (
				<section className="rounded-md border border-danger/40 bg-danger/10 p-3 text-2xs text-danger">
					<header className="meta">{t("settings.providerWs.catalog.validationTitle")}</header>
					<ul className="mt-2 space-y-1">
						{validationWarnings.map((entry) => (
							<li key={entry.id}>
								<span className="font-mono">{entry.id}</span>: {entry.problems.join("; ")}
							</li>
						))}
					</ul>
				</section>
			) : null}

			<footer className="sticky bottom-0 -mx-4 flex items-center justify-between gap-2 border-t border-line bg-paper/95 p-3">
				<div className="text-2xs text-ink-3">
					{isDirty ? t("settings.providerWs.catalog.dirty", { count: draft.models.length - saved.models.length }) : t("settings.providerWs.clean")}
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						className="btn-ghost h-8 px-3 text-xs"
						onClick={handleDiscard}
						disabled={!isDirty || saving}
					>
						{t("common.actions.discard")}
					</button>
					<button
						type="button"
						className="btn-primary h-8 px-3 text-xs"
						onClick={() => void handleSave()}
						disabled={!isDirty || saving || validationWarnings.length > 0}
					>
						{saving ? t("common.actions.saving") : t("common.actions.save")}
					</button>
				</div>
			</footer>

			<ModelEditor
				providerId={provider.id}
				model={drawerModel}
				compatibility={compatibility}
				sentinel={sentinel}
				onCommit={(model) => {
					if (draftModelExists(draft.models, model.id)) {
						dispatch({ kind: "edit", id: model.id, patch: model });
					} else {
						dispatch({ kind: "add", model });
					}
				}}
				onClose={() => setDrawerModelId(null)}
			/>

			{modeDialog === "pin-locally" ? (
				<ModeDialog
					heading={t("settings.providerWs.catalog.pinTitle")}
					body={t("settings.providerWs.catalog.pinBody")}
					primary={t("settings.providerWs.catalog.pinConfirm")}
					onPrimary={handlePinAll}
					secondary={t("common.actions.cancel")}
					onSecondary={() => setModeDialog(null)}
				/>
			) : null}
			{modeDialog === "extend" ? (
				<ModeDialog
					heading={t("settings.providerWs.catalog.extendTitle")}
					body={t("settings.providerWs.catalog.extendBody")}
					primary={t("settings.providerWs.catalog.extendConfirm")}
					onPrimary={handleExtend}
					secondary={t("common.actions.cancel")}
					onSecondary={() => setModeDialog(null)}
				/>
			) : null}
			{pendingBulk ? null : null}
		</div>
	);
}

function ModeToggle({
	mode,
	onChange,
	t,
}: {
	mode: CatalogDraft["mode"];
	onChange: (mode: CatalogDraft["mode"]) => void;
	t: (key: string, params?: Record<string, unknown>) => string;
}) {
	return (
		<div className="flex gap-1" role="tablist">
			{(["dynamic", "pinned", "hybrid", "builtin"] as const).map((value) => (
				<button
					key={value}
					type="button"
					role="tab"
					aria-selected={mode === value}
					onClick={() => onChange(value)}
					className={cn(
						"rounded-md px-2 py-1 text-2xs",
						mode === value ? "bg-accent-soft text-accent" : "text-ink-3 hover:bg-paper-3",
					)}
				>
					{t(`settings.providerWs.catalog.mode.${value}`)}
				</button>
			))}
		</div>
	);
}

function ModeDialog({
	heading,
	body,
	primary,
	secondary,
	onPrimary,
	onSecondary,
}: {
	heading: string;
	body: string;
	primary: string;
	secondary: string;
	onPrimary: () => void;
	onSecondary: () => void;
}) {
	return (
		<div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal>
			<div className="w-full max-w-sm rounded-md border border-line bg-paper p-4 shadow-lg">
				<h3 className="text-sm font-semibold text-ink">{heading}</h3>
				<p className="mt-2 text-xs text-ink-3">{body}</p>
				<div className="mt-4 flex justify-end gap-2">
					<button type="button" className="btn-ghost h-8 px-3 text-xs" onClick={onSecondary}>
						{secondary}
					</button>
					<button type="button" className="btn-primary h-8 px-3 text-xs" onClick={onPrimary}>
						{primary}
					</button>
				</div>
			</div>
		</div>
	);
}

function filterModels(models: RedactedModelDefinition[], search: string): RedactedModelDefinition[] {
	const needle = search.trim().toLowerCase();
	if (!needle) return models;
	return models.filter((model) => {
		const haystack = `${model.id} ${model.name ?? ""}`.toLowerCase();
		return haystack.includes(needle);
	});
}

function toModelDefinition(model: DiscoveredModel): RedactedModelDefinition {
	const next: RedactedModelDefinition = { id: model.id };
	if (model.name) next.name = model.name;
	if (model.metadata?.contextWindow !== undefined) next.contextWindow = model.metadata.contextWindow;
	if (model.metadata?.maxTokens !== undefined) next.maxTokens = model.metadata.maxTokens;
	if (model.metadata?.reasoning !== undefined) next.reasoning = model.metadata.reasoning;
	if (model.metadata?.input) next.input = model.metadata.input;
	if (model.metadata?.supportsTools !== undefined) next.supportsTools = model.metadata.supportsTools;
	return next;
}

function suggestNextId(models: RedactedModelDefinition[]): string {
	let counter = models.length + 1;
	while (models.find((m) => m.id === `custom-${counter}`)) counter += 1;
	return `custom-${counter}`;
}

function draftModelExists(models: RedactedModelDefinition[], id: string): boolean {
	return models.some((model) => model.id === id);
}
