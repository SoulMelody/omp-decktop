import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
	ModelProviderApi,
	ModelProviderDiscoveryType,
	ModelProviderAuthMode,
	type ModelProviderCompatibility,
	type ModelProviderRecord,
	type RedactedProviderDefinition,
} from "@omp-deck/protocol";

import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { ProviderApiError } from "@/lib/model-providers-api";

export interface ConnectionEditorState {
	baseUrl: string;
	api: string;
	authMode: string;
	discoveryType: string;
	authHeaderEnabled: boolean;
	keyless: boolean;
	customHeaders: Array<{ name: string; value: string }>;
}

export interface ConnectionEditorProps {
	provider: ModelProviderRecord;
	compatibility: ModelProviderCompatibility | undefined;
	dirty: boolean;
	saving: boolean;
	error: ConnectionError | undefined;
	conflictRevision: string | undefined;
	currentRevision: string;
	state: ConnectionEditorState;
	setState: (next: ConnectionEditorState) => void;
	credentialMode: CredentialMode;
	credentialValue: string;
	credentialRemovalArmed: boolean;
	setCredentialMode: (mode: CredentialMode) => void;
	setCredentialValue: (value: string) => void;
	setCredentialRemovalArmed: (armed: boolean) => void;
	onSave: () => Promise<void>;
	onDiscard: () => void;
	onReloadConflict: () => void;
}

export type CredentialMode = "preserve" | "set" | "remove";

export interface ConnectionError {
	code: string;
	message: string;
	issues?: Array<{ path: string; message: string }>;
}

export function emptyConnectionState(provider: ModelProviderRecord, sentinel: string): ConnectionEditorState {
	const definition: RedactedProviderDefinition = provider.definition ?? {};
	const headers = sanitiseHeaders(definition.headers ?? {}, sentinel);
	const authHeader = definition.authHeader === true;
	const keyless = !(provider.credential.configured || provider.credential.managed);
	return {
		baseUrl: typeof definition.baseUrl === "string" ? definition.baseUrl : "",
		api: typeof definition.api === "string" ? definition.api : guessApiDefault(provider),
		authMode: typeof definition.auth === "string" ? definition.auth : defaultAuthMode(definition.api),
		discoveryType:
			typeof definition.discovery === "object" && definition.discovery !== null
				? ((definition.discovery as { type?: string }).type ?? "")
				: "",
		authHeaderEnabled: authHeader,
		keyless,
		customHeaders: headers.map((header) => ({
			name: header.name,
			value: header.value.includes(sentinel) ? sentinel : header.value,
		})),
	};
}

export function credentialOperationFor(
	mode: CredentialMode,
	value: string,
	armed: boolean,
): { action: "preserve" } | { action: "set"; value: string } | { action: "remove" } {
	if (mode === "set") return { action: "set", value };
	if (mode === "remove") return armed ? { action: "remove" } : { action: "preserve" };
	return { action: "preserve" };
}

export function detectCredentialMode(error: ConnectionError | undefined): CredentialMode {
	if (!error || error.code !== "validation") return "preserve";
	const issues = error.issues ?? [];
	if (issues.some((issue) => /credential.*invalid|missing|apiKey/i.test(issue.message))) {
		return "set";
	}
	return "preserve";
}

export function ConnectionEditor({
	provider,
	compatibility,
	dirty,
	saving,
	error,
	conflictRevision,
	currentRevision,
	state,
	setState,
	credentialMode,
	credentialValue,
	credentialRemovalArmed,
	setCredentialMode,
	setCredentialValue,
	setCredentialRemovalArmed,
	onSave,
	onDiscard,
	onReloadConflict,
}: ConnectionEditorProps) {
	const { t } = useTranslation();
	const apiOptions = useMemo(
		() => compatibility?.apis?.length ? compatibility.apis : fallbackApis,
		[compatibility],
	);
	const authModeOptions = useMemo(
		() => compatibility?.authModes?.length ? compatibility.authModes : fallbackAuthModes,
		[compatibility],
	);
	const discoveryOptions = useMemo(
		() => compatibility?.discoveryTypes?.length ? compatibility.discoveryTypes : fallbackDiscoveryTypes,
		[compatibility],
	);
	const isConflict = error?.code === "revision-conflict";

	const updateHeader = useCallback(
		(index: number, patch: Partial<{ name: string; value: string }>) => {
			setState({
				...state,
				customHeaders: state.customHeaders.map((entry, idx) =>
					idx === index ? { ...entry, ...patch } : entry,
				),
			});
		},
		[state, setState],
	);

	const addHeader = useCallback(() => {
		setState({
			...state,
			customHeaders: [...state.customHeaders, { name: "", value: "" }],
		});
	}, [state, setState]);

	const removeHeader = useCallback(
		(index: number) => {
			setState({
				...state,
				customHeaders: state.customHeaders.filter((_, idx) => idx !== index),
			});
		},
		[state, setState],
	);

	return (
		<div className="space-y-4">
			<section className="rounded-md border border-line bg-paper p-3">
				<header className="meta">{t("settings.providerWs.connection.identity")}</header>
				<dl className="mt-2 grid grid-cols-[160px_1fr] gap-x-3 gap-y-2 text-xs">
					<dt className="text-ink-3">{t("settings.providerWs.connection.id")}</dt>
					<dd className="break-all font-mono text-2xs text-ink-2">{provider.id}</dd>
					<dt className="text-ink-3">{t("settings.providerWs.connection.api")}</dt>
					<dd>
						<select
							className="field h-8 w-full max-w-sm px-2 text-xs"
							value={state.api}
							onChange={(event) => setState({ ...state, api: event.target.value })}
							disabled={saving}
						>
							{apiOptions.map((option) => (
								<option key={option} value={option}>
									{option}
								</option>
							))}
						</select>
					</dd>
					<dt className="text-ink-3">{t("settings.providerWs.connection.baseUrl")}</dt>
					<dd>
						<input
							className="field h-8 w-full max-w-md px-2 font-mono text-xs"
							value={state.baseUrl}
							onChange={(event) => setState({ ...state, baseUrl: event.target.value })}
							placeholder="https://api.example.com/v1"
							disabled={saving}
						/>
					</dd>
					<dt className="text-ink-3">{t("settings.providerWs.connection.discovery")}</dt>
					<dd>
						<select
							className="field h-8 w-full max-w-sm px-2 text-xs"
							value={state.discoveryType}
							onChange={(event) => setState({ ...state, discoveryType: event.target.value })}
							disabled={saving}
						>
							<option value="">—</option>
							{discoveryOptions.map((option) => (
								<option key={option} value={option}>
									{option}
								</option>
							))}
						</select>
					</dd>
				</dl>
			</section>

			<section className="rounded-md border border-line bg-paper p-3">
				<header className="meta">{t("settings.providerWs.connection.credential")}</header>
				<div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
					<Badge tone={provider.credential.configured ? "success" : "warn"}>
						{provider.credential.configured
							? t("settings.providerWs.connection.credentialStatus.configured")
							: t("settings.providerWs.connection.credentialStatus.missing")}
					</Badge>
					<Badge tone="muted">{provider.credential.source}</Badge>
					{provider.credential.managed ? (
						<Badge tone="accent">{t("settings.providerWs.connection.managed")}</Badge>
					) : null}
				</div>
				<fieldset className="mt-3 space-y-2">
					<legend className="text-2xs uppercase tracking-meta text-ink-3">{t("settings.providerWs.connection.credentialActions")}</legend>
					<CredentialModeRow
						mode="preserve"
						current={credentialMode}
						label={t("settings.providerWs.connection.credentialAction.preserve")}
						onChange={setCredentialMode}
						disabled={saving}
					/>
					<CredentialModeRow
						mode="set"
						current={credentialMode}
						label={t("settings.providerWs.connection.credentialAction.set")}
						onChange={setCredentialMode}
						disabled={saving}
					/>
					<CredentialModeRow
						mode="remove"
						current={credentialMode}
						label={t("settings.providerWs.connection.credentialAction.remove")}
						onChange={setCredentialMode}
						disabled={saving}
					/>
					{credentialMode === "set" ? (
						<input
							type="password"
							autoComplete="off"
							className="field h-8 w-full max-w-md px-2 font-mono text-xs"
							placeholder={provider.credential.managed ? "(existing managed value)" : "sk-…"}
							value={credentialValue}
							onChange={(event) => setCredentialValue(event.target.value)}
							disabled={saving}
						/>
					) : null}
					{credentialMode === "remove" ? (
						<label className="flex items-center gap-2 text-2xs text-ink-3">
							<input
								type="checkbox"
								checked={credentialRemovalArmed}
								onChange={(event) => setCredentialRemovalArmed(event.target.checked)}
								disabled={saving}
							/>
							{t("settings.providerWs.connection.credentialRemovalArmed")}
						</label>
					) : null}
				</fieldset>
				<p className="mt-2 text-2xs text-ink-3">{t("settings.providerWs.connection.credentialHint")}</p>
			</section>

			<section className="rounded-md border border-line bg-paper p-3">
				<header className="meta">{t("settings.providerWs.connection.advanced")}</header>
				<dl className="mt-2 grid grid-cols-[160px_1fr] gap-x-3 gap-y-2 text-xs">
					<dt className="text-ink-3">{t("settings.providerWs.connection.authMode")}</dt>
					<dd>
						<select
							className="field h-8 w-full max-w-sm px-2 text-xs"
							value={state.authMode}
							onChange={(event) => setState({ ...state, authMode: event.target.value })}
							disabled={saving}
						>
							<option value="">—</option>
							{authModeOptions.map((option) => (
								<option key={option} value={option}>
									{option}
								</option>
							))}
						</select>
					</dd>
					<dt className="text-ink-3">{t("settings.providerWs.connection.authHeader")}</dt>
					<dd className="flex items-center gap-3">
						<label className="flex items-center gap-2 text-2xs">
							<input
								type="checkbox"
								checked={state.authHeaderEnabled}
								onChange={(event) =>
									setState({ ...state, authHeaderEnabled: event.target.checked })
								}
								disabled={saving}
							/>
							<span>Authorization / x-api-key</span>
						</label>
						<label className="flex items-center gap-2 text-2xs">
							<input
								type="checkbox"
								checked={state.keyless}
								onChange={(event) => setState({ ...state, keyless: event.target.checked })}
								disabled={saving}
							/>
							<span>{t("settings.providerWs.connection.keyless")}</span>
						</label>
					</dd>
				</dl>
				<div className="mt-3 space-y-2">
					<header className="flex items-center justify-between">
						<span className="meta">{t("settings.providerWs.connection.headers")}</span>
						<button
							type="button"
							className="btn-ghost h-7 px-2 text-xs"
							onClick={addHeader}
							disabled={saving}
						>
							{t("settings.providerWs.connection.addHeader")}
						</button>
					</header>
					{state.customHeaders.length === 0 ? (
						<p className="text-2xs text-ink-3">{t("settings.providerWs.connection.headersEmpty")}</p>
					) : (
						<table className="w-full text-xs">
							<thead className="text-2xs uppercase tracking-meta text-ink-3">
								<tr>
									<th className="w-1/3 px-1 py-1 text-left">{t("settings.providerWs.connection.headerName")}</th>
									<th className="px-1 py-1 text-left">{t("settings.providerWs.connection.headerValue")}</th>
									<th className="w-12" aria-label="remove"></th>
								</tr>
							</thead>
							<tbody>
								{state.customHeaders.map((row, index) => (
									<tr key={`${row.name}-${index}`}>
										<td className="px-1 py-1">
											<input
												className="field h-7 w-full px-2 font-mono text-2xs"
												value={row.name}
												onChange={(event) => updateHeader(index, { name: event.target.value })}
												disabled={saving}
											/>
										</td>
										<td className="px-1 py-1">
											<input
												type="password"
												className="field h-7 w-full px-2 font-mono text-2xs"
												value={row.value}
												onChange={(event) => updateHeader(index, { value: event.target.value })}
												disabled={saving}
											/>
										</td>
										<td className="px-1 py-1 text-right">
											<button
												type="button"
												className="btn-ghost h-7 px-2 text-2xs"
												onClick={() => removeHeader(index)}
												disabled={saving}
											>
												×
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</div>
			</section>

			{error ? (
				<section
					className={cn(
						"rounded-md border p-3 text-xs",
						isConflict
							? "border-warn/40 bg-warn/10 text-warn"
							: "border-danger/40 bg-danger/10 text-danger",
					)}
				>
					<div className="meta">{t(`settings.providerWs.errors.${error.code}`)}</div>
					<p className="mt-1">{error.message}</p>
					{error.issues && error.issues.length > 0 ? (
						<ul className="mt-2 space-y-1 text-2xs">
							{error.issues.map((issue) => (
								<li key={`${issue.path}-${issue.message}`} className="font-mono">
									<span className="text-ink-3">{issue.path}</span>: {issue.message}
								</li>
							))}
						</ul>
					) : null}
					{isConflict ? (
						<div className="mt-3 flex flex-wrap gap-2">
							<button
								type="button"
								className="btn-ghost h-7 px-2 text-xs"
								onClick={onReloadConflict}
								disabled={!conflictRevision || conflictRevision === currentRevision}
							>
								{t("settings.providerWs.actions.reload")}
							</button>
							<button
								type="button"
								className="btn-ghost h-7 px-2 text-xs"
								onClick={onDiscard}
							>
								{t("settings.providerWs.actions.discard")}
							</button>
						</div>
					) : null}
				</section>
			) : null}

			<footer className="sticky bottom-0 -mx-4 flex items-center justify-between gap-2 border-t border-line bg-paper/95 p-3">
				<div className="text-2xs text-ink-3">
					{dirty ? t("settings.providerWs.dirty") : t("settings.providerWs.clean")}
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						className="btn-ghost h-8 px-3 text-xs"
						onClick={onDiscard}
						disabled={!dirty || saving}
					>
						{t("common.actions.discard")}
					</button>
					<button
						type="button"
						className="btn-primary h-8 px-3 text-xs"
						onClick={() => void onSave()}
						disabled={saving || (!dirty && credentialMode === "preserve")}
					>
						{saving ? t("common.actions.saving") : t("common.actions.save")}
					</button>
				</div>
			</footer>
		</div>
	);
}

function CredentialModeRow({
	mode,
	current,
	label,
	onChange,
	disabled,
}: {
	mode: CredentialMode;
	current: CredentialMode;
	label: string;
	onChange: (mode: CredentialMode) => void;
	disabled: boolean;
}) {
	return (
		<label className={cn("flex items-center gap-2 text-xs", disabled && "opacity-50")}>
			<input
				type="radio"
				name="credential-mode"
				value={mode}
				checked={current === mode}
				onChange={() => onChange(mode)}
				disabled={disabled}
			/>
			{label}
		</label>
	);
}

const fallbackApis: ModelProviderApi[] = [
	"openai-completions",
	"openai-responses",
	"anthropic-messages",
	"google-generative-ai",
];
const fallbackAuthModes: ModelProviderAuthMode[] = ["apiKey", "none", "oauth"];
const fallbackDiscoveryTypes: ModelProviderDiscoveryType[] = [
	"openai-models-list",
	"ollama",
	"lm-studio",
	"litellm",
];

function guessApiDefault(provider: ModelProviderRecord): string {
	if (provider.id.startsWith("claude")) return "anthropic-messages";
	if (provider.id.startsWith("gpt") || provider.id.startsWith("openai")) return "openai-completions";
	if (provider.id.includes("gemini")) return "google-generative-ai";
	return fallbackApis[0] as string;
}

function defaultAuthMode(api: unknown): string {
	if (api === "anthropic-messages") return "apiKey";
	return "apiKey";
}

function sanitiseHeaders(headers: Record<string, unknown>, sentinel: string): Array<{ name: string; value: string }> {
	return Object.entries(headers)
		.filter((entry): entry is [string, string] => typeof entry[1] === "string")
		.map(([name, value]) => ({ name, value: value.includes(sentinel) ? sentinel : value }));
}

export function isConflictError(error: ConnectionError | undefined): boolean {
	return error?.code === "revision-conflict";
}

export function toConnectionError(error: unknown): ConnectionError {
	if (error instanceof ProviderApiError) {
		return {
			code: error.code,
			message: error.message,
			...(error.issues.length > 0 ? { issues: error.issues } : {}),
		};
	}
	return {
		code: "unknown",
		message: error instanceof Error ? error.message : "unknown error",
	};
}

export function buildServerDefinition(
	state: ConnectionEditorState,
	current: RedactedProviderDefinition | undefined,
): RedactedProviderDefinition {
	const definition: RedactedProviderDefinition = { ...current };
	definition.baseUrl = state.baseUrl.trim();
	if (state.api) definition.api = state.api as ModelProviderApi;
	if (state.discoveryType) {
		definition.discovery = { type: state.discoveryType as ModelProviderDiscoveryType };
	}
	if (state.authMode) definition.auth = state.authMode as ModelProviderAuthMode;
	definition.authHeader = state.authHeaderEnabled || undefined;
	if (state.keyless) definition.apiKey = undefined as unknown as never;
	const headers: Record<string, string> = {};
	for (const row of state.customHeaders) {
		const name = row.name.trim();
		if (!name) continue;
		headers[name] = row.value;
	}
	if (Object.keys(headers).length > 0) {
		definition.headers = headers;
	} else if (definition.headers) {
		definition.headers = {};
	}
	return definition;
}

