import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	ModelProviderCompatibility,
	ModelProviderRecord,
	RedactedProviderDefinition,
} from "@omp-deck/protocol";

import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

export interface AdvancedEditorProps {
	provider: ModelProviderRecord;
	compatibility: ModelProviderCompatibility | undefined;
	sentinel: string;
}

interface ParsedAdvanced {
	compat: Record<string, unknown>;
	headers: Array<{ name: string; value: string }>;
	options: {
		transport?: string;
		authHeader: boolean;
		disableStrictTools: boolean;
	};
	remoteCompaction: Record<string, unknown>;
	jsonOverride: string;
	jsonError: string | undefined;
}

function parseAdvanced(definition: RedactedProviderDefinition, sentinel: string): ParsedAdvanced {
	const transport = typeof definition.transport === "string" ? definition.transport : undefined;
	const authHeader = definition.authHeader === true;
	const disableStrictTools = definition.disableStrictTools === true;
	const compat = (definition.compat as Record<string, unknown>) ?? {};
	const remoteCompaction = (definition.remoteCompaction as Record<string, unknown>) ?? {};
	const headers = Object.entries(definition.headers ?? {})
		.filter((entry): entry is [string, string] => typeof entry[1] === "string")
		.map(([name, value]) => ({ name, value: value.includes(sentinel) ? sentinel : value }));
	return {
		compat,
		headers,
		options: {
			...(transport ? { transport } : {}),
			authHeader,
			disableStrictTools,
		},
		remoteCompaction,
		jsonOverride: JSON.stringify(definition, null, 2),
		jsonError: undefined,
	};
}

export function AdvancedEditor({ provider, compatibility, sentinel }: AdvancedEditorProps) {
	const { t } = useTranslation();
	const originalDefinition: RedactedProviderDefinition = useMemo(
		() => provider.definition ?? {},
		[provider.id],
	);
	const [draft, setDraft] = useState<ParsedAdvanced>(() => parseAdvanced(originalDefinition, sentinel));
	const [advancedView, setAdvancedView] = useState<"structured" | "json">("structured");
	const [saved, setSaved] = useState<ParsedAdvanced>(() => parseAdvanced(originalDefinition, sentinel));
	const [dirty, setDirty] = useState(false);

	useEffect(() => {
		const next = parseAdvanced(originalDefinition, sentinel);
		setDraft(next);
		setSaved(next);
		setDirty(false);
		setAdvancedView("structured");
	}, [provider.id, sentinel]);

	const dirtyNow = useMemo(() => isDirty(draft, saved), [draft, saved]);

	const update = useCallback(
		(patch: Partial<ParsedAdvanced>) => {
			setDraft((current) => ({ ...current, ...patch }));
			setDirty(true);
		},
		[],
	);

	const updateHeader = useCallback((index: number, patch: Partial<{ name: string; value: string }>) => {
		setDraft((current) => ({
			...current,
			headers: current.headers.map((entry, idx) => (idx === index ? { ...entry, ...patch } : entry)),
		}));
		setDirty(true);
	}, []);

	const addHeader = useCallback(() => {
		setDraft((current) => ({
			...current,
			headers: [...current.headers, { name: "", value: "" }],
		}));
		setDirty(true);
	}, []);

	const removeHeader = useCallback((index: number) => {
		setDraft((current) => ({
			...current,
			headers: current.headers.filter((_, idx) => idx !== index),
		}));
		setDirty(true);
	}, []);

	const submitJson = useCallback(() => {
		try {
			const parsed = JSON.parse(draft.jsonOverride);
			if (!isRecord(parsed)) throw new Error("must be an object");
			setDraft((current) => ({ ...current, jsonError: undefined }));
			setDraft((current) => ({
				...current,
				jsonError: undefined,
			}));
			const next: ParsedAdvanced = {
				compat: isRecord(parsed.compat) ? (parsed.compat as Record<string, unknown>) : {},
				headers: Object.entries(parsed.headers ?? {})
					.filter((entry): entry is [string, string] => typeof entry[1] === "string")
					.map(([name, value]) => ({ name, value: String(value) })),
				options: {
					...(typeof parsed.transport === "string" ? { transport: parsed.transport } : {}),
					authHeader: parsed.authHeader === true,
					disableStrictTools: parsed.disableStrictTools === true,
				},
				remoteCompaction: isRecord(parsed.remoteCompaction)
					? (parsed.remoteCompaction as Record<string, unknown>)
					: {},
				jsonOverride: draft.jsonOverride,
				jsonError: undefined,
			};
			update(next);
		} catch (error) {
			update({ jsonError: error instanceof Error ? error.message : "invalid json" });
		}
	}, [draft.jsonOverride, update]);

	const handleSave = useCallback(async () => {
		const definition = buildAdvancedDefinition(draft, saved.jsonOverride);
		try {
			const response = await fetch(`/api/model-providers/${encodeURIComponent(provider.id)}`, {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					revision: compatibility?.apis ? await latestRevision() : "",
					definition,
					credential: { action: "preserve" },
				}),
			});
			if (!response.ok) {
				const body = await response.json().catch(() => null);
				throw new Error(typeof body?.message === "string" ? body.message : response.statusText);
			}
			setSaved(draft);
			setDirty(false);
		} catch (error) {
			update({ jsonError: error instanceof Error ? error.message : "save failed" });
		}
	}, [draft, saved, provider.id, compatibility, update]);

	const handleDiscard = useCallback(() => {
		setDraft(saved);
		setDirty(false);
		setAdvancedView("structured");
	}, [saved]);

	void dirty;

	const apis = compatibility?.apis ?? [];

	return (
		<div className="space-y-3">
			<div className="flex items-center gap-2">
				<button
					type="button"
					role="tab"
					aria-selected={advancedView === "structured"}
					onClick={() => setAdvancedView("structured")}
					className={cn(
						"rounded-md px-2 py-1 text-xs",
						advancedView === "structured" ? "bg-accent-soft text-accent" : "text-ink-3 hover:bg-paper-3",
					)}
				>
					{t("settings.providerWs.advanced.structured")}
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={advancedView === "json"}
					onClick={() => setAdvancedView("json")}
					className={cn(
						"rounded-md px-2 py-1 text-xs",
						advancedView === "json" ? "bg-accent-soft text-accent" : "text-ink-3 hover:bg-paper-3",
					)}
				>
					{t("settings.providerWs.advanced.json")}
				</button>
			</div>
			{advancedView === "structured" ? (
				<div className="space-y-3">
					<section className="rounded-md border border-line bg-paper p-3">
						<header className="meta">{t("settings.providerWs.advanced.compat")}</header>
						<pre className="mt-2 max-h-72 overflow-auto rounded bg-paper-2 p-2 font-mono text-2xs">
							{JSON.stringify(draft.compat, null, 2)}
						</pre>
						<p className="mt-2 text-2xs text-ink-3">{t("settings.providerWs.advanced.compatHint")}</p>
					</section>
					<section className="rounded-md border border-line bg-paper p-3">
						<header className="meta">{t("settings.providerWs.advanced.options")}</header>
						<dl className="mt-2 grid grid-cols-[160px_1fr] gap-x-3 gap-y-2 text-xs">
							<dt className="text-ink-3">transport</dt>
							<dd>
								<input
									className="field h-8 w-full max-w-md px-2 font-mono text-2xs"
									value={draft.options.transport ?? ""}
									onChange={(event) =>
										update({ options: { ...draft.options, transport: event.target.value } })
									}
									placeholder="pi-native"
								/>
							</dd>
							<dt className="text-ink-3">authHeader</dt>
							<dd>
								<label className="flex items-center gap-2 text-2xs">
									<input
										type="checkbox"
										checked={draft.options.authHeader}
										onChange={(event) =>
											update({ options: { ...draft.options, authHeader: event.target.checked } })
										}
									/>
									emit Authorization / x-api-key
								</label>
							</dd>
							<dt className="text-ink-3">disableStrictTools</dt>
							<dd>
								<label className="flex items-center gap-2 text-2xs">
									<input
										type="checkbox"
										checked={draft.options.disableStrictTools}
										onChange={(event) =>
											update({ options: { ...draft.options, disableStrictTools: event.target.checked } })
										}
									/>
									relax tool-call shape enforcement
								</label>
							</dd>
						</dl>
					</section>
					<section className="rounded-md border border-line bg-paper p-3">
						<header className="flex items-center justify-between">
							<span className="meta">{t("settings.providerWs.connection.headers")}</span>
							<button type="button" className="btn-ghost h-7 px-2 text-xs" onClick={addHeader}>
								{t("settings.providerWs.connection.addHeader")}
							</button>
						</header>
						{draft.headers.length === 0 ? (
							<p className="mt-2 text-2xs text-ink-3">{t("settings.providerWs.connection.headersEmpty")}</p>
						) : (
							<table className="mt-2 w-full text-xs">
								<thead className="text-2xs uppercase tracking-meta text-ink-3">
									<tr>
										<th className="w-1/3 px-1 py-1 text-left">{t("settings.providerWs.connection.headerName")}</th>
										<th className="px-1 py-1 text-left">{t("settings.providerWs.connection.headerValue")}</th>
										<th className="w-12" aria-label="remove"></th>
									</tr>
								</thead>
								<tbody>
									{draft.headers.map((row, index) => (
										<tr key={`${row.name}-${index}`}>
											<td className="px-1 py-1">
												<input
													className="field h-7 w-full px-2 font-mono text-2xs"
													value={row.name}
													onChange={(event) => updateHeader(index, { name: event.target.value })}
												/>
											</td>
											<td className="px-1 py-1">
												<input
													type="password"
													className="field h-7 w-full px-2 font-mono text-2xs"
													value={row.value}
													onChange={(event) => updateHeader(index, { value: event.target.value })}
												/>
											</td>
											<td className="px-1 py-1 text-right">
												<button
													type="button"
													className="btn-ghost h-7 px-2 text-2xs"
													onClick={() => removeHeader(index)}
												>
													×
												</button>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						)}
					</section>
				</div>
			) : (
				<section className="rounded-md border border-line bg-paper p-3">
					<header className="meta">{t("settings.providerWs.advanced.jsonEditor")}</header>
					<textarea
						value={draft.jsonOverride}
						onChange={(event) => update({ jsonOverride: event.target.value })}
						className="field mt-2 min-h-[280px] w-full p-2 font-mono text-2xs"
						spellCheck={false}
					/>
					{draft.jsonError ? (
						<p className="mt-2 text-2xs text-danger">{draft.jsonError}</p>
					) : (
						<p className="mt-2 text-2xs text-ink-3">
							{t("settings.providerWs.advanced.jsonHint", { sentinel })}
						</p>
					)}
					<div className="mt-2 flex items-center gap-2">
						<button type="button" className="btn-ghost h-7 px-2 text-xs" onClick={submitJson}>
							{t("settings.providerWs.advanced.applyJson")}
						</button>
						<Badge tone={dirtyNow ? "warn" : "muted"}>
							{dirtyNow ? t("settings.providerWs.dirty") : t("settings.providerWs.clean")}
						</Badge>
					</div>
				</section>
			)}
			<footer className="sticky bottom-0 -mx-4 flex items-center justify-between gap-2 border-t border-line bg-paper/95 p-3">
				<div className="text-2xs text-ink-3">
					{apis.length > 0
						? t("settings.providerWs.advanced.compatibilityApis", { apis: apis.join(", ") })
						: t("settings.providerWs.advanced.compatibilityHint")}
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						className="btn-ghost h-8 px-3 text-xs"
						onClick={handleDiscard}
						disabled={!dirtyNow}
					>
						{t("common.actions.discard")}
					</button>
					<button
						type="button"
						className="btn-primary h-8 px-3 text-xs"
						onClick={() => void handleSave()}
						disabled={!dirtyNow}
					>
						{t("common.actions.save")}
					</button>
				</div>
			</footer>
		</div>
	);
}

function buildAdvancedDefinition(draft: ParsedAdvanced, fallbackJson: string): RedactedProviderDefinition {
	const next: RedactedProviderDefinition = {};
	const headers: Record<string, string> = {};
	for (const row of draft.headers) {
		const name = row.name.trim();
		if (!name) continue;
		headers[name] = row.value;
	}
	if (Object.keys(headers).length > 0) next.headers = headers;
	if (draft.options.transport) next.transport = draft.options.transport as "pi-native";
	if (draft.options.authHeader) next.authHeader = true;
	if (draft.options.disableStrictTools) next.disableStrictTools = true;
	if (Object.keys(draft.compat).length > 0) next.compat = draft.compat;
	if (Object.keys(draft.remoteCompaction).length > 0)
		next.remoteCompaction = draft.remoteCompaction;
	if (draft.jsonOverride.trim() !== fallbackJson.trim()) {
		try {
			const parsed = JSON.parse(draft.jsonOverride);
			if (isRecord(parsed)) {
				for (const [key, value] of Object.entries(parsed)) {
					if (isReservedAdvancedKey(key)) continue;
					(next as Record<string, unknown>)[key] = value;
				}
			}
		} catch {
			// ignore; jsonError already shown to the user
		}
	}
	return next;
}

function isReservedAdvancedKey(key: string): boolean {
	return [
		"baseUrl",
		"api",
		"discovery",
		"auth",
		"authHeader",
		"headers",
		"models",
		"modelOverrides",
		"compat",
		"remoteCompaction",
		"transport",
		"disableStrictTools",
		"apiKey",
	].includes(key);
}

function isDirty(a: ParsedAdvanced, b: ParsedAdvanced): boolean {
	return JSON.stringify({ ...a, jsonError: undefined }) === JSON.stringify({ ...b, jsonError: undefined });
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function latestRevision(): Promise<string> {
	const response = await fetch("/api/model-providers", { method: "GET", cache: "no-store" });
	if (!response.ok) return "";
	const body = (await response.json()) as { revision?: string };
	return body.revision ?? "";
}
