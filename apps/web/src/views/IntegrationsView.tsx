import { useCallback, useEffect, useState } from "react";
import {
	Check,
	FileJson,
	Loader2,
	Plus,
	Power,
	PowerOff,
	RefreshCw,
	Save,
	Trash2,
	X,
	Zap,
} from "lucide-react";
import type {
	McpListResponse,
	McpServerConfigWire,
	McpServerEntry,
	McpTestResponse,
} from "@omp-deck/protocol";

import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Editing = {
	name: string;
	config: McpServerConfigWire;
	isNew: boolean;
	originalName?: string;
};

const EMPTY_CONFIG: McpServerConfigWire = {
	type: "stdio",
	command: "",
	args: [],
	env: {},
};

export function IntegrationsView() {
	const [servers, setServers] = useState<McpServerEntry[]>([]);
	const [configPath, setConfigPath] = useState("");
	const [loading, setLoading] = useState(true);
	const [selected, setSelected] = useState<string | null>(null);
	const [editing, setEditing] = useState<Editing | null>(null);
	const [testResult, setTestResult] = useState<McpTestResponse | null>(null);
	const [testing, setTesting] = useState(false);
	const [saving, setSaving] = useState(false);
	const [importJson, setImportJson] = useState("");
	const [showImport, setShowImport] = useState(false);

	const refresh = useCallback(async () => {
		try {
			const resp: McpListResponse = await api.listMcpServers();
			setServers(resp.servers);
			setConfigPath(resp.userConfigPath);
		} catch (err) {
			console.error("listMcpServers failed", err);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const selectedServer = selected
		? servers.find((s) => s.name === selected)
		: undefined;

	function startEdit(server: McpServerEntry): void {
		setSelected(server.name);
		setEditing({
			name: server.name,
			config: { ...server.config },
			isNew: false,
			originalName: server.name,
		});
		setTestResult(null);
	}

	function startNew(): void {
		const name = "new-server";
		setSelected(null);
		setEditing({ name, config: { ...EMPTY_CONFIG }, isNew: true });
		setTestResult(null);
	}

	function cancelEdit(): void {
		setEditing(null);
		if (!selected) setSelected(null);
	}

	async function handleSave(): Promise<void> {
		if (!editing) return;
		setSaving(true);
		try {
			if (editing.isNew) {
				await api.addMcpServer({ name: editing.name, config: editing.config });
			} else {
				await api.updateMcpServer(editing.originalName!, {
					name: editing.name !== editing.originalName ? editing.name : undefined,
					config: editing.config,
				});
			}
			setEditing(null);
			void refresh();
		} catch (err) {
			console.error("save failed", err);
			alert(`Save failed: ${String(err)}`);
		} finally {
			setSaving(false);
		}
	}

	async function handleDelete(name: string): Promise<void> {
		if (!confirm(`Delete MCP server "${name}"?`)) return;
		try {
			await api.deleteMcpServer(name);
			if (selected === name) setSelected(null);
			if (editing?.originalName === name) setEditing(null);
			void refresh();
		} catch (err) {
			console.error("delete failed", err);
			alert(`Delete failed: ${String(err)}`);
		}
	}

	async function handleToggle(server: McpServerEntry): Promise<void> {
		try {
			await api.toggleMcpServer(server.name);
			void refresh();
		} catch (err) {
			console.error("toggle failed", err);
		}
	}

	async function handleTest(): Promise<void> {
		if (!editing) return;
		setTesting(true);
		setTestResult(null);
		try {
			const result = await api.testMcpConnection(editing.originalName ?? editing.name);
			setTestResult(result);
		} catch (err) {
			setTestResult({ ok: false, serverName: editing.name, error: String(err) });
		} finally {
			setTesting(false);
		}
	}

	function handleImport(): void {
		try {
			const parsed = JSON.parse(importJson);
			if (!editing) return;
			setEditing({
				...editing,
				config: {
					type: (parsed.type as McpServerConfigWire["type"]) ?? editing.config.type,
					command: typeof parsed.command === "string" ? parsed.command : editing.config.command,
					args: Array.isArray(parsed.args) ? parsed.args : editing.config.args,
					env: parsed.env && typeof parsed.env === "object" ? parsed.env : editing.config.env,
					url: typeof parsed.url === "string" ? parsed.url : editing.config.url,
					headers: parsed.headers && typeof parsed.headers === "object" ? parsed.headers : editing.config.headers,
					cwd: typeof parsed.cwd === "string" ? parsed.cwd : editing.config.cwd,
					timeout: typeof parsed.timeout === "number" ? parsed.timeout : editing.config.timeout,
				},
			});
		} catch {
			alert("Invalid JSON");
		}
		setShowImport(false);
		setImportJson("");
	}

	function updateConfig<K extends keyof McpServerConfigWire>(
		key: K,
		value: McpServerConfigWire[K],
	): void {
		if (!editing) return;
		setEditing({ ...editing, config: { ...editing.config, [key]: value } });
	}

	// Build env entries array for editing
	const envEntries: [string, string][] = Object.entries(editing?.config.env ?? {});

	function setEnvEntries(entries: [string, string][]): void {
		if (!editing) return;
		const env: Record<string, string> = {};
		for (const [k, v] of entries) {
			if (k.trim()) env[k.trim()] = v;
		}
		updateConfig("env", env);
	}

	// Build args array for editing
	const argsStr = (editing?.config.args ?? []).join("\n");

	return (
		<Layout
			sidebar={null}
			inspector={null}
			topBar={null}
			main={
				<div className="flex h-full min-h-0 flex-col">
					<div className="flex h-10 shrink-0 items-center gap-2 border-b border-line bg-paper px-3">
						<Zap className="h-4 w-4 text-accent" />
						<div className="meta">Integrations</div>
						<div className="text-xs text-ink-3">MCP servers</div>
						{configPath ? (
							<div className="ml-auto font-mono text-2xs text-ink-4" title={configPath}>
								{configPath.split(/[\\/]/).slice(-2).join("/")}
							</div>
						) : null}
					</div>

					<div className="grid min-h-0 flex-1 grid-cols-[240px_1fr] overflow-hidden">
						{/* Left panel — server list */}
						<aside className="flex flex-col border-r border-line bg-paper-2/40">
							<div className="flex items-center justify-between p-2">
								<div className="meta text-xs">Servers · {servers.length}</div>
								<button
									type="button"
									className="btn-primary flex h-7 items-center gap-1 px-2 text-xs"
									onClick={startNew}
								>
									<Plus className="h-3 w-3" />
									Add
								</button>
							</div>
							<div className="flex-1 overflow-y-auto">
								{loading ? (
									<div className="flex items-center justify-center py-8">
										<Loader2 className="h-4 w-4 animate-spin text-ink-3" />
									</div>
								) : servers.length === 0 ? (
									<div className="px-3 py-6 text-center font-mono text-2xs text-ink-3">
										No MCP servers configured.
									</div>
								) : (
									servers.map((s) => (
										<button
											key={s.name}
											type="button"
											onClick={() => startEdit(s)}
											className={cn(
												"group flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
												selected === s.name
													? "bg-accent-soft/20 text-ink"
													: "text-ink-2 hover:bg-paper-3",
											)}
										>
											{/* Enabled/disabled dot */}
											<button
												type="button"
												title={s.disabled ? "Disabled — click to enable" : "Enabled — click to disable"}
												onClick={(e) => {
													e.stopPropagation();
													void handleToggle(s);
												}}
												className="shrink-0"
											>
												{s.disabled ? (
													<PowerOff className="h-3.5 w-3.5 text-ink-4" />
												) : (
													<Power className="h-3.5 w-3.5 text-emerald-500" />
												)}
											</button>
											<span className="flex-1 truncate font-medium">{s.name}</span>
											<Badge
												tone={s.config.type === "stdio" ? "muted" : "warn"}
												className="shrink-0 font-mono text-2xs"
											>
												{s.config.type}
											</Badge>
											<button
												type="button"
												title="Delete"
												onClick={(e) => {
													e.stopPropagation();
													void handleDelete(s.name);
												}}
												className="hidden h-5 w-5 items-center justify-center rounded text-ink-4 hover:bg-danger/10 hover:text-danger group-hover:flex"
											>
												<Trash2 className="h-3 w-3" />
											</button>
										</button>
									))
								)}
							</div>
							<div className="border-t border-line p-2">
								<button
									type="button"
									onClick={() => void refresh()}
									className="flex w-full items-center justify-center gap-1 rounded py-1 text-xs text-ink-3 hover:text-ink"
								>
									<RefreshCw className="h-3 w-3" />
									Refresh
								</button>
							</div>
						</aside>

						{/* Right panel — detail / edit */}
						<section className="min-h-0 overflow-y-auto p-4">
							{editing ? (
								<EditForm
									editing={editing}
									testResult={testResult}
									testing={testing}
									saving={saving}
									showImport={showImport}
									importJson={importJson}
									onNameChange={(n) => setEditing({ ...editing, name: n })}
									onConfigChange={updateConfig}
									onEnvChange={setEnvEntries}
									onSave={() => void handleSave()}
									onTest={() => void handleTest()}
									onDelete={() => void handleDelete(editing.originalName ?? editing.name)}
									onCancel={cancelEdit}
									onImport={() => setShowImport(true)}
									onImportCancel={() => setShowImport(false)}
									onImportJsonChange={setImportJson}
									onImportSubmit={() => handleImport()}
								/>
							) : selectedServer ? (
								<ServerDetail
									server={selectedServer}
									onEdit={() => startEdit(selectedServer)}
									onTest={() => startEdit(selectedServer)}
								/>
							) : (
								<div className="flex h-full items-center justify-center font-mono text-xs text-ink-3">
									Select a server or add a new one.
								</div>
							)}
						</section>
					</div>
				</div>
			}
		/>
	);
}

// ─── ServerDetail (read-only preview) ───────────────────────────────────────

function ServerDetail({
	server,
	onEdit,
	onTest,
}: {
	server: McpServerEntry;
	onEdit: () => void;
	onTest: () => void;
}) {
	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-lg font-semibold text-ink">{server.name}</h2>
					<div className="mt-1 flex items-center gap-2">
						<Badge tone={server.config.type === "stdio" ? "muted" : "warn"}>
							{server.config.type}
						</Badge>
						<Badge tone={server.disabled ? "danger" : "success"}>
							{server.disabled ? "Disabled" : "Enabled"}
						</Badge>
					</div>
				</div>
				<div className="flex gap-2">
					<Button variant="outline" size="sm" onClick={onTest}>
						<Zap className="h-3.5 w-3.5" />
						Test
					</Button>
					<Button size="sm" onClick={onEdit}>
						Edit
					</Button>
				</div>
			</div>

			<div className="rounded-lg border border-line bg-paper-2 p-3">
				<div className="meta mb-2">Configuration</div>
				{server.config.type === "stdio" ? (
					<>
						<div className="text-sm">
							<span className="text-ink-3">Command: </span>
							<code className="paper-code px-1 text-xs">{server.config.command}</code>
						</div>
						{server.config.args && server.config.args.length > 0 ? (
							<div className="mt-1 text-sm">
								<span className="text-ink-3">Args: </span>
								<code className="paper-code px-1 text-xs">{server.config.args.join(" ")}</code>
							</div>
						) : null}
						{server.config.cwd ? (
							<div className="mt-1 text-sm">
								<span className="text-ink-3">CWD: </span>
								<code className="paper-code px-1 text-xs">{server.config.cwd}</code>
							</div>
						) : null}
					</>
				) : (
					<div className="text-sm">
						<span className="text-ink-3">URL: </span>
						<code className="paper-code px-1 text-xs">{server.config.url}</code>
					</div>
				)}
				{server.config.env && Object.keys(server.config.env).length > 0 ? (
					<div className="mt-2">
						<div className="text-xs text-ink-3 mb-1">Environment:</div>
						{Object.entries(server.config.env).map(([k, v]) => (
							<div key={k} className="font-mono text-2xs text-ink-2">
								{k}={v}
							</div>
						))}
					</div>
				) : null}
			</div>

			<div className="font-mono text-2xs text-ink-4">
				Source: {server.source}
			</div>
		</div>
	);
}

// ─── EditForm ───────────────────────────────────────────────────────────────

function EditForm({
	editing,
	testResult,
	testing,
	saving,
	showImport,
	importJson,
	onNameChange,
	onConfigChange,
	onEnvChange,
	onSave,
	onTest,
	onDelete,
	onCancel,
	onImport,
	onImportCancel,
	onImportJsonChange,
	onImportSubmit,
}: {
	editing: Editing;
	testResult: McpTestResponse | null;
	testing: boolean;
	saving: boolean;
	showImport: boolean;
	importJson: string;
	onNameChange: (n: string) => void;
	onConfigChange: <K extends keyof McpServerConfigWire>(key: K, value: McpServerConfigWire[K]) => void;
	onEnvChange: (entries: [string, string][]) => void;
	onSave: () => void;
	onTest: () => void;
	onDelete: () => void;
	onCancel: () => void;
	onImport: () => void;
	onImportCancel: () => void;
	onImportJsonChange: (v: string) => void;
	onImportSubmit: () => void;
}) {
	const isNew = editing.isNew;
	const envEntries: [string, string][] = Object.entries(editing.config.env ?? {});
	const argsStr = (editing.config.args ?? []).join("\n");

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-semibold text-ink">
					{isNew ? "New MCP Server" : `Edit ${editing.originalName}`}
				</h2>
				<div className="flex gap-2">
					<Button variant="outline" size="sm" onClick={onCancel}>
						Cancel
					</Button>
					<Button size="sm" onClick={onSave} disabled={saving}>
						{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
						Save
					</Button>
				</div>
			</div>

			{/* Connection test result */}
			{testResult ? (
				<div
					className={cn(
						"rounded-md border p-3",
						testResult.ok
							? "border-emerald-400/40 bg-emerald-50/50 text-emerald-800"
							: "border-danger/40 bg-danger/10 text-danger",
					)}
				>
					<div className="flex items-center gap-2 text-sm font-medium">
						{testResult.ok ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
						{testResult.ok ? "Connected" : "Connection failed"}
						{testResult.tools ? ` · ${testResult.tools.length} tools` : ""}
					</div>
					{testResult.error ? (
						<div className="mt-1 font-mono text-xs opacity-80">{testResult.error}</div>
					) : null}
					{testResult.tools && testResult.tools.length > 0 ? (
						<div className="mt-1 flex flex-wrap gap-1">
							{testResult.tools.slice(0, 20).map((t) => (
								<code key={t} className="rounded bg-white/50 px-1 font-mono text-2xs">
									{t}
								</code>
							))}
							{testResult.tools.length > 20 ? (
								<span className="text-2xs opacity-60">+{testResult.tools.length - 20} more</span>
							) : null}
						</div>
					) : null}
				</div>
			) : null}

			{/* Name */}
			<div>
				<label className="meta block mb-1" htmlFor="mcp-name">
					Name
				</label>
				<input
					id="mcp-name"
					type="text"
					value={editing.name}
					onChange={(e) => onNameChange(e.target.value)}
					className="field h-8 w-full px-2 font-mono text-sm"
					disabled={!isNew}
				/>
			</div>

			{/* Transport type */}
			<div>
				<label className="meta block mb-1">Transport</label>
				<div className="flex gap-1">
					{(["stdio", "sse", "http"] as const).map((t) => (
						<button
							key={t}
							type="button"
							onClick={() => onConfigChange("type", t)}
							className={cn(
								"rounded px-3 py-1 text-xs font-medium transition-colors",
								editing.config.type === t
									? "bg-accent text-white"
									: "bg-paper-3 text-ink-2 hover:bg-paper-4",
							)}
						>
							{t}
						</button>
					))}
				</div>
			</div>

			{/* Stdio fields */}
			{editing.config.type === "stdio" ? (
				<>
					<div>
						<label className="meta block mb-1" htmlFor="mcp-cmd">
							Command
						</label>
						<input
							id="mcp-cmd"
							type="text"
							value={editing.config.command ?? ""}
							onChange={(e) => onConfigChange("command", e.target.value)}
							className="field h-8 w-full px-2 font-mono text-xs"
							placeholder="npx"
						/>
					</div>
					<div>
						<label className="meta block mb-1" htmlFor="mcp-args">
							Arguments (one per line)
						</label>
						<textarea
							id="mcp-args"
							value={argsStr}
							onChange={(e) => {
								// Keep empty lines in the textarea so Enter works
								onConfigChange("args", e.target.value.split("\n").map((l) => l.trim()));
							}}
							className="field w-full px-2 py-1 font-mono text-xs"
							rows={4}
							placeholder="-y&#10;@anthropic/mcp-server-filesystem"
						/>
					</div>
					<div>
						<label className="meta block mb-1" htmlFor="mcp-cwd">
							Working directory
						</label>
						<input
							id="mcp-cwd"
							type="text"
							value={editing.config.cwd ?? ""}
							onChange={(e) => onConfigChange("cwd", e.target.value || undefined)}
							className="field h-8 w-full px-2 font-mono text-xs"
							placeholder="(optional)"
						/>
					</div>
				</>
			) : (
				<div>
					<label className="meta block mb-1" htmlFor="mcp-url">
						URL
					</label>
					<input
						id="mcp-url"
						type="text"
						value={editing.config.url ?? ""}
						onChange={(e) => onConfigChange("url", e.target.value)}
						className="field h-8 w-full px-2 font-mono text-xs"
						placeholder="http://localhost:8080/mcp"
					/>
				</div>
			)}

			{/* Environment variables */}
			<div>
				<div className="flex items-center justify-between mb-1">
					<label className="meta">Environment variables</label>
					<button
						type="button"
						className="text-xs text-accent hover:underline"
						onClick={() => onEnvChange([...envEntries, ["", ""]])}
					>
						+ Add
					</button>
				</div>
				<div className="space-y-1">
					{envEntries.map(([k, v], i) => (
						<div key={i} className="flex gap-1">
							<input
								type="text"
								value={k}
								onChange={(e) => {
									const next = [...envEntries];
									next[i] = [e.target.value, v];
									onEnvChange(next);
								}}
								className="field h-7 w-1/3 px-2 font-mono text-2xs"
								placeholder="KEY"
							/>
							<input
								type="text"
								value={v}
								onChange={(e) => {
									const next = [...envEntries];
									next[i] = [k, e.target.value];
									onEnvChange(next);
								}}
								className="field h-7 flex-1 px-2 font-mono text-2xs"
								placeholder="value"
							/>
							<button
								type="button"
								onClick={() => {
									const next = envEntries.filter((_, j) => j !== i);
									onEnvChange(next);
								}}
								className="shrink-0 px-1 text-ink-4 hover:text-danger"
							>
								<X className="h-3 w-3" />
							</button>
						</div>
					))}
				</div>
			</div>

			{/* Timeout */}
			<div>
				<label className="meta block mb-1" htmlFor="mcp-timeout">
					Timeout (ms)
				</label>
				<input
					id="mcp-timeout"
					type="number"
					value={editing.config.timeout ?? ""}
					onChange={(e) =>
						onConfigChange("timeout", e.target.value ? Number(e.target.value) : undefined)
					}
					className="field h-8 w-32 px-2 font-mono text-xs"
					placeholder="30000"
				/>
			</div>

			{/* Actions */}
			<div className="flex flex-wrap gap-2 border-t border-line pt-4">
				<Button variant="outline" size="sm" onClick={onTest} disabled={testing}>
					{testing ? (
						<Loader2 className="h-3.5 w-3.5 animate-spin" />
					) : (
						<Zap className="h-3.5 w-3.5" />
					)}
					Test Connection
				</Button>
				<Button variant="outline" size="sm" onClick={onImport}>
					<FileJson className="h-3.5 w-3.5" />
					Import JSON
				</Button>
				{!isNew ? (
					<Button variant="danger" size="sm" onClick={onDelete}>
						<Trash2 className="h-3.5 w-3.5" />
						Delete
					</Button>
				) : null}
			</div>

			{/* Import modal */}
			{showImport ? (
				<Modal open={showImport} onClose={onImportCancel}>
					<div className="space-y-3">
						<div className="meta">Import from JSON</div>
						<p className="text-xs text-ink-3">
							Paste an MCP server config fragment. Fields present in the JSON will
							overwrite the corresponding form fields; absent fields are left
							unchanged.
						</p>
						<textarea
							value={importJson}
							onChange={(e) => onImportJsonChange(e.target.value)}
							className="field w-full px-3 py-2 font-mono text-xs"
							rows={8}
							placeholder={`{"type":"stdio","command":"npx","args":["-y","@anthropic/mcp-server-filesystem"]}`}
							autoFocus
						/>
						<div className="flex justify-end gap-2">
							<Button variant="outline" size="sm" onClick={onImportCancel}>
								Cancel
							</Button>
							<Button size="sm" onClick={onImportSubmit}>
								Import
							</Button>
						</div>
					</div>
				</Modal>
			) : null}
		</div>
	);
}
