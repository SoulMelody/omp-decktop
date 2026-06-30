import { useEffect, useState } from "react";
import type { ProviderInfo } from "@omp-deck/protocol";
import type { CcSwitchProvider, CcSwitchImportResultEntry } from "@omp-deck/protocol";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { OAuthFlowModal } from "@/components/settings/OAuthFlowModal";
import { authApi } from "@/lib/auth-api";
import { ccSwitchApi } from "@/lib/ccswitch-api";
import { cn } from "@/lib/utils";

/**
 * Providers section — multi-tab layout: Logged In / Not Configured / cc-switch.
 * Login opens OAuthFlowModal; Revoke clears credentials and fires
 * `models_changed` server-side. cc-switch tab imports from local DB.
 */
type ProviderTab = "loggedin" | "unconfigured" | "ccswitch";

export function ProvidersSection() {
	const [providers, setProviders] = useState<ProviderInfo[] | null>(null);
	const [error, setError] = useState<string | undefined>();
	const [loading, setLoading] = useState(true);
	const [activeFlow, setActiveFlow] = useState<{ id: string; name: string } | null>(null);
	const [confirmRevoke, setConfirmRevoke] = useState<{ id: string; name: string } | null>(null);
	const [revoking, setRevoking] = useState(false);

	const loggedIn = providers?.filter((p) => p.state !== "unconfigured") ?? [];
	const unconfigured = providers?.filter((p) => p.state === "unconfigured") ?? [];

	const [tab, setTab] = useState<ProviderTab>("loggedin");

	async function refresh(): Promise<void> {
		try {
			const resp = await authApi.listProviders();
			setProviders(resp.providers);
			setError(undefined);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		void refresh();
	}, []);

	async function revoke(): Promise<void> {
		if (!confirmRevoke) return;
		setRevoking(true);
		try {
			await authApi.revoke(confirmRevoke.id);
			setConfirmRevoke(null);
			await refresh();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setRevoking(false);
		}
	}

	if (loading) {
		return <div className="font-mono text-2xs text-ink-3">Loading providers…</div>;
	}
	if (error && !providers) {
		return (
			<div className="rounded border border-danger/40 bg-danger/5 p-3 text-xs text-danger">
				{error}
			</div>
		);
	}
	if (!providers) return null;

	const tabs: { id: ProviderTab; label: string; count: number }[] = [
		{ id: "loggedin", label: "Logged In", count: loggedIn.length },
		{ id: "unconfigured", label: "Not Configured", count: unconfigured.length },
		{ id: "ccswitch", label: "cc-switch", count: 0 },
	];

	return (
		<div className="flex flex-col gap-4">
			<div>
				<h2 className="meta">Providers</h2>
				<p className="mt-1 text-xs text-ink-3">
					OAuth sign-in to subscription providers (Claude Pro/Max, ChatGPT Plus/Pro, etc.).
					API keys live under <strong>Env</strong> — this surface is for browser-flow auth.
				</p>
			</div>

			{error ? (
				<div className="rounded border border-danger/40 bg-danger/5 p-2 text-2xs text-danger">
					{error}
				</div>
			) : null}

			{/* Tab bar */}
			<div className="flex items-center gap-1 border-b border-line">
				{tabs.map((t) => (
					<button
						key={t.id}
						type="button"
						onClick={() => setTab(t.id)}
						className={cn(
							"relative flex items-center gap-1.5 px-3 pb-2 pt-1 text-xs font-medium transition-colors",
							tab === t.id
								? "text-accent"
								: "text-ink-4 hover:text-ink-2",
						)}
					>
						{t.label}
						{t.count > 0 ? (
							<span
								className={cn(
									"inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-2xs font-semibold",
									tab === t.id
										? "bg-accent/15 text-accent"
										: "bg-paper-3 text-ink-4",
								)}
							>
								{t.count}
							</span>
						) : null}
						{tab === t.id ? (
							<span className="absolute inset-x-0 bottom-0 h-px bg-accent" />
						) : null}
					</button>
				))}
			</div>

			{/* Tab content */}
			{tab === "loggedin" ? (
				loggedIn.length > 0 ? (
					<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
						{loggedIn.map((p) => (
							<ProviderCard
								key={p.id}
								info={p}
								onLogin={() => setActiveFlow({ id: p.id, name: p.name })}
								onRevoke={() => setConfirmRevoke({ id: p.id, name: p.name })}
							/>
						))}
					</div>
				) : (
					<div className="rounded border border-dashed border-line p-6 text-center text-xs text-ink-4">
						No providers configured yet. Switch to <strong>Not Configured</strong> tab to log in.
					</div>
				)
			) : null}

			{tab === "unconfigured" ? (
				unconfigured.length > 0 ? (
					<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
						{unconfigured.map((p) => (
							<ProviderCard
								key={p.id}
								info={p}
								onLogin={() => setActiveFlow({ id: p.id, name: p.name })}
								onRevoke={() => setConfirmRevoke({ id: p.id, name: p.name })}
							/>
						))}
					</div>
				) : (
					<div className="rounded border border-dashed border-line p-6 text-center text-xs text-ink-4">
						All providers are configured!
					</div>
				)
			) : null}

			{tab === "ccswitch" ? <CcSwitchPanel /> : null}

			<OAuthFlowModal
				open={activeFlow !== null}
				provider={activeFlow?.id ?? null}
				providerName={activeFlow?.name ?? null}
				onClose={() => setActiveFlow(null)}
				onComplete={() => {
					setActiveFlow(null);
					void refresh();
				}}
			/>
			<Modal open={confirmRevoke !== null} onClose={() => setConfirmRevoke(null)} widthClass="max-w-md">
				<div className="flex flex-col gap-3 p-5">
					<h2 className="text-base font-semibold text-ink">
						Sign out of {confirmRevoke?.name}?
					</h2>
					<p className="text-xs text-ink-3">
						The stored credentials will be deleted from <code>auth.db</code>. Token refresh
						will fail until you log in again. Other deck instances sharing the same
						<code>OMP_AGENT_DIR</code> will lose access too.
					</p>
					<div className="flex justify-end gap-2 border-t border-line pt-3">
						<Button variant="ghost" onClick={() => setConfirmRevoke(null)} disabled={revoking}>
							Cancel
						</Button>
						<Button variant="danger" onClick={revoke} disabled={revoking}>
							{revoking ? "Signing out…" : "Sign out"}
						</Button>
					</div>
				</div>
			</Modal>
		</div>
	);
}

function ProviderCard({
	info,
	onLogin,
	onRevoke,
}: {
	info: ProviderInfo;
	onLogin: () => void;
	onRevoke: () => void;
}) {
	const tone =
		info.state === "oauth"
			? "border-success/40 bg-success/5"
			: info.state === "api-key"
				? "border-accent/30 bg-accent-soft/40"
				: "border-line bg-paper-2/30";
	const stateLabel =
		info.state === "oauth"
			? "OAuth (subscription)"
			: info.state === "api-key"
				? "API key configured"
				: "Not configured";
	const stateBadgeTone: "success" | "accent" | "default" =
		info.state === "oauth" ? "success" : info.state === "api-key" ? "accent" : "default";
	return (
		<div className={cn("flex flex-col gap-2 rounded border p-3", tone)}>
			<div className="flex items-baseline justify-between gap-2">
				<div className="truncate text-sm font-medium text-ink" title={info.name}>
					{info.name}
				</div>
				<Badge tone={stateBadgeTone}>{stateLabel}</Badge>
			</div>
			<div className="font-mono text-2xs text-ink-4">
				{info.id}
				{info.count > 1 ? <span className="ml-1.5">· {info.count} credentials</span> : null}
			</div>
			<div className="mt-1 flex gap-2">
				{info.state === "unconfigured" ? (
					<Button variant="primary" onClick={onLogin} className="flex-1">
						Login
					</Button>
				) : info.state === "oauth" ? (
					<>
						<Button variant="outline" onClick={onLogin} className="flex-1">
							Replace
						</Button>
						<Button variant="ghost" onClick={onRevoke}>
							Sign out
						</Button>
					</>
				) : (
					<Button variant="outline" onClick={onLogin} className="flex-1">
						Login (replaces API key)
					</Button>
				)}
			</div>
		</div>
	);
}

// ─── cc-switch import panel (tab content) ───────────────────────────────────

function CcSwitchPanel() {
	const [providers, setProviders] = useState<CcSwitchProvider[] | null>(null);
	const [dbPath, setDbPath] = useState("");
	const [accessible, setAccessible] = useState(true);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | undefined>();
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [importing, setImporting] = useState(false);
	const [results, setResults] = useState<CcSwitchImportResultEntry[] | null>(null);

	async function loadProviders(): Promise<void> {
		setLoading(true);
		setError(undefined);
		setResults(null);
		try {
			const resp = await ccSwitchApi.listProviders();
			setProviders(resp.providers);
			setDbPath(resp.dbPath);
			setAccessible(resp.accessible);
			if (!resp.accessible) setError(resp.error);
			// Pre-select providers with valid apiType
			const preSelect = new Set<string>();
			for (const p of resp.providers) {
				if (p.apiType) preSelect.add(`${p.id}|${p.appType}`);
			}
			setSelected(preSelect);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		if (!providers) void loadProviders();
	}, [providers]);

	function toggle(key: string): void {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}

	function toggleAll(): void {
		if (!providers) return;
		const allKeys = providers.filter((p) => p.apiType).map((p) => `${p.id}|${p.appType}`);
		if (selected.size === allKeys.length) {
			setSelected(new Set());
		} else {
			setSelected(new Set(allKeys));
		}
	}

	async function doImport(): Promise<void> {
		if (selected.size === 0) return;
		setImporting(true);
		setResults(null);
		try {
			const resp = await ccSwitchApi.importProviders(Array.from(selected));
			setResults(resp.imported);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setImporting(false);
		}
	}

	const importableProviders = providers?.filter((p) => p.apiType) ?? [];
	const unimportableProviders = providers?.filter((p) => !p.apiType) ?? [];

	return (
		<div className="flex flex-col gap-3">
			<p className="text-xs text-ink-3">
				Import provider configurations from the cc-switch desktop app. Selected providers
				will be registered as omp SDK extensions at <code>~/.omp/agent/extensions/</code>.
			</p>

					{dbPath ? (
						<div className="font-mono text-2xs text-ink-4">DB: {dbPath}</div>
					) : null}

					{loading ? (
						<div className="font-mono text-2xs text-ink-3">Loading cc-switch providers…</div>
					) : null}

					{error ? (
						<div className="rounded border border-danger/40 bg-danger/5 p-3 text-xs text-danger">
							{error}
						</div>
					) : null}

					{!loading && !error && importableProviders.length > 0 ? (
						<>
							<div className="flex items-center gap-2">
								<Button variant="outline" onClick={toggleAll} size="sm">
									{selected.size === importableProviders.length ? "Deselect all" : "Select all"}
								</Button>
								<Button
									variant="primary"
									onClick={doImport}
									disabled={selected.size === 0 || importing}
									size="sm"
								>
									{importing ? "Importing…" : `Import ${selected.size} provider${selected.size !== 1 ? "s" : ""}`}
								</Button>
							</div>

							<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
								{importableProviders.map((p) => {
									const key = `${p.id}|${p.appType}`;
									const isSelected = selected.has(key);
									return (
										<label
											key={key}
											className={cn(
												"flex cursor-pointer items-start gap-2 rounded border p-2.5 transition-colors",
												isSelected
													? "border-accent/40 bg-accent-soft/30"
													: "border-line bg-paper-2/20 hover:bg-paper-3/30",
											)}
										>
											<input
												type="checkbox"
												checked={isSelected}
												onChange={() => toggle(key)}
												className="mt-0.5"
											/>
											<div className="min-w-0 flex-1">
												<div className="flex items-center gap-1.5">
													<span className="truncate text-sm font-medium text-ink">
														{p.name}
													</span>
													<Badge tone="accent">{p.apiType}</Badge>
													{p.isCurrent ? <Badge tone="success">current</Badge> : null}
												</div>
												<div className="mt-0.5 font-mono text-2xs text-ink-4">
													{p.env.ANTHROPIC_BASE_URL || p.env.OPENAI_BASE_URL || "(default endpoint)"}
												</div>
												<div className="mt-0.5 font-mono text-2xs text-ink-4">
													app: {p.appType}
													{p.category ? ` · ${p.category}` : ""}
												</div>
											</div>
										</label>
									);
								})}
							</div>

							{unimportableProviders.length > 0 ? (
								<div>
									<div className="mb-1 font-mono text-2xs uppercase tracking-meta text-ink-4">
										Skipped (unsupported format)
									</div>
									<div className="flex flex-wrap gap-1">
										{unimportableProviders.map((p) => (
											<Badge key={`${p.id}|${p.appType}`} tone="muted">
												{p.name} ({p.appType})
											</Badge>
										))}
									</div>
								</div>
							) : null}
						</>
					) : null}

			{!loading && !error && providers && importableProviders.length === 0 ? (
				<div className="rounded border border-dashed border-line p-6 text-center text-xs text-ink-4">
					No importable providers found in cc-switch database.
				</div>
			) : null}

			{results ? (
				<div className="flex flex-col gap-1.5">
					<div className="font-mono text-2xs uppercase tracking-meta text-ink-3">
						Import Results
					</div>
							{results.map((r) => (
								<div
									key={r.key}
									className={cn(
										"flex items-center gap-2 rounded px-2 py-1 text-xs",
										r.status === "ok"
											? "bg-success/10 text-success"
											: r.status === "skipped"
												? "bg-warn/10 text-warn"
												: "bg-danger/10 text-danger",
										)}
									>
										<span>{r.status === "ok" ? "✓" : r.status === "skipped" ? "⊘" : "✗"}</span>
										<span className="truncate font-medium">{r.name}</span>
										{r.error ? (
											<span className="truncate text-ink-4">— {r.error}</span>
										) : null}
										{r.extensionDir ? (
											<span className="truncate font-mono text-2xs text-ink-4">
												{r.extensionDir}
											</span>
										) : null}
									</div>
							))}
						</div>
				) : null}
			</div>
	);
}
