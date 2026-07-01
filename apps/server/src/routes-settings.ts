import { Hono } from "hono";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import type {
	AgentConfigEntry,
	AgentConfigResponse,
	EnvEntry,
	EnvValueSource,
	ListEnvSettingsResponse,
	PatchEnvSettingsRequest,
	PatchEnvSettingsResponse,
	RestartServerResponse,
	RevealEnvValueResponse,
	UpdateAgentConfigRequest,
	ModelRoleEntry,
	ModelRolesResponse,
	ModelInfo,
	UpdateModelRolesRequest,
	LspConfigResponse,
	ProjectLspConfigResponse,
	UpdateLspConfigRequest,
	DapConfigResponse,
	ProjectDapConfigResponse,
	DapAdapterConfig,
	UpdateDapConfigRequest,
} from "@omp-deck/protocol";

import type { Config } from "./config.ts";
import { parseAutoStart, parseInt10, splitList } from "./config.ts";
import { AGENT_CONFIG_SCHEMA, AGENT_CONFIG_KEYS, validateAgentConfigUpdate } from "./agent-config-schema.ts";
import { ENV_SCHEMA, ENV_SCHEMA_BY_KEY, type EnvSchemaEntry, validateEnvValue } from "./env-schema.ts";
import { settings as ompSettings } from "@oh-my-pi/pi-coding-agent";
import { getAgentDir } from "@oh-my-pi/pi-utils";
import type { AgentBridge } from "./bridge/types.ts";
import {
	MANAGED_ENV_KEYS_LOADED,
	appendEnvAudit,
	applyManagedEnvUpdatesToProcess,
	getDataDir,
	getManagedEnvPath,
	readManagedEnvFile,
	writeManagedEnvUpdates,
} from "./env-store.ts";
import { setLogLevel } from "./log.ts";

export function buildSettingsRouter(
	bridge: AgentBridge,
	config: Config,
	opts: { restartServer?: () => RestartServerResponse } = {},
): Hono {
	const app = new Hono();

	app.get("/settings/env", (c) => c.json(buildEnvResponse()));

	app.get("/settings/env/:key", async (c) => {
		if (c.req.query("reveal") !== "1") return c.json({ error: "reveal=1 required" }, 400);
		if (!isLoopbackRequest(c.req.raw)) return c.json({ error: "secret reveal requires loopback" }, 403);
		const key = c.req.param("key");
		const entry = ENV_SCHEMA_BY_KEY.get(key);
		if (!entry) return c.json({ error: "unknown env key" }, 404);
		const current = resolveEntry(entry);
		await appendEnvAudit("reveal", [key]);
		const body: RevealEnvValueResponse = {
			key,
			value: current.value ?? "",
			masked: maskValue(current.value ?? "", entry.sensitive),
			isSet: isNonEmpty(current.value),
			source: current.source,
		};
		return c.json(body);
	});

	app.patch("/settings/env", async (c) => {
		let body: PatchEnvSettingsRequest;
		try {
			body = (await c.req.json()) as PatchEnvSettingsRequest;
		} catch {
			return c.json({ error: "invalid json body" }, 400);
		}
		const updates = body.updates ?? {};
		const clean: Record<string, string | null> = {};
		for (const [key, value] of Object.entries(updates)) {
			const entry = ENV_SCHEMA_BY_KEY.get(key);
			if (!entry) return c.json({ error: `unknown env key: ${key}` }, 400);
			if (value !== null && typeof value !== "string") {
				return c.json({ error: `invalid env value for ${key}` }, 400);
			}
			if (value !== null) {
				const err = validateEnvValue(entry, value);
				if (err) return c.json({ error: `${key}: ${err}` }, 400);
			}
			clean[key] = value;
		}

		await writeManagedEnvUpdates(clean);
		applyManagedEnvUpdatesToProcess(clean);
		await appendEnvAudit("set", Object.keys(clean).filter((key) => clean[key] !== null));
		await appendEnvAudit("unset", Object.keys(clean).filter((key) => clean[key] === null));

		const appliedHot = applyHotUpdates(clean, bridge, config);
		const response = buildEnvResponse() as PatchEnvSettingsResponse;
		response.appliedHot = appliedHot;
		return c.json(response);
	});

	// ─── Model Roles ──────────────────────────────────────────────────────────

	const ROLE_CATALOG: readonly ModelRoleEntry[] = [
		{ key: "default", label: "Default", description: "Fallback model for unspecified roles." },
		{ key: "fast", label: "Fast", description: "Low-latency tasks and quick responses." },
		{ key: "thinking", label: "Thinking", description: "Hard reasoning and deeper analysis." },
		{ key: "vision", label: "Vision", description: "Image-capable tasks." },
		{ key: "architect", label: "Architect", description: "Planning, architecture, and design work." },
		{ key: "designer", label: "Designer", description: "UI and product design work." },
		{ key: "commit", label: "Commit", description: "Commit messages and git summarization." },
		{ key: "tiny", label: "Tiny", description: "Cheap utility tasks and small transformations." },
		{ key: "subtask", label: "Subtask", description: "Subagent/subtask execution." },
		{ key: "advisor", label: "Advisor", description: "Guidance, review, and advisory flows." },
	] as const;

	const VALID_ROLES = new Set<string>(ROLE_CATALOG.map((r) => r.key));

	// GET /api/settings/model-roles
	app.get("/settings/model-roles", async (c) => {
		const currentRoles = ompSettings.getModelRoles();
		const configPath = path.join(getAgentDir(), "config.yml");

		const roles: ModelRoleEntry[] = ROLE_CATALOG.map((r) => ({
			...r,
			modelId: currentRoles[r.key] || undefined,
		}));

		let models: ModelInfo[] = [];
		try {
			models = await bridge.listModels({ ensureOnlineRefresh: true });
		} catch {
			// models stay empty; UI should degrade gracefully
		}

		return c.json({
			roles,
			models,
			configPath,
		} satisfies ModelRolesResponse);
	});

	// PUT /api/settings/model-roles — persists via set("modelRoles", ...)
	app.put("/settings/model-roles", async (c) => {
		let body: UpdateModelRolesRequest;
		try {
			body = (await c.req.json()) as UpdateModelRolesRequest;
		} catch {
			return c.json({ error: "invalid json body" }, 400);
		}

		const roles = body.roles ?? {};
		for (const key of Object.keys(roles)) {
			if (!VALID_ROLES.has(key)) {
				return c.json({ error: `unknown role: ${key}` }, 400);
			}
		}

		// Merge: non-null values set, null/empty values delete.
		const current = ompSettings.getModelRoles();
		const next: Record<string, string> = {};
		for (const [k, v] of Object.entries(current)) {
			if (v) next[k] = v;
		}
		for (const [key, value] of Object.entries(roles)) {
			if (value && typeof value === "string" && value.trim()) {
				next[key] = value.trim();
			} else {
				delete next[key];
			}
		}
		// Use set() (persisted), not override() (runtime-only).
		ompSettings.set("modelRoles", next);
		await ompSettings.flush();

		return c.json({ ok: true });
	});

	// DELETE /api/settings/model-roles/:role
	app.delete("/settings/model-roles/:role", async (c) => {
		const role = c.req.param("role");
		if (!VALID_ROLES.has(role)) return c.json({ error: `unknown role: ${role}` }, 400);

		const current = ompSettings.getModelRoles();
		const next: Record<string, string> = {};
		for (const [k, v] of Object.entries(current)) {
			if (v) next[k] = v;
		}
		delete next[role];
		ompSettings.set("modelRoles", next);
		await ompSettings.flush();

		return c.json({ ok: true });
	});
const LSP_CONFIG_PATH = path.join(getAgentDir(), "lsp.json");

function getLspScopePaths(cwd: string) {
	return {
		configPath: LSP_CONFIG_PATH,
		cwd,
		workspaceRoot: cwd,
		projectConfigPath: path.join(cwd, "lsp.json"),
	};
}

function cloneJson<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

async function readJsonFile(filePath: string): Promise<unknown | null> {
	try {
		return JSON.parse(await fs.readFile(filePath, "utf8"));
	} catch {
		return null;
	}
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeServers(servers: Record<string, unknown> | undefined) {
	return Object.fromEntries(
		Object.entries(servers ?? {}).map(([name, config]) => [name, cloneJson(config)]),
	);
}

async function loadGlobalLsp(cwd: string): Promise<LspConfigResponse> {
	// Read the raw user-authored file directly, NOT via loadLspConfig(cwd).
	// The SDK's loadConfig filters servers by hasRootMarkers + resolveCommand
	// to produce the *runtime* server set; that's wrong for a config editor
	// which must surface every entry the user has written, even ones that
	// have no root marker in the current cwd or whose binary isn't on PATH.
	const raw = (await readJsonFile(LSP_CONFIG_PATH)) as { servers?: Record<string, unknown>; idleTimeoutMs?: number } | null;
	return {
		...getLspScopePaths(cwd),
		servers: normalizeServers(raw?.servers),
		idleTimeoutMs: raw?.idleTimeoutMs,
	} as LspConfigResponse;
}

async function loadProjectLsp(cwd: string): Promise<ProjectLspConfigResponse> {
	const merged = await loadGlobalLsp(cwd);
	return {
		...merged,
		mergedFromProject: (await readJsonFile(path.join(cwd, "lsp.json"))) != null,
	};
}

function lspBody(body: UpdateLspConfigRequest) {
	return {
		servers: normalizeServers(body.servers as Record<string, unknown>),
		...(body.idleTimeoutMs == null ? {} : { idleTimeoutMs: body.idleTimeoutMs }),
	};
}

app.get("/settings/lsp", async (c) => c.json(await loadGlobalLsp(config.defaultCwd)));
app.put("/settings/lsp", async (c) => {
	let body: UpdateLspConfigRequest;
	try {
		body = (await c.req.json()) as UpdateLspConfigRequest;
	} catch {
		return c.json({ error: "invalid json body" }, 400);
	}
	await writeJsonFile(LSP_CONFIG_PATH, lspBody(body));
	return c.json({ ok: true });
});
app.get("/workspaces/:cwd/lsp", async (c) => c.json(await loadProjectLsp(c.req.param("cwd"))));
app.put("/workspaces/:cwd/lsp", async (c) => {
	const cwd = c.req.param("cwd");
	let body: UpdateLspConfigRequest;
	try {
		body = (await c.req.json()) as UpdateLspConfigRequest;
	} catch {
		return c.json({ error: "invalid json body" }, 400);
	}
	await writeJsonFile(path.join(cwd, "lsp.json"), lspBody(body));
	return c.json({ ok: true });
});

// ── DAP debugger routes ────────────────────────────────────────────────────

const DAP_CONFIG_PATH = path.join(getAgentDir(), "dap.json");

function getDapScopePaths(cwd: string) {
	return {
		configPath: DAP_CONFIG_PATH,
		cwd,
		workspaceRoot: cwd,
		projectConfigPath: path.join(cwd, "dap.json"),
	};
}

async function loadGlobalDap(cwd: string): Promise<DapConfigResponse> {
	// Read the raw user-authored file directly. getAdapterConfigs(cwd) merges
	// ~15 built-in preset adapters into the result, which is what the runtime
	// needs but is wrong for a config editor — the user only sees their own
	// overrides, not every preset the SDK ships with.
	const raw = (await readJsonFile(DAP_CONFIG_PATH)) as { adapters?: Record<string, unknown> } | null;
	return {
		...getDapScopePaths(cwd),
		adapters: normalizeServers(raw?.adapters) as unknown as Record<string, DapAdapterConfig>,
	};
}

async function loadProjectDap(cwd: string): Promise<ProjectDapConfigResponse> {
	const merged = await loadGlobalDap(cwd);
	return {
		...merged,
		mergedFromProject: (await readJsonFile(path.join(cwd, "dap.json"))) != null,
	};
}

function dapBody(body: UpdateDapConfigRequest) {
	return { adapters: normalizeServers(body.adapters as Record<string, unknown>) };
}

app.get("/settings/dap", async (c) => c.json(await loadGlobalDap(config.defaultCwd)));
app.put("/settings/dap", async (c) => {
	let body: UpdateDapConfigRequest;
	try {
		body = (await c.req.json()) as UpdateDapConfigRequest;
	} catch {
		return c.json({ error: "invalid json body" }, 400);
	}
	await writeJsonFile(DAP_CONFIG_PATH, dapBody(body));
	return c.json({ ok: true });
});
app.get("/workspaces/:cwd/dap", async (c) => c.json(await loadProjectDap(c.req.param("cwd"))));
app.put("/workspaces/:cwd/dap", async (c) => {
	const cwd = c.req.param("cwd");
	let body: UpdateDapConfigRequest;
	try {
		body = (await c.req.json()) as UpdateDapConfigRequest;
	} catch {
		return c.json({ error: "invalid json body" }, 400);
	}
	await writeJsonFile(path.join(cwd, "dap.json"), dapBody(body));
	return c.json({ ok: true });
});
const AGENT_CONFIG_DESCRIPTIONS: Record<string, string> = {
	"lsp.enabled": "Enable the LSP tool for code intelligence.",
	"lsp.lazy": "Start language servers on first use instead of at startup.",
	"lsp.formatOnWrite": "Format code files via LSP after writing.",
	"lsp.diagnosticsOnWrite": "Return LSP diagnostics after writing code files.",
	"lsp.diagnosticsOnEdit": "Return LSP diagnostics after editing code files.",
	"lsp.diagnosticsDeduplicate": "Only surface new/changed post-edit diagnostics.",
};
	app.get("/settings/agent-config", (c) => {
		const entries: AgentConfigEntry[] = AGENT_CONFIG_KEYS.map((key) => {
			const field = AGENT_CONFIG_SCHEMA[key]!;
			const raw = ompSettings.get(key as never) as unknown;
			const valueType = field.kind === "enum" ? "enum" : field.kind;
			const value = field.kind === "boolean" ? Boolean(raw) : raw === undefined || raw === null ? null : String(raw);
			const entry: AgentConfigEntry = {
				key,
				valueType,
				value,
				description: AGENT_CONFIG_DESCRIPTIONS[key] ?? "",
			};
			if (field.kind === "enum") entry.options = [...field.options];
			return entry;
		});
		const configPath = path.join(getAgentDir(), "config.yml");
		return c.json({ entries, configPath } satisfies AgentConfigResponse);
	});

	// PUT /api/settings/agent-config
	app.put("/settings/agent-config", async (c) => {
		let body: UpdateAgentConfigRequest;
		try {
			body = (await c.req.json()) as UpdateAgentConfigRequest;
		} catch {
			return c.json({ error: "invalid json body" }, 400);
		}
		const updates = body.updates ?? {};
		for (const [key, value] of Object.entries(updates)) {
			const field = AGENT_CONFIG_SCHEMA[key];
			if (!field) return c.json({ error: `unknown agent-config key: ${key}` }, 400);
			if (value === null && field.kind === "string") continue;
			const err = validateAgentConfigUpdate(key, value);
			if (err) return c.json({ error: err }, 400);
		}
		for (const [key, value] of Object.entries(updates)) {
			const next = value === null ? "" : value;
			ompSettings.set(key as never, next as never);
		}
		await ompSettings.flush();
		return c.json({ ok: true });
	});

	app.delete("/settings/model-roles", async (c) => {
		if (!isLoopbackRequest(c.req.raw)) return c.json({ error: "model-role reset requires loopback" }, 403);
		for (const role of Object.keys(ompSettings.getModelRoles())) {
			ompSettings.setModelRole(role, "");
		}
		await ompSettings.flush();
		return c.json({ ok: true });
	});

	app.post("/server/restart", (c) => {
		if (!isLoopbackRequest(c.req.raw)) return c.json({ error: "restart requires loopback" }, 403);
		const resp = opts.restartServer?.() ?? { ok: false, message: "Restart is unavailable" };
		return c.json(resp);
	});

	return app;
}

function buildEnvResponse(): ListEnvSettingsResponse {
	const entries = ENV_SCHEMA.map((entry) => toResponseEntry(entry));
	return {
		entries,
		envFilePath: getManagedEnvPath(),
		dataDir: getDataDir(),
		restartRequired: entries.some((entry) => entry.restartTarget === "server" && entry.source === "env-file"),
	};
}

function toResponseEntry(entry: EnvSchemaEntry): EnvEntry {
	const current = resolveEntry(entry);
	return {
		key: entry.key,
		masked: maskValue(current.value ?? "", entry.sensitive),
		isSet: isNonEmpty(current.value),
		source: current.source,
		...(entry.defaultValue !== undefined ? { defaultValue: entry.defaultValue } : {}),
		valueType: entry.valueType,
		sensitive: entry.sensitive,
		restartRequired: entry.restartRequired,
		hotApply: entry.hotApply,
		description: entry.description,
		...(entry.options ? { options: entry.options } : {}),
		...(entry.restartRequired ? { restartTarget: entry.restartTarget ?? "server" } : {}),
	};
}

function isNonEmpty(value: string | undefined): boolean {
	return value !== undefined && value !== "";
}

function resolveEntry(entry: EnvSchemaEntry): { source: EnvValueSource; value?: string } {
	const file = readManagedEnvFile();
	const fileValue = file.values.get(entry.key);
	const processValue = process.env[entry.key];
	if (processValue !== undefined && !(MANAGED_ENV_KEYS_LOADED.has(entry.key) && processValue === fileValue)) {
		return { source: "process-env", value: processValue };
	}
	if (fileValue !== undefined) return { source: "env-file", value: fileValue };
	if (entry.defaultValue !== undefined) return { source: "default", value: entry.defaultValue };
	return { source: "unset" };
}

function maskValue(value: string, sensitive: boolean): string {
	if (!value) return "unset";
	if (!sensitive) return value;
	const tail = value.slice(-4);
	return tail ? `••••••••${tail}` : "••••••••";
}

function applyHotUpdates(
	updates: Record<string, string | null>,
	bridge: AgentBridge,
	config: Config,
): string[] {
	const applied: string[] = [];
	const effective = new Map(ENV_SCHEMA.map((entry) => [entry.key, resolveEntry(entry).value]));

	if ("LOG_LEVEL" in updates) {
		if (setLogLevel(effective.get("LOG_LEVEL") ?? "info")) applied.push("LOG_LEVEL");
	}
	if ("OMP_DECK_IDLE_TIMEOUT_MS" in updates) {
		const next = parseInt10(effective.get("OMP_DECK_IDLE_TIMEOUT_MS"), 5 * 60_000);
		config.idleTimeoutMs = next;
		bridge.applyEnvUpdate?.({ idleTimeoutMs: next });
		applied.push("OMP_DECK_IDLE_TIMEOUT_MS");
	}
	if ("OMP_DECK_AUTO_START" in updates) {
		const next = parseAutoStart(effective.get("OMP_DECK_AUTO_START"));
		config.autoStartCommand = next;
		bridge.applyEnvUpdate?.({ autoStartCommand: next });
		applied.push("OMP_DECK_AUTO_START");
	}
	if ("OMP_DECK_DEFAULT_CWD" in updates) {
		const next = effective.get("OMP_DECK_DEFAULT_CWD")?.trim() || os.homedir();
		config.defaultCwd = path.resolve(next);
		applied.push("OMP_DECK_DEFAULT_CWD");
	}
	if ("OMP_DECK_WORKSPACES" in updates) {
		config.extraWorkspaces = splitList(effective.get("OMP_DECK_WORKSPACES")).map((p) => path.resolve(p));
		applied.push("OMP_DECK_WORKSPACES");
	}
	return applied;
}

function isLoopbackRequest(req: Request): boolean {
	const host = new URL(req.url).hostname.toLowerCase();
	return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

