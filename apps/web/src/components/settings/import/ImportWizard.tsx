import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	ModelProviderApi,
	ProviderImportCatalogStrategy,
	ProviderImportCollisionAction,
	type CommitProviderImportRequest,
	type CommitProviderImportResponse,
	type PreviewProviderImportRequest,
	type PreviewProviderImportResponse,
	type ProviderImportCandidate,
	type ProviderImportMapping,
	type ScanProviderImportsResponse,
} from "@omp-deck/protocol";

import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import { ProviderApiError, modelProviderApi } from "@/lib/model-providers-api";
import {
	DraftMapping,
	PendingCandidate,
	WizardStage,
	WizardStatus,
	buildDefaultMappings,
	filterMappings,
	stageIndex,
	stageProgress,
	summariseStatus,
} from "@/components/settings/import/wizard";

interface ImportWizardProps {
	open: boolean;
	onClose: () => void;
	onCommitSuccess?: (response: CommitProviderImportResponse) => void;
}

export function ImportWizard({ open, onClose, onCommitSuccess }: ImportWizardProps) {
	const { t } = useTranslation();
	const [stage, setStage] = useState<WizardStage>("scan");
	const [status, setStatus] = useState<WizardStatus>("idle");
	const [scan, setScan] = useState<ScanProviderImportsResponse | undefined>();
	const [candidates, setCandidates] = useState<PendingCandidate[]>([]);
	const [mappings, setMappings] = useState<DraftMapping[]>([]);
	const [preview, setPreview] = useState<PreviewProviderImportResponse | undefined>();
	const [error, setError] = useState<string | null>(null);
	const [filter, setFilter] = useState("");

	useEffect(() => {
		if (!open) {
			setStage("scan");
			setStatus("idle");
			setScan(undefined);
			setCandidates([]);
			setMappings([]);
			setPreview(undefined);
			setError(null);
			setFilter("");
			return;
		}
		void scanDatabase();
	}, [open]);

	const scanDatabase = useCallback(async () => {
		setStage("scan");
		setStatus("running");
		setError(null);
		try {
			const response = await modelProviderApi.scanImports();
			setScan(response);
			const pending: PendingCandidate[] = (response.candidates ?? [])
				.filter((candidate) => candidate.status !== "unavailable")
				.map((candidate) => ({
					sourceKey: candidate.sourceKey,
					proposedTargetId: deriveProposedTargetId(candidate),
					displayName: candidate.name,
					selected: true,
					suggestedApi: candidate.suggestedApi,
					baseUrl: candidate.baseUrl,
				}));
			setCandidates(pending);
			setStatus("idle");
			setStage("select");
		} catch (err) {
			setStatus("failed");
			setError(errorMessage(err));
		}
	}, []);

	const toggleCandidate = useCallback((sourceKey: string) => {
		setCandidates((current) =>
			current.map((entry) => (entry.sourceKey === sourceKey ? { ...entry, selected: !entry.selected } : entry)),
		);
	}, []);

	const advanceToMapping = useCallback(() => {
		const selected = candidates.filter((entry) => entry.selected);
		setMappings(buildDefaultMappings(selected, "openai-completions"));
		setStage("map");
	}, [candidates]);

	const patchMapping = useCallback(
		(sourceKey: string, patch: Partial<ProviderImportMapping>) => {
			setMappings((current) => current.map((entry) => (entry.sourceKey === sourceKey ? { ...entry, ...patch } : entry)));
		},
		[],
	);

	const runPreview = useCallback(async () => {
		if (!scan?.fingerprint) {
			setError("Source database is not yet loaded.");
			return;
		}
		setStage("preview");
		setStatus("running");
		setError(null);
		try {
			const response = await modelProviderApi.previewImport({
				revision: "",
				sourceFingerprint: scan.fingerprint,
				mappings,
			});
			setPreview(response);
			setStatus("idle");
		} catch (err) {
			setStatus("failed");
			setError(errorMessage(err));
		}
	}, [mappings, scan?.fingerprint]);

	const runCommit = useCallback(async () => {
		if (!preview) return;
		setStage("commit");
		setStatus("running");
		setError(null);
		try {
			const previewToken = preview.previewToken;
			const request: CommitProviderImportRequest = {
				revision: preview.revision,
				sourceFingerprint: preview.sourceFingerprint,
				previewToken,
				mappings: preview.entries.map((entry) => entryMappingFromPreview(entry, mappings)),
			};
			const response = await modelProviderApi.commitImport(request);
			setStatus("done");
			onCommitSuccess?.(response);
			setStage("done");
		} catch (err) {
			setStatus("failed");
			setError(errorMessage(err));
		}
	}, [preview, mappings, onCommitSuccess]);

	const summary = summariseStatus(mappings);
	const filteredMappings = useMemo(() => filterMappings(mappings, filter), [mappings, filter]);
	const progress = stageProgress(stage);

	return (
		<Modal open={open} onClose={onClose} widthClass="max-w-3xl">
			<div className="flex flex-col gap-4 p-5">
				<header className="flex flex-col gap-2">
					<div className="flex items-center justify-between">
						<h2 className="text-lg font-semibold text-ink">{t("settings.providerWs.import.title")}</h2>
						<Badge tone="muted">
							{progress.done}/{progress.total}
						</Badge>
					</div>
					<WizardStepper stage={stage} />
				</header>

				{error ? (
					<p className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>
				) : null}

				{stage === "scan" ? (
					<ScanStage scan={scan} status={status} t={t} onRetry={() => void scanDatabase()} />
				) : null}
				{stage === "select" ? (
					<SelectStage
						scan={scan}
						candidates={candidates}
						onToggle={toggleCandidate}
						onAll={(value) =>
							setCandidates((current) => current.map((entry) => ({ ...entry, selected: value })))
						}
						onContinue={advanceToMapping}
						t={t}
					/>
				) : null}
				{stage === "map" ? (
					<MapStage
						mappings={filteredMappings}
						scan={scan}
						filter={filter}
						setFilter={setFilter}
						onPatch={patchMapping}
						onContinue={() => void runPreview()}
						t={t}
					/>
				) : null}
				{stage === "preview" ? (
					<PreviewStage preview={preview} status={status} mappings={mappings} t={t} />
				) : null}
				{stage === "commit" || stage === "done" ? (
					<CommitStage preview={preview} status={status} mappings={mappings} t={t} />
				) : null}

				<footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
					<div className="text-2xs text-ink-3">{t(`settings.providerWs.import.summary`, summary)}</div>
					<div className="flex items-center gap-2">
						<button type="button" className="btn-ghost h-8 px-3 text-xs" onClick={onClose}>
							{t("common.actions.close")}
						</button>
						{stage === "preview" ? (
							<>
								<button type="button" className="btn-ghost h-8 px-3 text-xs" onClick={() => setStage("map")}>
									{t("settings.providerWs.import.editMappings")}
								</button>
								<button
									type="button"
									className="btn-primary h-8 px-3 text-xs"
									disabled={status === "running"}
									onClick={() => void runCommit()}
								>
									{status === "running" ? t("common.actions.saving") : t("settings.providerWs.import.commit")}
								</button>
							</>
						) : null}
						{stage === "done" ? (
							<button type="button" className="btn-primary h-8 px-3 text-xs" onClick={onClose}>
								{t("settings.providerWs.import.done")}
							</button>
						) : null}
					</div>
				</footer>
			</div>
		</Modal>
	);
}

function WizardStepper({ stage }: { stage: WizardStage }) {
	const { t } = useTranslation();
	const labels: Array<{ id: WizardStage; label: string }> = [
		{ id: "scan", label: t("settings.providerWs.import.stage.scan") },
		{ id: "select", label: t("settings.providerWs.import.stage.select") },
		{ id: "map", label: t("settings.providerWs.import.stage.map") },
		{ id: "preview", label: t("settings.providerWs.import.stage.preview") },
		{ id: "commit", label: t("settings.providerWs.import.stage.commit") },
	];
	const active = stageIndex(stage);
	return (
		<div className="flex flex-wrap items-center gap-2 text-2xs text-ink-3">
			{labels.map((entry, index) => (
				<div key={entry.id} className="flex items-center gap-2">
					<span
						className={cn(
							"inline-flex h-5 min-w-5 items-center justify-center rounded-full px-2 font-mono",
							index < active
								? "bg-success/20 text-success"
								: index === active
									? "bg-accent-soft text-accent"
									: "bg-paper-3 text-ink-3",
						)}
					>
						{index + 1}
					</span>
					<span>{entry.label}</span>
					{index < labels.length - 1 ? <span className="text-ink-4">→</span> : null}
				</div>
			))}
		</div>
	);
}

function ScanStage({
	scan,
	status,
	t,
	onRetry,
}: {
	scan: ScanProviderImportsResponse | undefined;
	status: WizardStatus;
	t: (key: string, params?: Record<string, unknown>) => string;
	onRetry: () => void;
}) {
	return (
		<div className="space-y-3">
			{status === "running" ? (
				<p className="text-xs text-ink-3">{t("settings.providerWs.import.scanning")}</p>
			) : null}
			{scan ? (
				<section className="rounded-md border border-line bg-paper-2/40 p-3 text-2xs">
					<header className="meta">{t("settings.providerWs.import.scanHeader")}</header>
					<dl className="mt-2 grid grid-cols-[140px_1fr] gap-x-3 gap-y-1">
						<dt className="text-ink-3">dbPath</dt>
						<dd className="break-all font-mono">{scan.dbPath}</dd>
						<dt className="text-ink-3">accessible</dt>
						<dd className="font-mono">{scan.accessible ? "true" : "false"}</dd>
						<dt className="text-ink-3">fingerprint</dt>
						<dd className="font-mono">{scan.fingerprint ?? "—"}</dd>
						<dt className="text-ink-3">candidate_count</dt>
						<dd className="font-mono">{(scan.candidates ?? []).length}</dd>
					</dl>
					<p className="mt-2 text-2xs text-ink-3">
						{t("settings.providerWs.import.scanCount", { count: scan.candidates?.length ?? 0 })}
					</p>
				</section>
			) : null}
			<button type="button" className="btn-ghost h-7 px-2 text-xs" onClick={onRetry}>
				{t("common.actions.retry")}
			</button>
		</div>
	);
}

function SelectStage({
	scan,
	candidates,
	onToggle,
	onAll,
	onContinue,
	t,
}: {
	scan: ScanProviderImportsResponse | undefined;
	candidates: PendingCandidate[];
	onToggle: (sourceKey: string) => void;
	onAll: (value: boolean) => void;
	onContinue: () => void;
	t: (key: string, params?: Record<string, unknown>) => string;
}) {
	const sourceIds = scan?.candidates ?? [];
	const selectedCount = candidates.filter((candidate) => candidate.selected).length;
	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<header className="meta">{t("settings.providerWs.import.selectHeader")}</header>
				<div className="flex items-center gap-2">
					<button type="button" className="btn-ghost h-7 px-2 text-2xs" onClick={() => onAll(true)}>
						{t("common.actions.refresh")}
					</button>
					<button type="button" className="btn-ghost h-7 px-2 text-2xs" onClick={() => onAll(false)}>
						{t("settings.providerWs.import.deselectAll")}
					</button>
				</div>
			</div>
			<table className="w-full text-xs">
				<thead className="text-2xs uppercase tracking-meta text-ink-3">
					<tr>
						<th className="w-8 px-1 py-1"></th>
						<th className="px-1 py-1 text-left">name</th>
						<th className="px-1 py-1 text-left">appType</th>
						<th className="px-1 py-1 text-left">apiFormat</th>
						<th className="px-1 py-1 text-left">credential</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-line">
					{candidates.map((candidate) => {
						const record = (sourceIds as ProviderImportCandidate[]).find(
							(row) => row.sourceKey === candidate.sourceKey,
						);
						return (
							<tr key={candidate.sourceKey}>
								<td className="px-1 py-1 text-left">
									<input
										type="checkbox"
										checked={candidate.selected}
										onChange={() => onToggle(candidate.sourceKey)}
									/>
								</td>
								<td className="px-1 py-1">{candidate.displayName}</td>
								<td className="px-1 py-1 font-mono text-2xs">{record?.appType}</td>
								<td className="px-1 py-1 font-mono text-2xs">{record?.apiFormat ?? "—"}</td>
								<td className="px-1 py-1">
									<Badge tone={record?.credentialConfigured ? "success" : "muted"}>
										{record?.credentialConfigured
											? t("settings.providerWs.import.credentialConfigured")
											: t("settings.providerWs.import.credentialMissing")}
									</Badge>
									{record?.warning ? (
										<span className="ml-1 inline-block max-w-[200px] truncate align-middle text-2xs text-warn" title={record.warning}>
											⚠
										</span>
									) : null}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
			<div className="flex justify-end">
				<button
					type="button"
					className="btn-primary h-8 px-3 text-xs"
					disabled={selectedCount === 0}
					onClick={onContinue}
				>
					{t("settings.providerWs.import.continueMapping", { count: selectedCount })}
				</button>
			</div>
		</div>
	);
}

function MapStage({
	mappings,
	scan,
	filter,
	setFilter,
	onPatch,
	onContinue,
	t,
}: {
	mappings: DraftMapping[];
	scan: ScanProviderImportsResponse | undefined;
	filter: string;
	setFilter: (next: string) => void;
	onPatch: (sourceKey: string, patch: Partial<ProviderImportMapping>) => void;
	onContinue: () => void;
	t: (key: string, params?: Record<string, unknown>) => string;
}) {
	return (
		<div className="space-y-3">
			<header className="meta">{t("settings.providerWs.import.mappingHeader")}</header>
			<input
				type="search"
				value={filter}
				onChange={(event) => setFilter(event.target.value)}
				placeholder={t("settings.providerWs.import.mappingFilter")}
				className="field h-8 w-full px-2 text-xs"
			/>
			<table className="w-full table-fixed text-xs">
				<thead className="text-2xs uppercase tracking-meta text-ink-3">
					<tr>
						<th className="w-1/3 px-2 py-1 text-left">{t("settings.providerWs.import.target")}</th>
						<th className="px-2 py-1 text-left">api</th>
						<th className="px-2 py-1 text-left">baseUrl</th>
						<th className="px-2 py-1 text-left">{t("settings.providerWs.import.credential")}</th>
						<th className="px-2 py-1 text-left">{t("settings.providerWs.import.strategy")}</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-line">
					{mappings.map((mapping) => (
						<tr key={mapping.sourceKey}>
							<td className="px-2 py-2">
								<input
									value={mapping.targetId}
									onChange={(event) =>
										onPatch(mapping.sourceKey, { targetId: event.target.value })
									}
									className="field h-7 w-full px-2 font-mono text-2xs"
								/>
								<p className="mt-1 text-2xs text-ink-3">
									{mapping.displayName} · {mapping.sourceKey}
								</p>
							</td>
							<td className="px-2 py-2 font-mono">
								<input
									value={mapping.api}
									onChange={(event) =>
										onPatch(mapping.sourceKey, { api: event.target.value as ModelProviderApi })
									}
									className="field h-7 w-full max-w-[160px] px-2 font-mono text-2xs"
								/>
							</td>
							<td className="px-2 py-2 font-mono">
								<input
									value={mapping.baseUrl ?? ""}
									onChange={(event) => onPatch(mapping.sourceKey, { baseUrl: event.target.value })}
									className="field h-7 w-full px-2 font-mono text-2xs"
									placeholder="https://…"
								/>
							</td>
							<td className="px-2 py-2">
								<label className="flex items-center gap-2 text-2xs">
									<input
										type="checkbox"
										checked={mapping.migrateCredential}
										onChange={(event) =>
											onPatch(mapping.sourceKey, { migrateCredential: event.target.checked })
										}
									/>
									{t("settings.providerWs.import.credentialMigrate")}
								</label>
							</td>
							<td className="px-2 py-2">
								<select
									className="field h-7 w-full max-w-[140px] px-2 text-2xs"
									value={mapping.catalogStrategy}
									onChange={(event) =>
										onPatch(mapping.sourceKey, {
											catalogStrategy: event.target.value as ProviderImportCatalogStrategy,
										})
									}
								>
									<option value="dynamic">{t("settings.providerWs.import.strategyDynamic")}</option>
									<option value="pinned">{t("settings.providerWs.import.strategyPinned")}</option>
									<option value="manual">{t("settings.providerWs.import.strategyManual")}</option>
								</select>
							</td>
						</tr>
					))}
				</tbody>
			</table>
			{scan ? (
				<p className="text-2xs text-ink-3">
					{t("settings.providerWs.import.fingerprint", { fingerprint: scan.fingerprint ?? "—" })}
				</p>
			) : null}
			<div className="flex justify-end">
				<button type="button" className="btn-primary h-8 px-3 text-xs" onClick={onContinue}>
					{t("settings.providerWs.import.preview")}
				</button>
			</div>
		</div>
	);
}

function PreviewStage({
	preview,
	status,
	mappings,
	t,
}: {
	preview: PreviewProviderImportResponse | undefined;
	status: WizardStatus;
	mappings: DraftMapping[];
	t: (key: string, params?: Record<string, unknown>) => string;
}) {
	return (
		<div className="space-y-3">
			<header className="meta">{t("settings.providerWs.import.previewHeader")}</header>
			{status === "running" ? (
				<p className="text-xs text-ink-3">{t("settings.providerWs.import.previewing")}</p>
			) : null}
			{preview ? (
				<div className="space-y-2 text-xs">
					{preview.entries.map((entry) => {
						const originalMapping = mappings.find((m) => m.sourceKey === entry.sourceKey);
						return (
							<section key={`${entry.sourceKey}-${entry.targetId}`} className="rounded-md border border-line bg-paper-2/40 p-3">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2">
										<span className="font-mono text-sm">{entry.targetId}</span>
										<Badge tone="accent">{entry.action}</Badge>
										{entry.credentialConfigured ? <Badge tone="success">{t("settings.providerWs.import.credentialMigrated")}</Badge> : null}
									</div>
									<Badge tone="muted">{entry.sourceKey}</Badge>
								</div>
								<p className="mt-1 text-2xs text-ink-3">
									{entry.managedCredentialReference ?? "—"}
								</p>
								{entry.warnings && entry.warnings.length > 0 ? (
									<p className="mt-1 text-2xs text-warn">{t("settings.providerWs.import.collisionWarning")}</p>
								) : null}
								<p className="mt-1 text-2xs text-ink-3">
									api: <span className="font-mono">{originalMapping?.api ?? "?"}</span>
									{originalMapping?.baseUrl ? (
										<> · baseUrl: <span className="font-mono">{originalMapping.baseUrl}</span></>
									) : null}
								</p>
								<details className="mt-2">
									<summary className="cursor-pointer text-2xs text-ink-3">{t("settings.providerWs.import.viewDefinition")}</summary>
									<pre className="mt-1 max-h-48 overflow-auto rounded bg-paper-2 p-2 font-mono text-2xs">
										{JSON.stringify(entry.definition ?? {}, null, 2)}
									</pre>
								</details>
							</section>
						);
					})}
					{preview.warnings.length > 0 ? (
						<section className="rounded-md border border-warn/40 bg-warn/10 p-3 text-2xs text-warn">
							<header className="meta">{t("settings.providerWs.import.warnings")}</header>
							<ul className="mt-1 space-y-1">
								{preview.warnings.map((warning) => (
									<li key={warning}>{warning}</li>
								))}
							</ul>
						</section>
					) : null}
				</div>
			) : (
				<p className="text-xs text-ink-3">{t("settings.providerWs.import.previewIdle")}</p>
			)}
		</div>
	);
}

function CommitStage({
	preview,
	status,
	mappings,
	t,
}: {
	preview: PreviewProviderImportResponse | undefined;
	status: WizardStatus;
	mappings: DraftMapping[];
	t: (key: string, params?: Record<string, unknown>) => string;
}) {
	const perTarget = preview?.entries.length ?? mappings.length;
	return (
		<div className="space-y-3 text-xs">
			<header className="meta">{t("settings.providerWs.import.commitHeader")}</header>
			{status === "running" ? <p>{t("settings.providerWs.import.committing", { count: perTarget })}</p> : null}
			{status === "done" ? (
				<p className="text-success">{t("settings.providerWs.import.commitDone", { count: perTarget })}</p>
			) : null}
			<ul className="space-y-1">
				{mappings.map((mapping) => (
					<li key={mapping.sourceKey} className="flex items-center justify-between rounded bg-paper-2/40 p-2">
						<span className="font-mono text-2xs">{mapping.targetId}</span>
						<Badge tone="muted">{mapping.collisionAction}</Badge>
					</li>
				))}
			</ul>
		</div>
	);
}

function entryMappingFromPreview(
	entry: PreviewProviderImportResponse["entries"][number],
	draft: DraftMapping[],
): ProviderImportMapping {
	const fallback = draft.find((m) => m.sourceKey === entry.sourceKey);
	return (
		fallback ?? {
			sourceKey: entry.sourceKey,
			targetId: entry.targetId,
			api: "openai-completions",
			migrateCredential: false,
			catalogStrategy: "dynamic",
			collisionAction: entry.action === "merge" ? "merge" : entry.action === "replace" ? "replace" : "skip",
			confirmReplace: entry.action === "replace",
		}
	) as ProviderImportMapping;
}

function deriveProposedTargetId(candidate: ProviderImportCandidate): string {
	const sanitised = candidate.id.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
	return `ccswitch-${sanitised || candidate.id}`;
}

function errorMessage(error: unknown): string {
	if (error instanceof ProviderApiError) return `${error.code}: ${error.message}`;
	return error instanceof Error ? error.message : String(error);
}

void (null as unknown as ProviderImportCollisionAction);
