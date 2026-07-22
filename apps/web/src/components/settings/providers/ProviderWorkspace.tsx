import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
	ModelProviderApi,
	ModelProviderCompatibility,
	ModelProviderOption,
	ModelProviderRecord,
	ProbeProviderRequest,
	ProbeProviderResponse,
	ProviderDiagnosticCheck,
	ProviderDiagnosticCheckId,
	ProviderNetworkAttempt,
} from "@omp-deck/protocol";

import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import { applyFilters } from "@/components/settings/providers/filters";
import {
	ConnectionEditor,
	buildServerDefinition,
	credentialOperationFor,
	emptyConnectionState,
	toConnectionError,
	type ConnectionEditorState,
	type CredentialMode,
} from "@/components/settings/providers/ConnectionEditor";
import { OAuthFlowModal } from "@/components/settings/OAuthFlowModal";
import { AdvancedEditor } from "@/components/settings/providers/AdvancedEditor";
import { ModelCatalog } from "@/components/settings/providers/ModelCatalog";
import { ImportWizard } from "@/components/settings/import/ImportWizard";
import { LegacyMigrationModal } from "@/components/settings/import/LegacyMigrationModal";
import { useProviderWorkspace } from "@/lib/use-provider-workspace";

type ProviderTab = "connection" | "models" | "advanced" | "diagnostics";
type DirtyReason = "clean" | "editor" | "pending";

export function ProviderWorkspace() {
	const ws = useProviderWorkspace();
	const { t } = useTranslation();
	const [tab, setTab] = useState<ProviderTab>("connection");
	const [mobileDetail, setMobileDetail] = useState(false);
	const [oauthTarget, setOauthTarget] = useState<{ id: string; label: string } | null>(null);
	const [customOpen, setCustomOpen] = useState(false);
	const [importOpen, setImportOpen] = useState(false);
	const [legacyOpen, setLegacyOpen] = useState(false);

	const filtered = applyFilters(ws.state.list?.providers, ws.state.filter, ws.state.search);
	const selected: ModelProviderRecord | undefined = ws.state.list?.providers.find(
		(entry) => entry.id === ws.state.selectedId,
	);

	const select = useCallback(
		(id: string | undefined) => {
			ws.select(id);
			setMobileDetail(!!id);
		},
		[ws],
	);

	const handleAddProvider = useCallback((option: ModelProviderOption) => {
		if (option.kind === "oauth") {
			setOauthTarget({ id: option.id, label: option.label });
			return;
		}
		setCustomOpen(true);
	}, []);

	const handleOAuthComplete = useCallback(() => {
		setOauthTarget(null);
		void ws.refresh();
	}, [ws]);

	return (
		<div className="flex h-full min-h-0 overflow-hidden">
			<aside
				className={cn(
					"flex w-full min-w-0 flex-col border-r border-line bg-paper-2/40 md:max-w-72 md:w-72",
					mobileDetail && "hidden md:flex",
				)}
			>
				<ProviderMaster
					count={ws.state.list?.providers.length ?? 0}
					filterValue={ws.state.filter}
					onFilter={ws.applyFilter}
					searchValue={ws.state.search}
					onSearch={ws.applySearch}
					addable={ws.state.list?.addable ?? []}
					loading={ws.state.status === "loading" && !ws.state.list}
					error={ws.state.error?.message}
					filtered={filtered}
					selectedId={ws.state.selectedId}
					onSelect={select}
					onRetry={ws.refresh}
					onAddProvider={handleAddProvider}
					onOpenImport={() => setImportOpen(true)}
					onOpenLegacy={() => setLegacyOpen(true)}
				/>
			</aside>
			<section
				className={cn(
					"min-w-0 flex-1 flex-col bg-paper",
					mobileDetail ? "flex" : "hidden md:flex",
				)}
			>
				{selected ? (
					<ProviderDetail
						provider={selected}
						tab={tab}
						setTab={setTab}
						onBack={() => setMobileDetail(false)}
						compatibility={ws.state.list?.compatibility}
						addable={ws.state.list?.addable ?? []}
						refresh={ws.refresh}
						workspace={ws}
					/>
				) : (
					<div className="grid h-full place-items-center text-sm text-ink-3">
						{t("settings.providerWs.selectPrompt")}
					</div>
				)}
			</section>
			<CustomProviderModal
				open={customOpen}
				onClose={() => setCustomOpen(false)}
				compatibility={ws.state.list?.compatibility}
				existingIds={ws.state.list?.providers.map((provider) => provider.id) ?? []}
				saving={ws.state.saving}
				onCreate={async (id, api, baseUrl, apiKey) => {
					await ws.saveDraft(
						id,
						{ api, baseUrl },
						apiKey ? { action: "set", value: apiKey } : { action: "preserve" },
					);
					select(id);
					setTab("connection");
					setCustomOpen(false);
				}}
			/>
			<OAuthFlowModal
				open={!!oauthTarget}
				provider={oauthTarget?.id ?? null}
				providerName={oauthTarget?.label ?? null}
				onClose={() => setOauthTarget(null)}
				onComplete={handleOAuthComplete}
			/>
			<ImportWizard
				open={importOpen}
				onClose={() => setImportOpen(false)}
				onCommitSuccess={() => void ws.refresh()}
			/>
			<LegacyMigrationModal
				open={legacyOpen}
				onClose={() => setLegacyOpen(false)}
				revision={ws.state.list?.revision ?? ""}
				onComplete={() => void ws.refresh()}
			/>
		</div>
	);
}

export function canDeleteModelProvider(
	provider: Pick<ModelProviderRecord, "editable" | "layers">,
): boolean {
	return provider.editable && provider.layers.includes("models-config");
}

export function validateCustomProvider(
	id: string,
	baseUrl: string,
	existingIds: string[],
): "id-required" | "id-invalid" | "id-exists" | "base-url-required" | "base-url-invalid" | undefined {
	const normalizedId = id.trim();
	if (!normalizedId) return "id-required";
	if (!/^[a-z0-9][a-z0-9._-]*$/.test(normalizedId)) return "id-invalid";
	if (existingIds.includes(normalizedId)) return "id-exists";
	if (!baseUrl.trim()) return "base-url-required";
	try {
		const parsed = new URL(baseUrl.trim());
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "base-url-invalid";
	} catch {
		return "base-url-invalid";
	}
	return undefined;
}

function CustomProviderModal({
	open,
	onClose,
	compatibility,
	existingIds,
	saving,
	onCreate,
}: {
	open: boolean;
	onClose: () => void;
	compatibility: ModelProviderCompatibility | undefined;
	existingIds: string[];
	saving: boolean;
	onCreate: (id: string, api: ModelProviderApi, baseUrl: string, apiKey: string) => Promise<void>;
}) {
	const { t } = useTranslation();
	const [id, setId] = useState("");
	const [api, setApi] = useState<ModelProviderApi>("openai-completions");
	const [baseUrl, setBaseUrl] = useState("");
	const [apiKey, setApiKey] = useState("");
	const [error, setError] = useState<string | undefined>();
	const apiOptions = compatibility?.apis ?? ["openai-completions"];

	useEffect(() => {
		if (!open) return;
		setId("");
		setApi(apiOptions.includes("openai-completions") ? "openai-completions" : (apiOptions[0] ?? "openai-completions"));
		setBaseUrl("");
		setApiKey("");
		setError(undefined);
	}, [open]);

	const submit = useCallback(async () => {
		const validation = validateCustomProvider(id, baseUrl, existingIds);
		if (validation) {
			setError(t(`settings.providerWs.custom.errors.${validation}`));
			return;
		}
		setError(undefined);
		try {
			await onCreate(id.trim(), api, baseUrl.trim(), apiKey.trim());
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	}, [api, apiKey, baseUrl, existingIds, id, onCreate, t]);

	return (
		<Modal open={open} onClose={onClose} widthClass="max-w-lg" dismissOnBackdrop={!saving} dismissOnEscape={!saving}>
			<form
				className="space-y-4 p-5"
				onSubmit={(event) => {
					event.preventDefault();
					void submit();
				}}
			>
				<header>
					<h2 className="text-lg font-semibold text-ink">{t("settings.providerWs.custom.title")}</h2>
					<p className="mt-1 text-xs text-ink-3">{t("settings.providerWs.custom.help")}</p>
				</header>
				<label className="block text-xs">
					<span className="meta">{t("settings.providerWs.connection.id")}</span>
					<input
						autoFocus
						className="field mt-1 h-8 w-full px-2 font-mono text-xs"
						value={id}
						onChange={(event) => setId(event.target.value)}
						placeholder="my-provider"
						disabled={saving}
					/>
				</label>
				<label className="block text-xs">
					<span className="meta">{t("settings.providerWs.connection.api")}</span>
					<select
						className="field mt-1 h-8 w-full px-2 text-xs"
						value={api}
						onChange={(event) => setApi(event.target.value as ModelProviderApi)}
						disabled={saving}
					>
						{apiOptions.map((option) => <option key={option} value={option}>{option}</option>)}
					</select>
				</label>
				<label className="block text-xs">
					<span className="meta">{t("settings.providerWs.connection.baseUrl")}</span>
					<input
						className="field mt-1 h-8 w-full px-2 font-mono text-xs"
						value={baseUrl}
						onChange={(event) => setBaseUrl(event.target.value)}
						placeholder="https://api.example.com/v1"
						disabled={saving}
					/>
				</label>
				<label className="block text-xs">
					<span className="meta">{t("settings.providerWs.custom.apiKey")}</span>
					<input
						type="password"
						className="field mt-1 h-8 w-full px-2 font-mono text-xs"
						value={apiKey}
						onChange={(event) => setApiKey(event.target.value)}
						autoComplete="new-password"
						disabled={saving}
					/>
					<span className="mt-1 block text-2xs text-ink-3">{t("settings.providerWs.custom.apiKeyHint")}</span>
				</label>
				{error ? <p className="text-xs text-danger" role="alert">{error}</p> : null}
				<footer className="flex justify-end gap-2 border-t border-line pt-3">
					<button type="button" className="btn-ghost h-8 px-3 text-xs" onClick={onClose} disabled={saving}>
						{t("common.actions.cancel")}
					</button>
					<button type="submit" className="btn-primary h-8 px-3 text-xs" disabled={saving}>
						{saving ? t("common.actions.saving") : t("common.actions.create")}
					</button>
				</footer>
			</form>
		</Modal>
	);
}

function ProviderMaster({
	count,
	filterValue,
	onFilter,
	searchValue,
	onSearch,
	addable,
	loading,
	error,
	filtered,
	selectedId,
	onSelect,
	onRetry,
	onAddProvider,
	onOpenImport,
	onOpenLegacy,
}: {
	count: number;
	filterValue: ReturnType<typeof useProviderWorkspace>["state"]["filter"];
	onFilter: (filter: ReturnType<typeof useProviderWorkspace>["state"]["filter"]) => void;
	searchValue: string;
	onSearch: (search: string) => void;
	addable: ModelProviderOption[];
	loading: boolean;
	error: string | undefined;
	filtered: ModelProviderRecord[];
	selectedId: string | undefined;
	onSelect: (id: string | undefined) => void;
	onRetry: () => Promise<void>;
	onAddProvider: (option: ModelProviderOption) => void;
	onOpenImport: () => void;
	onOpenLegacy: () => void;
}) {
	const { t } = useTranslation();
	return (
		<>
			<div className="flex flex-col gap-2 border-b border-line p-3">
				<div className="flex items-center justify-between">
					<div className="meta">{t("settings.providerWs.providers")}</div>
					<Badge tone="muted">{count}</Badge>
				</div>
				<input
					type="search"
					value={searchValue}
					onChange={(event) => onSearch(event.target.value)}
					placeholder={t("settings.providerWs.searchPlaceholder")}
					className="field h-8 w-full px-2 text-xs"
				/>
				<div className="flex gap-1" role="tablist" aria-label={t("settings.providerWs.providers")}>
					{(["all", "ready", "needs-attention", "legacy"] as const).map((key) => (
						<button
							key={key}
							type="button"
							role="tab"
							aria-selected={filterValue === key}
							onClick={() => onFilter(key)}
							className={cn(
								"rounded-md px-2 py-1 text-xs transition-colors",
								filterValue === key
									? "bg-accent-soft text-accent"
									: "text-ink-3 hover:bg-paper-3",
							)}
						>
							{t(`settings.providerWs.filter.${key === "needs-attention" ? "needsAttention" : key}`)}
						</button>
					))}
				</div>
				{addable && addable.length > 0 ? (
					<details className="rounded-md border border-dashed border-line p-2 text-xs">
						<summary className="cursor-pointer text-ink-3">
							{t("settings.providerWs.addProvider")}
						</summary>
						<ul className="mt-2 space-y-1">
							{addable.map((option) => (
								<li key={option.id} className="flex items-center justify-between gap-2">
									<span className="font-mono text-xs">{option.label}</span>
									<div className="flex items-center gap-1">
										<Badge tone={option.kind === "oauth" ? "accent" : "muted"}>
											{option.kind}
										</Badge>
										<button
											type="button"
											className="btn-ghost h-6 px-2 text-2xs"
											onClick={() => onAddProvider(option)}
										>
											{option.kind === "oauth"
												? t("common.actions.login")
												: t("common.actions.add")}
										</button>
									</div>
								</li>
							))}
						</ul>
					</details>
				) : null}
				<div className="flex flex-col gap-1">
					<button
						type="button"
						className="btn-ghost h-7 px-2 text-xs"
						onClick={onOpenImport}
					>
						{t("settings.providerWs.import.open")}
					</button>
					<button
						type="button"
						className="btn-ghost h-7 px-2 text-xs"
						onClick={onOpenLegacy}
					>
						{t("settings.providerWs.legacy.open")}
					</button>
				</div>
			</div>
			{loading ? (
				<div className="grid flex-1 place-items-center text-xs text-ink-3">{t("settings.providerWs.loading")}</div>
			) : error ? (
				<div className="grid flex-1 place-items-center px-4 text-center text-xs">
					<div>
						<p className="text-danger">{error}</p>
						<button type="button" className="btn-ghost mt-3 h-7 px-2 text-xs" onClick={() => void onRetry()}>
							{t("common.actions.retry")}
						</button>
					</div>
				</div>
			) : filtered.length === 0 ? (
				<div className="grid flex-1 place-items-center px-4 text-center text-xs text-ink-3">
					{t("settings.providerWs.empty")}
				</div>
			) : (
				<ul className="flex-1 overflow-auto divide-y divide-line/50">
					{filtered.map((provider) => (
						<li key={provider.id}>
							<button
								type="button"
								aria-pressed={provider.id === selectedId}
								onClick={() => onSelect(provider.id)}
								className={cn(
									"flex w-full min-w-0 flex-col gap-1 px-3 py-2 text-left transition-colors",
									provider.id === selectedId
										? "bg-accent-soft text-ink"
										: "hover:bg-paper-3",
								)}
							>
								<div className="flex min-w-0 items-center justify-between gap-2">
									<span className="truncate font-medium text-sm">{provider.label}</span>
									<HealthBadge health={provider.health} />
								</div>
								<div className="flex flex-wrap gap-1">
									{provider.layers.map((layer) => (
										<Badge key={layer} tone={layerBadgeTone(layer)}>
											{layer}
										</Badge>
									))}
									<Badge tone={provider.credential.configured ? "success" : "warn"}>
										{credentialShort(provider.credential.source)}
									</Badge>
									<Badge tone="muted">{catalogLabel(provider.catalog.mode)}</Badge>
								</div>
							</button>
						</li>
					))}
				</ul>
			)}
		</>
	);
}

function ProviderDetail({
	provider,
	tab,
	setTab,
	onBack,
	compatibility,
	addable,
	refresh,
	workspace,
}: {
	provider: ModelProviderRecord;
	tab: ProviderTab;
	setTab: (tab: ProviderTab) => void;
	onBack: () => void;
	compatibility: ModelProviderCompatibility | undefined;
	addable: ModelProviderOption[];
	refresh: () => Promise<void>;
	workspace: ReturnType<typeof useProviderWorkspace>;
}) {
	const { t } = useTranslation();
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [deleteError, setDeleteError] = useState<string | undefined>();
	const canDelete = canDeleteModelProvider(provider);
	const tabs: Array<{ id: ProviderTab; label: string; disabled?: boolean }> = [
		{ id: "connection", label: t("settings.providerWs.tab.connection") },
		{ id: "models", label: t("settings.providerWs.tab.models") },
		{ id: "advanced", label: t("settings.providerWs.tab.advanced") },
		{ id: "diagnostics", label: t("settings.providerWs.tab.diagnostics") },
	];

	useEffect(() => {
		setDeleteOpen(false);
		setDeleteError(undefined);
	}, [provider.id]);

	const handleDelete = useCallback(async () => {
		const revision = workspace.state.list?.revision;
		if (!revision) {
			setDeleteError(t("settings.providerWs.delete.missingRevision"));
			return;
		}
		setDeleteError(undefined);
		try {
			await workspace.remove(provider.id, revision);
			setDeleteOpen(false);
			onBack();
		} catch (error) {
			setDeleteError(error instanceof Error ? error.message : String(error));
		}
	}, [onBack, provider.id, t, workspace]);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<header className="flex items-center gap-2 border-b border-line bg-paper px-3 py-2">
				<button
					type="button"
					onClick={onBack}
					className="btn-ghost h-7 px-2 text-xs md:hidden"
				>
					{t("common.actions.back")}
				</button>
				<div className="flex min-w-0 flex-col">
					<div className="flex min-w-0 items-center gap-2">
						<span className="truncate text-sm font-semibold text-ink">{provider.label}</span>
						<HealthBadge health={provider.health} />
					</div>
					<div className="font-mono text-2xs text-ink-3">{provider.id}</div>
				</div>
				<div className="ml-auto flex items-center gap-2">
					{provider.runtime.availableModelCount > 0 ? (
						<Badge tone="muted">
							{t("settings.providerWs.models", { count: provider.runtime.availableModelCount })}
						</Badge>
					) : null}
					{!provider.editable ? <Badge tone="warn">{t("settings.providerWs.readOnly")}</Badge> : null}
					{canDelete ? (
						<button
							type="button"
							className="btn-danger h-7 px-2 text-xs"
							onClick={() => {
								setDeleteError(undefined);
								setDeleteOpen(true);
							}}
						>
							{t("common.actions.delete")}
						</button>
					) : null}
				</div>
			</header>
			<nav className="flex shrink-0 gap-1 border-b border-line bg-paper-2/40 p-2" aria-label={t("settings.providerWs.tab.connection")}>
				{tabs.map((entry) => (
					<button
						key={entry.id}
						type="button"
						role="tab"
						aria-selected={tab === entry.id}
						onClick={() => setTab(entry.id)}
						disabled={entry.disabled}
						className={cn(
							"rounded-md px-2 py-1 text-xs transition-colors",
							tab === entry.id ? "bg-accent-soft text-accent" : "text-ink-3 hover:bg-paper-3",
							entry.disabled && "cursor-not-allowed opacity-50",
						)}
					>
						{entry.label}
					</button>
				))}
			</nav>
			<div className="min-h-0 flex-1 overflow-auto p-4">
				{tab === "connection" ? (
					<ConnectionTab
						provider={provider}
						compatibility={compatibility}
						workspace={workspace}
						addable={addable}
					/>
				) : tab === "models" ? (
					<ModelCatalog
						provider={provider}
						compatibility={compatibility}
						workspaceRevision={workspace.state.list?.revision ?? ""}
						onSaved={workspace.refresh}
					/>
				) : tab === "advanced" ? (
					<AdvancedEditor
						provider={provider}
						compatibility={compatibility}
						sentinel={compatibility?.secretSentinel ?? "__OMP_DECK_SECRET__"}
					/>
				) : (
					<DiagnosticsPanel provider={provider} refresh={refresh} workspace={workspace} compatibility={compatibility} />
				)}
			</div>
			<Modal
				open={deleteOpen}
				onClose={() => setDeleteOpen(false)}
				widthClass="max-w-md"
				dismissOnBackdrop={!workspace.state.saving}
				dismissOnEscape={!workspace.state.saving}
			>
				<div className="space-y-4 p-5">
					<header>
						<h2 className="text-lg font-semibold text-ink">{t("settings.providerWs.delete.title")}</h2>
						<p className="mt-2 text-xs text-ink-3">
							{t("settings.providerWs.delete.help", { id: provider.id })}
						</p>
					</header>
					{deleteError ? <p className="text-xs text-danger" role="alert">{deleteError}</p> : null}
					<footer className="flex justify-end gap-2 border-t border-line pt-3">
						<button
							type="button"
							className="btn-ghost h-8 px-3 text-xs"
							onClick={() => setDeleteOpen(false)}
							disabled={workspace.state.saving}
						>
							{t("common.actions.cancel")}
						</button>
						<button
							type="button"
							className="btn-danger h-8 px-3 text-xs"
							onClick={() => void handleDelete()}
							disabled={workspace.state.saving}
						>
							{workspace.state.saving
								? t("settings.providerWs.delete.deleting")
								: t("settings.providerWs.delete.confirm")}
						</button>
					</footer>
				</div>
			</Modal>
		</div>
	);
}

function ConnectionTab({
	provider,
	compatibility,
	workspace,
	addable,
}: {
	provider: ModelProviderRecord;
	compatibility: ModelProviderCompatibility | undefined;
	workspace: ReturnType<typeof useProviderWorkspace>;
	addable: ModelProviderOption[];
}) {
	const { t } = useTranslation();
	const sentinel = compatibility?.secretSentinel ?? "__OMP_DECK_SECRET__";
	const original = provider.definition ?? {};
	const [formState, setFormState] = useState<ConnectionEditorState>(() =>
		emptyConnectionState(provider, sentinel),
	);
	const [credentialMode, setCredentialMode] = useState<CredentialMode>("preserve");
	const [credentialValue, setCredentialValue] = useState("");
	const [credentialRemovalArmed, setCredentialRemovalArmed] = useState(false);
	const [lastSavedSnapshot, setLastSavedSnapshot] = useState<ConnectionEditorState>(() =>
		emptyConnectionState(provider, sentinel),
	);
	const [saveError, setSaveError] = useState<ReturnType<typeof toConnectionError> | undefined>(undefined);

	useEffect(() => {
		const next = emptyConnectionState(provider, sentinel);
		setFormState(next);
		setLastSavedSnapshot(next);
		setCredentialMode("preserve");
		setCredentialValue("");
		setCredentialRemovalArmed(false);
		setSaveError(undefined);
	}, [provider.id, sentinel]);

	const dirty: DirtyReason = isDirty(formState, lastSavedSnapshot)
		? credentialMode !== "preserve"
			? "pending"
			: "editor"
		: "clean";

	const handleSave = useCallback(async () => {
		const definition = buildServerDefinition(formState, original);
		const operation = credentialOperationFor(credentialMode, credentialValue, credentialRemovalArmed);
		try {
			await workspace.saveDraft(provider.id, definition, operation);
			setLastSavedSnapshot(formState);
			setCredentialMode("preserve");
			setCredentialValue("");
			setCredentialRemovalArmed(false);
			setSaveError(undefined);
		} catch (error) {
			setSaveError(toConnectionError(error));
		}
	}, [formState, original, credentialMode, credentialValue, credentialRemovalArmed, workspace, provider.id]);

	const handleDiscard = useCallback(() => {
		setFormState(lastSavedSnapshot);
		setCredentialMode("preserve");
		setCredentialValue("");
		setCredentialRemovalArmed(false);
		setSaveError(undefined);
	}, [lastSavedSnapshot]);

	const handleReloadConflict = useCallback(async () => {
		await workspace.refresh();
		const next = emptyConnectionState(provider, sentinel);
		setFormState(next);
		setLastSavedSnapshot(next);
		setCredentialMode("preserve");
		setSaveError(undefined);
	}, [provider, sentinel, workspace]);

	return (
		<div className="space-y-4">
			<ConnectionEditor
				provider={provider}
				compatibility={compatibility}
				dirty={dirty !== "clean"}
				saving={workspace.state.saving}
				error={saveError}
				conflictRevision={workspace.state.list?.revision}
				currentRevision={workspace.state.list?.revision ?? ""}
				state={formState}
				setState={setFormState}
				credentialMode={credentialMode}
				credentialValue={credentialValue}
				credentialRemovalArmed={credentialRemovalArmed}
				setCredentialMode={setCredentialMode}
				setCredentialValue={setCredentialValue}
				setCredentialRemovalArmed={setCredentialRemovalArmed}
				onSave={handleSave}
				onDiscard={handleDiscard}
				onReloadConflict={handleReloadConflict}
			/>
			{addable && addable.length > 0 ? (
				<section className="rounded-md border border-line bg-paper p-3">
					<header className="meta">{t("settings.providerWs.connection.addOther")}</header>
					<ul className="mt-2 space-y-1 text-xs">
						{addable.map((option) => (
							<li key={option.id} className="flex items-center justify-between gap-2">
								<span className="font-mono">{option.label}</span>
								<Badge tone={option.kind === "oauth" ? "accent" : "muted"}>{option.kind}</Badge>
							</li>
						))}
					</ul>
				</section>
			) : null}
		</div>
	);
}

function AdvancedPanel({ provider }: { provider: ModelProviderRecord }) {
	const { t } = useTranslation();
	const definition = provider.definition ?? {};
	return (
		<div className="space-y-3">
			<section className="rounded-md border border-line bg-paper p-3">
				<header className="meta">{t("settings.providerWs.advanced.compat")}</header>
				<pre className="mt-2 max-h-72 overflow-auto rounded bg-paper-2 p-2 font-mono text-2xs">
					{JSON.stringify(definition.compat ?? {}, null, 2)}
				</pre>
			</section>
			<section className="rounded-md border border-line bg-paper p-3">
				<header className="meta">{t("settings.providerWs.advanced.headers")}</header>
				<pre className="mt-2 max-h-72 overflow-auto rounded bg-paper-2 p-2 font-mono text-2xs">
					{JSON.stringify(definition.headers ?? {}, null, 2)}
				</pre>
			</section>
			<section className="rounded-md border border-line bg-paper p-3 text-xs">
				<header className="meta">{t("settings.providerWs.advanced.options")}</header>
				<dl className="mt-2 grid grid-cols-[140px_1fr] gap-x-3 gap-y-1">
					<dt className="text-ink-3">transport</dt>
					<dd className="font-mono">{String(definition.transport ?? "—")}</dd>
					<dt className="text-ink-3">authHeader</dt>
					<dd className="font-mono">{String(definition.authHeader ?? "—")}</dd>
					<dt className="text-ink-3">disableStrictTools</dt>
					<dd className="font-mono">{String(definition.disableStrictTools ?? "—")}</dd>
				</dl>
			</section>
		</div>
	);
}

function DiagnosticsPanel({
	provider,
	refresh,
	workspace,
	compatibility,
}: {
	provider: ModelProviderRecord;
	refresh: () => Promise<void>;
	workspace: ReturnType<typeof useProviderWorkspace>;
	compatibility: ModelProviderCompatibility | undefined;
}) {
	const { t } = useTranslation();
	const [probeState, setProbeState] = useState<{
		running: boolean;
		response?: ProbeProviderResponse;
		error?: { code: string; message: string };
		lastRunAt?: string;
	}>({ running: false });
	const [inferenceEnabled, setInferenceEnabled] = useState(false);
	const [inferenceModel, setInferenceModel] = useState<string | undefined>();
	const [inferenceApi, setInferenceApi] = useState<ModelProviderApi | "auto">("auto");
	const [acknowledgeCost, setAcknowledgeCost] = useState(false);
	const [expandedAttempt, setExpandedAttempt] = useState<number | null>(null);

	useEffect(() => {
		setProbeState({ running: false });
		setInferenceEnabled(false);
		setInferenceModel(undefined);
		setAcknowledgeCost(false);
		setExpandedAttempt(null);
	}, [provider.id]);

	const runEndpointCheck = useCallback(async () => {
		await workspace.discover({ providerId: provider.id, forceRefresh: true }).catch(() => undefined);
		await refresh();
	}, [provider.id, workspace, refresh]);

	const runFullProbe = useCallback(
		async (inference?: { enabled: boolean; modelId?: string; api?: ModelProviderApi | "auto" }) => {
			setProbeState({ running: true });
			try {
				const request: ProbeProviderRequest = { providerId: provider.id, ...(inference ? { inference } : {}) };
				const response = await workspace.probe(request);
				setProbeState({ running: false, response, lastRunAt: new Date().toISOString() });
			} catch (error) {
				setProbeState({
					running: false,
					error: { code: "probe-failed", message: error instanceof Error ? error.message : "unknown" },
				});
			}
		},
		[provider.id, workspace],
	);

	const handleToggleInference = useCallback(
		(enabled: boolean) => {
			setInferenceEnabled(enabled);
			if (enabled) setAcknowledgeCost(false);
		},
		[],
	);

	const inferenceDisabledReason = inferenceEnabled && !acknowledgeCost ? "acknowledge" : undefined;
	const modelOptions = provider.definition?.models ?? [];

	return (
		<div className="space-y-3">
			<section className="rounded-md border border-line bg-paper p-3 text-xs">
				<header className="flex items-center justify-between">
					<span className="meta">{t("settings.providerWs.diagnostics.discovery")}</span>
					<div className="flex items-center gap-2">
						<button
							type="button"
							className="btn-ghost h-7 px-2 text-xs"
							onClick={() => void runEndpointCheck()}
						>
							{t("settings.providerWs.diagnostics.refresh")}
						</button>
					</div>
				</header>
				{provider.runtime.discovery ? (
					<dl className="mt-2 grid grid-cols-[140px_1fr] gap-x-3 gap-y-1">
						<dt className="text-ink-3">{t("settings.providerWs.diagnostics.Status_label")}</dt>
						<dd>
							<DiscoveryStatusBadge status={provider.runtime.discovery.status} stale={!!provider.runtime.discovery.stale} />
						</dd>
						<dt className="text-ink-3">{t("settings.providerWs.diagnostics.models")}</dt>
						<dd className="font-mono">{provider.runtime.discovery.modelIds?.length ?? 0}</dd>
						{provider.runtime.discovery.fetchedAt ? (
							<>
								<dt className="text-ink-3">{t("settings.providerWs.diagnostics.fetchedAt")}</dt>
								<dd className="font-mono text-2xs">{new Date(provider.runtime.discovery.fetchedAt).toLocaleString()}</dd>
							</>
						) : null}
						{provider.runtime.discovery.error ? (
							<>
								<dt className="text-ink-3">{t("settings.providerWs.diagnostics.error")}</dt>
								<dd className="break-words font-mono text-2xs text-danger">{provider.runtime.discovery.error}</dd>
							</>
						) : null}
					</dl>
				) : (
					<p className="mt-2 text-2xs text-ink-3">{t("settings.providerWs.diagnostics.noDiscovery")}</p>
				)}
			</section>

			<section className="rounded-md border border-line bg-paper p-3 text-xs">
				<header className="flex items-center justify-between">
					<span className="meta">{t("settings.providerWs.diagnostics.tabs")}</span>
					<button
						type="button"
						className="btn-ghost h-7 px-2 text-xs"
						disabled={probeState.running || (inferenceEnabled && inferenceDisabledReason === "acknowledge")}
						onClick={() => void runFullProbe(
							inferenceEnabled ? { enabled: inferenceEnabled, modelId: inferenceModel, api: inferenceApi } : undefined,
						)}
					>
						{probeState.running ? t("settings.providerWs.diagnostics.running") : t("settings.providerWs.diagnostics.runFullProbe")}
					</button>
				</header>
				{probeState.response ? (
					<ProbeSummary response={probeState.response} expandedAttempt={expandedAttempt} setExpandedAttempt={setExpandedAttempt} />
				) : probeState.error ? (
					<p className="mt-2 text-2xs text-danger">{probeState.error.message}</p>
				) : (
					<p className="mt-2 text-2xs text-ink-3">{t("settings.providerWs.diagnostics.idleHint")}</p>
				)}
			</section>

			<section className="rounded-md border border-line bg-paper p-3 text-xs">
				<header className="meta">{t("settings.providerWs.diagnostics.inferenceTitle")}</header>
				<p className="mt-1 text-2xs text-ink-3">{t("settings.providerWs.diagnostics.inferenceCostWarning")}</p>
				<label className="mt-2 flex items-center gap-2 text-2xs">
					<input
						type="checkbox"
						checked={inferenceEnabled}
						onChange={(event) => handleToggleInference(event.target.checked)}
					/>
					{t("settings.providerWs.diagnostics.inferenceEnable")}
				</label>
				{inferenceEnabled ? (
					<div className="mt-3 grid grid-cols-1 gap-3">
						<label className="flex flex-col gap-1 text-2xs">
							<span className="text-ink-3">{t("settings.providerWs.diagnostics.inferenceModel")}</span>
							<select
								className="field h-7 w-full max-w-md px-2 text-2xs"
								value={inferenceModel ?? ""}
								onChange={(event) => setInferenceModel(event.target.value || undefined)}
							>
								<option value="">—</option>
								{modelOptions.map((model) => (
									<option key={model.id} value={model.id}>
										{model.id}
									</option>
								))}
							</select>
						</label>
						<label className="flex flex-col gap-1 text-2xs">
							<span className="text-ink-3">{t("settings.providerWs.diagnostics.inferenceApi")}</span>
							<select
								className="field h-7 w-full max-w-md px-2 text-2xs"
								value={inferenceApi}
								onChange={(event) => setInferenceApi(event.target.value as ModelProviderApi | "auto")}
							>
								<option value="auto">auto</option>
								{(compatibility?.apis ?? []).map((api) => (
									<option key={api} value={api}>
										{api}
									</option>
								))}
							</select>
						</label>
						<label className="flex items-center gap-2 text-2xs text-warn">
							<input
								type="checkbox"
								checked={acknowledgeCost}
								onChange={(event) => setAcknowledgeCost(event.target.checked)}
							/>
							{t("settings.providerWs.diagnostics.inferenceAcknowledge")}
						</label>
					</div>
				) : null}
			</section>
		</div>
	);
}

function ProbeSummary({
	response,
	expandedAttempt,
	setExpandedAttempt,
}: {
	response: ProbeProviderResponse;
	expandedAttempt: number | null;
	setExpandedAttempt: (next: number | null) => void;
}) {
	const { t } = useTranslation();
	const ordered = (response.checks ?? []) as ProviderDiagnosticCheck[];
	const attempts = (response.attempts ?? []) as ProviderNetworkAttempt[];
	return (
		<div className="mt-2 space-y-1">
			{ordered.map((check, index) => (
				<DiagnosticRow key={`${check.id}-${index}`} check={check} index={index} />
			))}
			{attempts.length > 0 ? (
				<details open={expandedAttempt === 0} className="mt-2 rounded bg-paper-2 p-2 text-2xs">
					<summary
						className="cursor-pointer text-ink-3"
						onClick={(event) => event.preventDefault()}
					>
						{t("settings.providerWs.diagnostics.attempts", { count: attempts.length })}
					</summary>
					<ol className="mt-2 space-y-1">
						{attempts.map((attempt, index) => (
							<li key={`${attempt.url}-${index}`} className="font-mono">
								<button
									type="button"
									className="w-full text-left"
									onClick={() => setExpandedAttempt(expandedAttempt === index ? null : index)}
								>
									<span className="text-ink-3">{index + 1}.</span> {attempt.outcome} · {attempt.url}
									{attempt.status ? ` · HTTP ${attempt.status}` : ""}
								</button>
								{expandedAttempt === index ? (
									<p className="ml-4 mt-1 break-words">{attempt.detail ?? "—"}</p>
								) : null}
							</li>
						))}
					</ol>
				</details>
			) : null}
		</div>
	);
}

function DiagnosticRow({ check, index }: { check: ProviderDiagnosticCheck; index: number }) {
	const { t } = useTranslation();
	return (
		<div className="flex items-center justify-between gap-2 rounded bg-paper-2 px-2 py-1">
			<div className="flex items-center gap-2">
				<span className="font-mono text-2xs text-ink-3">{index + 1}</span>
				<span className="text-2xs uppercase tracking-meta text-ink-3">{check.id}</span>
			</div>
			<div className="flex items-center gap-2 text-2xs">
				<StatusBadge id={check.id} status={check.status} />
				<span className="text-ink-3">{t(`settings.providerWs.diagnostics.statusByCheck.${check.id}.${check.status}`)}</span>
				{check.latencyMs !== undefined ? <span className="font-mono">{check.latencyMs}ms</span> : null}
				{check.adapter ? <Badge tone="muted">{check.adapter}</Badge> : null}
			</div>
		</div>
	);
}

function StatusBadge({ id, status }: { id: ProviderDiagnosticCheckId; status: ProviderDiagnosticCheck["status"] }) {
	void id;
	if (status === "pass") return <Badge tone="success">pass</Badge>;
	if (status === "fail") return <Badge tone="danger">fail</Badge>;
	if (status === "unsupported") return <Badge tone="warn">unsupported</Badge>;
	return <Badge tone="muted">skip</Badge>;
}

function DiscoveryStatusBadge({ status, stale }: { status: string; stale: boolean }) {
	if (stale) return <Badge tone="warn">stale · {status}</Badge>;
	switch (status) {
		case "ok":
			return <Badge tone="success">ok</Badge>;
		case "empty":
			return <Badge tone="warn">empty</Badge>;
		case "unauthenticated":
			return <Badge tone="danger">401</Badge>;
		case "unavailable":
			return <Badge tone="danger">unavailable</Badge>;
		default:
			return <Badge tone="muted">{status}</Badge>;
	}
}

function HealthBadge({ health }: { health: ModelProviderRecord["health"] }) {
	const tone = health === "ready" ? "success" : health === "needs-auth" ? "warn" : health === "legacy" ? "muted" : "danger";
	return <Badge tone={tone}>{healthLabel(health)}</Badge>;
}

function layerBadgeTone(layer: ModelProviderRecord["layers"][number]): "accent" | "muted" {
	if (layer === "models-config" || layer === "oauth") return "accent";
	return "muted";
}

function catalogLabel(mode: ModelProviderRecord["catalog"]["mode"]): string {
	switch (mode) {
		case "dynamic":
			return "dynamic";
		case "pinned":
			return "pinned";
		case "hybrid":
			return "hybrid";
		default:
			return "builtin";
	}
}

function credentialShort(source: ModelProviderRecord["credential"]["source"]): string {
	switch (source) {
		case "managed-env":
			return "managed";
		case "external-env":
			return "external env";
		case "command":
			return "command";
		case "literal":
			return "literal";
		case "oauth":
			return "OAuth";
		default:
			return "no creds";
	}
}

function healthLabel(health: ModelProviderRecord["health"]): string {
	switch (health) {
		case "ready":
			return "ready";
		case "needs-auth":
			return "needs auth";
		case "config-error":
			return "config error";
		case "discovery-warning":
			return "discovery warn";
		default:
			return "legacy";
	}
}

function isDirty(a: ConnectionEditorState, b: ConnectionEditorState): boolean {
	if (a.baseUrl !== b.baseUrl) return true;
	if (a.api !== b.api) return true;
	if (a.authMode !== b.authMode) return true;
	if (a.discoveryType !== b.discoveryType) return true;
	if (a.authHeaderEnabled !== b.authHeaderEnabled) return true;
	if (a.keyless !== b.keyless) return true;
	if (a.customHeaders.length !== b.customHeaders.length) return true;
	for (let i = 0; i < a.customHeaders.length; i++) {
		const left = a.customHeaders[i]!;
		const right = b.customHeaders[i]!;
		if (left.name !== right.name || left.value !== right.value) return true;
	}
	return false;
}
