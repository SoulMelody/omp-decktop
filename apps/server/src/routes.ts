import { Hono } from "hono";
import type {
	CreateSessionRequest,
	CreateSessionResponse,
	ListModelsResponse,
	ListSessionsResponse,
	ListWorkspacesResponse,
	ModelRef,
	RestartServerResponse,
	WorkspaceEntry,
} from "@omp-deck/protocol";

import type { Config } from "./config.ts";
import { logger } from "./log.ts";
import { getBuildInfo, getUptimeSecs } from "./build-info.ts";
import { getUpdateCheck } from "./update-check.ts";
import { deleteSessionFile } from "./session-delete.ts";
import type { AgentBridge } from "./bridge/types.ts";

const log = logger("routes");

import { buildTasksRouter } from "./routes-tasks.ts";
import { buildSettingsRouter } from "./routes-settings.ts";
import { buildRoutinesRouter } from "./routes-routines.ts";
import { buildHooksRouter } from "./routes-hooks.ts";
import { buildInboxRouter } from "./routes-inbox.ts";
import { buildUtilityRouter } from "./routes-cron.ts";
import { buildSlashCommandsRouter } from "./routes-slash-commands.ts";
import { buildFsRouter } from "./routes-fs.ts";
import { buildBridgesRouter } from "./routes-bridges.ts";
import { buildMarketplaceRouter } from "./routes-marketplace.ts";
import { buildSkillsRouter } from "./routes-skills.ts";
import { buildKbRouter } from "./routes-kb.ts";
import { buildUploadsRouter } from "./routes-uploads.ts";
import { buildOrientationRouter } from "./routes-orientation.ts";
import { buildAuthOAuthRouter } from "./routes-auth-oauth.ts";
import { buildOnboardingRouter } from "./routes-onboarding.ts";
import { buildCcSwitchRouter } from "./routes-ccswitch.ts";
import { buildTerminalRouter } from "./routes-terminal.ts";
import { buildAgentOutputRouter } from "./routes-agent-output.ts";
import { buildFsReadRouter } from "./routes-fs-read.ts";
import { mcpApp } from "./routes-mcp.ts";
import type { RoutinesRunner } from "./routines-runner.ts";
import type { BridgeSupervisor } from "./bridge-supervisor.ts";
import type { MarketplaceService } from "./marketplace-service.ts";
import type { SkillsService } from "./skills-service.ts";
import type { KbService } from "./kb-service.ts";
import { getWorkspacePreference, listWorkspacePreferences, setWorkspacePreference } from "./db/workspace-preferences.ts";

export function buildRouter(
	bridge: AgentBridge,
	config: Config,
	runner: RoutinesRunner,
	supervisor: BridgeSupervisor,
	marketplace: MarketplaceService,
	skills: SkillsService,
	kb: KbService,
	opts: { restartServer?: () => RestartServerResponse } = {},
): Hono {
	const app = new Hono();

	app.get("/health", (c) => {
		const info = getBuildInfo();
		return c.json({
			ok: true,
			pid: info.pid,
			defaultCwd: config.defaultCwd,
			extraWorkspaces: config.extraWorkspaces,
			serverStartedAt: info.serverStartedAt,
			version: info.version,
			buildSha: info.buildSha,
			uptimeSecs: getUptimeSecs(),
		});
	});

	app.get("/version", async (c) => {
		const info = getBuildInfo();
		const body = await getUpdateCheck({ currentVersion: info.version });
		return c.json(body);
	});

	app.get("/workspaces", async (c) => {
		const allSessions = await bridge.listSessions({});
		const counts = new Map<string, number>();
		const lastActive = new Map<string, string>();
		for (const s of allSessions) {
			if (!s.cwd) continue;
			counts.set(s.cwd, (counts.get(s.cwd) ?? 0) + 1);
			const prev = lastActive.get(s.cwd);
			if (!prev || s.updatedAt > prev) lastActive.set(s.cwd, s.updatedAt);
		}

		const prefs = listWorkspacePreferences();
		const prefsByCwd = new Map(prefs.map((p) => [p.cwd, p.model]));

		// Always include default + extras even if zero sessions.
		const known = new Set<string>([config.defaultCwd, ...config.extraWorkspaces]);
		for (const cwd of counts.keys()) known.add(cwd);
		for (const cwd of prefsByCwd.keys()) known.add(cwd);

		const workspaces: WorkspaceEntry[] = Array.from(known)
			.map((cwd) => {
				const defaultModel = prefsByCwd.get(cwd) ?? undefined;
				const lastActiveAt = lastActive.get(cwd);
				return {
					cwd,
					label: deriveLabel(cwd),
					sessionCount: counts.get(cwd) ?? 0,
					...(lastActiveAt ? { lastActiveAt } : {}),
					...(defaultModel ? { defaultModel } : {}),
				};
			})
			.sort((a, b) => b.sessionCount - a.sessionCount || a.label.localeCompare(b.label));

		const body: ListWorkspacesResponse = {
			workspaces,
			defaultCwd: config.defaultCwd,
		};
		return c.json(body);
	});

	app.get("/workspace-preferences", (c) => {
		return c.json({ preferences: listWorkspacePreferences() });
	});

	app.put("/workspace-preferences", async (c) => {
		let body: { cwd?: unknown; model?: unknown };
		try {
			body = (await c.req.json()) as { cwd?: unknown; model?: unknown };
		} catch {
			return c.json({ error: "invalid json body" }, 400);
		}
		if (typeof body.cwd !== "string" || body.cwd.trim().length === 0) {
			return c.json({ error: "cwd is required" }, 400);
		}
		const cwd = body.cwd.trim();
		if (body.model !== null) {
			if (!body.model || typeof body.model !== "object") {
				return c.json({ error: "model requires provider and id strings" }, 400);
			}
			const candidate = body.model as { provider?: unknown; id?: unknown };
			if (typeof candidate.provider !== "string" || typeof candidate.id !== "string") {
				return c.json({ error: "model requires provider and id strings" }, 400);
			}
			return c.json(setWorkspacePreference(cwd, { provider: candidate.provider, id: candidate.id }));
		}
		return c.json(setWorkspacePreference(cwd, null));
	});

	app.get("/sessions", async (c) => {
		const cwd = c.req.query("cwd");
		try {
			const sessions = await bridge.listSessions(cwd ? { cwd } : {});
			const body: ListSessionsResponse = { sessions };
			return c.json(body);
		} catch (err) {
			log.error(`listSessions failed`, err);
			return c.json({ error: String(err) }, 500);
		}
	});

	app.post("/sessions", async (c) => {
		let body: CreateSessionRequest;
		try {
			body = (await c.req.json()) as CreateSessionRequest;
		} catch {
			return c.json({ error: "invalid json body" }, 400);
		}

		if (body.resumeFromPath && (body.model || body.planMode)) {
			return c.json({ error: "resumeFromPath cannot be combined with model or planMode" }, 400);
		}

		const cwd = body.cwd?.trim() || config.defaultCwd;
		const workspaceDefaultModel = body.model ? undefined : getWorkspacePreference(cwd)?.model;
		const model = body.model ?? workspaceDefaultModel;

		try {
			const handle = body.resumeFromPath
				? await bridge.resumeSession({ sessionPath: body.resumeFromPath })
				: await bridge.createSession({
						cwd,
						...(model ? { model } : {}),
						...(body.suppressAutoStart ? { suppressAutoStart: true } : {}),
					});
			if (!body.resumeFromPath && body.planMode) await handle.setPlanMode(true);
			const resp: CreateSessionResponse = {
				sessionId: handle.sessionId,
				sessionFile: handle.sessionFile,
				cwd: handle.cwd,
			};
			return c.json(resp);
		} catch (err) {
			log.error(`createSession failed`, err);
			return c.json({ error: String(err) }, 500);
		}
	});

	app.post("/sessions/:id/abort", async (c) => {
		const id = c.req.param("id");
		const handle = bridge.getSession(id);
		if (!handle) return c.json({ error: "session not found" }, 404);
		try {
			await handle.abort();
			return c.json({ ok: true });
		} catch (err) {
			log.error(`abort failed`, err);
			return c.json({ error: String(err) }, 500);
		}
	});

	app.post("/sessions/:id/compact", async (c) => {
		const id = c.req.param("id");
		const handle = bridge.getSession(id);
		if (!handle) return c.json({ error: "session not found" }, 404);
		// Body is optional — accept missing/empty JSON without bouncing.
		let body: { focus?: string } = {};
		try {
			const raw = await c.req.text();
			if (raw.trim().length > 0) body = JSON.parse(raw) as { focus?: string };
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
		try {
			await handle.compact(body.focus);
			return c.json({ ok: true });
		} catch (err) {
			log.error(`compact failed`, err);
			return c.json({ error: String(err) }, 500);
		}
	});

	app.get("/sessions/:id/branch-points", (c) => {
		const handle = bridge.getSession(c.req.param("id"));
		if (!handle) return c.json({ error: "session not found" }, 404);
		return c.json({ points: handle.getBranchPoints() });
	});

	app.post("/sessions/:id/fork", async (c) => {
		const handle = bridge.getSession(c.req.param("id"));
		if (!handle) return c.json({ error: "session not found" }, 404);
		try {
			await handle.fork();
			return c.json({ ok: true });
		} catch (err) {
			log.error(`fork failed`, err);
			return c.json({ error: String((err as Error).message ?? err) }, 500);
		}
	});

	app.post("/sessions/:id/branch", async (c) => {
		const handle = bridge.getSession(c.req.param("id"));
		if (!handle) return c.json({ error: "session not found" }, 404);
		let body: { entryId?: string };
		try {
			body = (await c.req.json()) as { entryId?: string };
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
		if (!body.entryId) return c.json({ error: "entryId required" }, 400);
		try {
			const res = await handle.branch(body.entryId);
			return c.json({ ok: true, selectedText: res.selectedText });
		} catch (err) {
			log.error(`branch failed`, err);
			return c.json({ error: String((err as Error).message ?? err) }, 500);
		}
	});

	app.post("/sessions/:id/rewind", async (c) => {
		const handle = bridge.getSession(c.req.param("id"));
		if (!handle) return c.json({ error: "session not found" }, 404);
		let body: { entryId?: string };
		try {
			body = (await c.req.json()) as { entryId?: string };
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
		if (!body.entryId) return c.json({ error: "entryId required" }, 400);
		try {
			const res = await handle.rewind(body.entryId);
			return c.json({ ok: true, editorText: res.editorText });
		} catch (err) {
			log.error(`rewind failed`, err);
			return c.json({ error: String((err as Error).message ?? err) }, 500);
		}
	});

	app.patch("/sessions/:id", async (c) => {
		const id = c.req.param("id");
		const handle = bridge.getSession(id);
		if (!handle) return c.json({ error: "session not found or not active" }, 404);
		let body: { name?: string; model?: { provider?: unknown; id?: unknown } };
		try {
			body = (await c.req.json()) as { name?: string; model?: { provider?: unknown; id?: unknown } };
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
		try {
			if (typeof body.name === "string") {
				await handle.setName(body.name.trim());
			}
			if (body.model && typeof body.model === "object") {
				const provider = typeof body.model.provider === "string" ? body.model.provider : "";
				const modelId = typeof body.model.id === "string" ? body.model.id : "";
				if (!provider || !modelId) {
					return c.json({ error: "model requires provider and id strings" }, 400);
				}
				await handle.setModel({ provider, id: modelId });
			}
			return c.json({ ok: true, sessionId: id });
		} catch (err) {
			log.error(`patch session failed`, err);
			return c.json({ error: String((err as Error).message ?? err) }, 500);
		}
	});

	app.get("/models", async (c) => {
		const sessionId = c.req.query("sessionId");
		try {
			const opts: { sessionId?: string } = {};
			if (sessionId) opts.sessionId = sessionId;
			const models = await bridge.listModels(opts);
			const active = models.find((m) => m.isCurrent);
			const body: ListModelsResponse = {
				models,
				...(active ? { active: { provider: active.provider, id: active.id } } : {}),
			};
			return c.json(body);
		} catch (err) {
			log.error(`listModels failed`, err);
			return c.json({ error: String((err as Error).message ?? err) }, 500);
		}
	});

	app.delete("/sessions/:id", async (c) => {
		const id = c.req.param("id");
		// `?deleteFile=true` additionally removes the session's on-disk JSONL
		// history. Default (absent/false) is the historical behavior: dispose
		// the in-memory handle only, leaving the transcript resumable.
		const deleteFile = c.req.query("deleteFile") === "true";

		// Resolve the on-disk path BEFORE disposing — a live handle exposes its
		// own `sessionFile`; otherwise fall back to the persisted index. Never
		// trust a client-supplied path.
		let filePath: string | undefined;
		const handle = bridge.getSession(id);
		if (deleteFile) {
			filePath = handle?.sessionFile;
			if (!filePath) {
				const summary = (await bridge.listSessions({})).find((s) => s.id === id);
				filePath = summary?.path;
			}
		}

		try {
			// Dispose the live handle if there is one. A purely persisted session
			// (no handle) is a valid delete-file target, so a missing handle is
			// only an error when we're not also deleting the file.
			if (handle) await handle.dispose();
			else if (!deleteFile) return c.json({ error: "session not found" }, 404);

			if (deleteFile) {
				await deleteSessionFile(filePath, [config.defaultCwd, ...config.extraWorkspaces]);
			}
			return c.json({ ok: true });
		} catch (err) {
			log.error(`dispose failed`, err);
			return c.json({ error: String(err) }, 500);
		}
	});

	app.route("/", buildTasksRouter());
	app.route("/", buildUploadsRouter({ uploadsRoot: config.uploadsRoot }));
	app.route("/", buildRoutinesRouter(runner));
	app.route("/", buildHooksRouter(runner));
	app.route("/", buildAgentOutputRouter());
	app.route("/", buildInboxRouter());
	app.route("/", buildUtilityRouter());
	app.route("/", buildSlashCommandsRouter());
	app.route("/", buildFsRouter(config));
	app.route("/", buildFsReadRouter(config));
	app.route("/", buildSettingsRouter(bridge, config, opts));
	app.route("/", buildOrientationRouter());
	app.route("/", buildBridgesRouter(supervisor));
	app.route("/", buildMarketplaceRouter(marketplace));
	app.route("/", buildSkillsRouter(skills));
	app.route("/", buildKbRouter(kb));
	app.route("/auth/oauth", buildAuthOAuthRouter());
	app.route("/onboarding", buildOnboardingRouter());
	app.route("/ccswitch", buildCcSwitchRouter({ cwd: config.defaultCwd }));
	app.route("/mcp", mcpApp);
	app.route("/", buildTerminalRouter());

	return app;
}

function deriveLabel(cwd: string): string {
	if (!cwd) return "(unknown)";
	const parts = cwd.split(/[\\/]/).filter(Boolean);
	return parts[parts.length - 1] ?? cwd;
}
