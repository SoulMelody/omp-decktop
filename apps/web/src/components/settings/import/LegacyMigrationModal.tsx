import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";

import { ProviderApiError, modelProviderApi } from "@/lib/model-providers-api";

interface LegacyEntry {
	id: string;
	location: "active" | "disabled";
}

interface LegacyMigrationModalProps {
	open: boolean;
	onClose: () => void;
	revision: string;
	onComplete?: () => void;
}

interface ManualMapping {
	api: string;
	baseUrl: string;
	targetId: string;
}

export function LegacyMigrationModal({ open, onClose, revision, onComplete }: LegacyMigrationModalProps) {
	const { t } = useTranslation();
	const [entries, setEntries] = useState<LegacyEntry[]>([]);
	const [selected, setSelected] = useState<LegacyEntry | null>(null);
	const [manual, setManual] = useState<ManualMapping | null>(null);
	const [status, setStatus] = useState<"idle" | "running" | "error" | "done">("idle");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		void (async () => {
			try {
				const response = await modelProviderApi.discoverLegacy();
				setEntries(
					response.extensions.map(
						(entry): LegacyEntry => ({
							id: entry.id,
							location: entry.location === "disabled" ? "disabled" : "active",
						}),
					),
				);
			} catch (err) {
				setError(errorMessage(err));
			}
		})();
	}, [open]);

	const handleMigrate = useCallback(async () => {
		if (!selected) return;
		setStatus("running");
		setError(null);
		try {
			if (!manual) {
				throw new Error(t("settings.providerWs.legacy.manualFallbackRequired"));
			}
			await modelProviderApi.migrateLegacy({
				revision,
				extensionPath: selected.id,
				mapping: {
					sourceKey: `${selected.id}::legacy`,
					targetId: manual.targetId || selected.id.replace(/^ccswitch-/, ""),
					api: manual.api as never,
					baseUrl: manual.baseUrl,
					migrateCredential: false,
					catalogStrategy: "dynamic",
					collisionAction: "new",
					confirmReplace: false,
				},
			});
			setStatus("done");
			setSelected(null);
			setManual(null);
			onComplete?.();
		} catch (err) {
			setStatus("error");
			setError(errorMessage(err));
		}
	}, [selected, manual, revision, onComplete, t]);

	const handleRollback = useCallback(async () => {
		if (!selected) return;
		setStatus("running");
		setError(null);
		try {
			await modelProviderApi.rollbackLegacy({
				revision,
				providerId: selected.id,
				backupPath: `${replacePath().home}/.omp/agent/disabled-extensions/${selected.id}`,
			});
			setStatus("done");
			setSelected(null);
			onComplete?.();
		} catch (err) {
			setStatus("error");
			setError(errorMessage(err));
		}
	}, [revision, selected, onComplete]);

	return (
		<Modal open={open} onClose={onClose} widthClass="max-w-2xl">
			<div className="flex flex-col gap-4 p-5">
				<header className="flex flex-col gap-1">
					<h2 className="text-lg font-semibold text-ink">{t("settings.providerWs.legacy.title")}</h2>
					<p className="text-2xs text-ink-3">{t("settings.providerWs.legacy.explainer")}</p>
				</header>

				{entries.length === 0 ? (
					<p className="rounded-md border border-dashed border-line p-3 text-2xs text-ink-3">
						{t("settings.providerWs.legacy.empty")}
					</p>
				) : (
					<table className="w-full text-xs">
						<thead className="text-2xs uppercase tracking-meta text-ink-3">
							<tr>
								<th className="px-2 py-1 text-left">id</th>
								<th className="px-2 py-1 text-left">location</th>
								<th className="px-2 py-1 text-left">{t("settings.providerWs.legacy.actions")}</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-line">
							{entries.map((entry) => (
								<tr key={entry.id}>
									<td className="px-2 py-1 font-mono text-2xs">{entry.id}</td>
									<td className="px-2 py-1">
										<Badge tone={entry.location === "active" ? "warn" : "muted"}>
											{entry.location}
										</Badge>
									</td>
									<td className="px-2 py-1">
										{entry.location === "active" ? (
											<button
												type="button"
												className="btn-ghost h-6 px-2 text-2xs"
												onClick={() => {
													setSelected(entry);
													setManual({ api: "openai-completions", baseUrl: "", targetId: entry.id.replace(/^ccswitch-/, "") });
												}}
											>
												{t("settings.providerWs.legacy.migrate")}
											</button>
										) : (
											<button
												type="button"
												className="btn-ghost h-6 px-2 text-2xs"
												onClick={() => setSelected(entry)}
											>
												{t("settings.providerWs.legacy.rollback")}
											</button>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}

				{selected && manual ? (
					<section className="rounded-md border border-line bg-paper-2/40 p-3 text-2xs">
						<header className="meta">{t("settings.providerWs.legacy.manualTitle")}</header>
						<p className="mt-1 text-ink-3">{t("settings.providerWs.legacy.manualHint")}</p>
						<dl className="mt-2 grid grid-cols-[80px_1fr] gap-x-2 gap-y-1">
							<dt className="text-ink-3">targetId</dt>
							<dd>
								<input
									value={manual.targetId}
									onChange={(event) => setManual({ ...manual, targetId: event.target.value })}
									className="field h-7 w-full max-w-xs px-2 font-mono"
								/>
							</dd>
							<dt className="text-ink-3">api</dt>
							<dd>
								<input
									value={manual.api}
									onChange={(event) => setManual({ ...manual, api: event.target.value })}
									className="field h-7 w-full max-w-xs px-2 font-mono"
								/>
							</dd>
							<dt className="text-ink-3">baseUrl</dt>
							<dd>
								<input
									value={manual.baseUrl}
									onChange={(event) => setManual({ ...manual, baseUrl: event.target.value })}
									className="field h-7 w-full max-w-md px-2 font-mono"
									placeholder="https://…"
								/>
							</dd>
						</dl>
					</section>
				) : null}

				{error ? <p className="text-2xs text-danger">{error}</p> : null}
				{status === "done" ? <p className="text-2xs text-success">{t("settings.providerWs.legacy.done")}</p> : null}

				<footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
					<button type="button" className="btn-ghost h-8 px-3 text-xs" onClick={onClose}>
						{t("common.actions.close")}
					</button>
					{selected && manual ? (
						<button
							type="button"
							className="btn-ghost h-8 px-3 text-xs"
							disabled={status === "running"}
							onClick={() => void handleRollback()}
						>
							{t("settings.providerWs.legacy.rollback")}
						</button>
					) : null}
					{selected && manual ? (
						<button
							type="button"
							className="btn-primary h-8 px-3 text-xs"
							disabled={status === "running"}
							onClick={() => void handleMigrate()}
						>
							{status === "running" ? t("common.actions.saving") : t("settings.providerWs.legacy.migrate")}
						</button>
					) : null}
				</footer>
			</div>
		</Modal>
	);
}

function replacePath(): { home: string } {
	return { home: "" };
}

void replacePath;

function errorMessage(error: unknown): string {
	if (error instanceof ProviderApiError) return `${error.code}: ${error.message}`;
	return error instanceof Error ? error.message : String(error);
}
