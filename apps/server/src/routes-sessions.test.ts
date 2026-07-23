import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { ModelRef, SessionSnapshot, SessionSummary } from "@omp-deck/protocol";

import type { AgentBridge, CreateSessionOpts, ResumeSessionOpts, SessionHandle } from "./bridge/types.ts";
import type { Config } from "./config.ts";
import { closeDb, openDb } from "./db/index.ts";
import { setWorkspacePreference } from "./db/workspace-preferences.ts";
import { buildRouter } from "./routes.ts";
import { makeTestConfig } from "./test-config.ts";

let dbDir: string | null = null;

afterEach(() => {
	closeDb();
	if (dbDir) {
		try {
			fs.rmSync(dbDir, { recursive: true, force: true });
		} catch {
			// Windows SQLite handles can lag past close(); leaking a temp dir is fine.
		}
		dbDir = null;
	}
});

function bootDb(): string {
	dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-deck-routes-sessions-db-"));
	openDb({ path: path.join(dbDir, "deck.db") });
	return dbDir;
}

function model(provider: string, id: string): ModelRef {
	return { provider, id };
}

function testConfig(root: string): Config {
	return makeTestConfig({
		defaultCwd: path.join(root, "default-workspace"),
		extraWorkspaces: [path.join(root, "extra-workspace")],
		dbPath: path.join(root, "deck.db"),
		uploadsRoot: path.join(root, "uploads"),
	});
}

function noopService<T>(): T {
	return {} as T;
}

class FakeSessionHandle implements SessionHandle {
	readonly sessionFile: string | undefined;
	readonly cwd: string;
	readonly planModeCalls: boolean[] = [];
	private planModeResolver: (() => void) | null = null;
	readonly planModeStarted: Promise<void>;

	constructor(readonly sessionId: string, opts: { cwd: string; sessionFile?: string }) {
		this.cwd = opts.cwd;
		this.sessionFile = opts.sessionFile;
		this.planModeStarted = new Promise((resolve) => {
			this.planModeResolver = resolve;
		});
	}

	subscribe(): () => void {
		return () => {};
	}

	snapshot(): SessionSnapshot {
		return { sessionId: this.sessionId, cwd: this.cwd, messages: [], queuedPrompts: [] } as unknown as SessionSnapshot;
	}

	async fork(): Promise<void> {}
	async branch(): Promise<{ selectedText: string }> { return { selectedText: "" }; }
	async rewind(): Promise<{ editorText?: string }> { return {}; }
	getBranchPoints(): Array<{ entryId: string; text: string }> { return []; }
	async prompt(): Promise<void> {}
	isStreamingNow(): boolean { return false; }
	queuedMessageCount(): number { return 0; }
	clearQueue(): { steering: number; followUp: number } { return { steering: 0, followUp: 0 }; }
	getQueueSnapshot(): never[] { return []; }
	async cancelQueuedById(): Promise<boolean> { return false; }
	async editQueuedById(): Promise<boolean> { return false; }
	async abort(): Promise<void> {}
	async setName(): Promise<void> {}
	async compact(): Promise<void> {}
	async setModel(): Promise<void> {}
	async dispatchSlashCommand(): Promise<{ kind: "fallthrough" }> { return { kind: "fallthrough" }; }
	async dispatchDeckSlashCommand(): Promise<{ kind: "fallthrough" }> { return { kind: "fallthrough" }; }
	getContextUsage(): undefined { return undefined; }
	async setPlanMode(enabled: boolean): Promise<void> {
		this.planModeCalls.push(enabled);
		this.planModeResolver?.();
	}
	getPlanModeContext(): undefined { return undefined; }
	getPendingPlanApproval(): undefined { return undefined; }
	async respondToPlanApproval(): Promise<"unknown"> { return "unknown"; }
	async actOnGoal(): Promise<void> {}
	getGoalModeContext(): undefined { return undefined; }
	async dispose(): Promise<void> {}
}

class FakeBridge implements AgentBridge {
	readonly createSessionCalls: CreateSessionOpts[] = [];
	readonly resumeSessionCalls: ResumeSessionOpts[] = [];
	sessions: SessionSummary[] = [];
	lastHandle: FakeSessionHandle | null = null;

	async createSession(opts: CreateSessionOpts): Promise<SessionHandle> {
		this.createSessionCalls.push(opts);
		const handle = new FakeSessionHandle(`session-${this.createSessionCalls.length}`, {
			cwd: opts.cwd,
			sessionFile: path.join(opts.cwd, `.session-${this.createSessionCalls.length}.jsonl`),
		});
		this.lastHandle = handle;
		return handle;
	}

	async resumeSession(opts: ResumeSessionOpts): Promise<SessionHandle> {
		this.resumeSessionCalls.push(opts);
		return new FakeSessionHandle("resumed-session", { cwd: path.dirname(opts.sessionPath), sessionFile: opts.sessionPath });
	}

	getSession(): SessionHandle | undefined { return undefined; }
	async listSessions(): Promise<SessionSummary[]> { return this.sessions; }
	trackSubscriberAdded(): void {}
	trackSubscriberRemoved(): void {}
	bumpActivity(): void {}
	async listModels(): Promise<never[]> { return []; }
	subscribeUiFrames(): () => void { return () => {}; }
	respondToUiDialog(): void {}
	subscribePlanModeFrames(): () => void { return () => {}; }
	async respondToPlanApproval(): Promise<"unknown"> { return "unknown"; }
	async dispose(): Promise<void> {}
}

function buildTestApp(bridge: FakeBridge, config: Config) {
	return buildRouter(
		bridge,
		config,
		noopService(),
		noopService(),
		noopService(),
		noopService(),
		noopService(),
	);
}

async function json(res: Response): Promise<unknown> {
	return await res.json();
}

describe("POST /sessions", () => {
	test.each(["model", "planMode"] as const)("rejects resumeFromPath combined with %s", async (field) => {
		const root = bootDb();
		const bridge = new FakeBridge();
		const app = buildTestApp(bridge, testConfig(root));
		const body = {
			resumeFromPath: path.join(root, "existing-session.jsonl"),
			...(field === "model" ? { model: model("openai", "gpt-5.1-codex") } : { planMode: true }),
		};

		const res = await app.request("/sessions", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});

		expect(res.status).toBe(400);
		expect(await json(res)).toEqual({ error: "resumeFromPath cannot be combined with model or planMode" });
		expect(bridge.resumeSessionCalls).toEqual([]);
		expect(bridge.createSessionCalls).toEqual([]);
	});

	test("uses explicit model instead of the workspace default", async () => {
		const root = bootDb();
		const config = testConfig(root);
		const bridge = new FakeBridge();
		const app = buildTestApp(bridge, config);
		const workspaceDefault = model("anthropic", "claude-sonnet-5");
		const explicit = model("openai", "gpt-5.1-codex");
		setWorkspacePreference(config.defaultCwd, workspaceDefault);

		const res = await app.request("/sessions", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ cwd: config.defaultCwd, model: explicit }),
		});

		expect(res.status).toBe(200);
		expect(bridge.createSessionCalls).toEqual([{ cwd: config.defaultCwd, model: explicit }]);
	});

	test("uses the workspace default model when the request omits model", async () => {
		const root = bootDb();
		const config = testConfig(root);
		const bridge = new FakeBridge();
		const app = buildTestApp(bridge, config);
		const workspaceDefault = model("anthropic", "claude-sonnet-5");
		setWorkspacePreference(config.defaultCwd, workspaceDefault);

		const res = await app.request("/sessions", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ cwd: config.defaultCwd }),
		});

		expect(res.status).toBe(200);
		expect(bridge.createSessionCalls).toEqual([{ cwd: config.defaultCwd, model: workspaceDefault }]);
	});

	test("enters plan mode before responding to a planMode=true launch", async () => {
		const root = bootDb();
		const config = testConfig(root);
		const bridge = new FakeBridge();
		const app = buildTestApp(bridge, config);

		const res = await app.request("/sessions", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ cwd: config.defaultCwd, planMode: true }),
		});

		expect(res.status).toBe(200);
		expect(bridge.lastHandle?.planModeCalls).toEqual([true]);
	});
});

describe("workspace model preference routes", () => {
	test("GET /workspaces includes the persisted defaultModel for each workspace", async () => {
		const root = bootDb();
		const config = testConfig(root);
		const bridge = new FakeBridge();
		const app = buildTestApp(bridge, config);
		const defaultModel = model("openai", "gpt-5.1-codex");
		setWorkspacePreference(config.defaultCwd, defaultModel);

		const res = await app.request("/workspaces");
		const body = await res.json() as { workspaces: Array<{ cwd: string; defaultModel?: ModelRef }> };

		expect(res.status).toBe(200);
		expect(body.workspaces.find((w) => w.cwd === config.defaultCwd)?.defaultModel).toEqual(defaultModel);
		expect(body.workspaces.find((w) => w.cwd === config.extraWorkspaces[0])?.defaultModel).toBeUndefined();
	});

	test("PUT /workspace-preferences persists and clears a workspace default model", async () => {
		const root = bootDb();
		const config = testConfig(root);
		const bridge = new FakeBridge();
		const app = buildTestApp(bridge, config);
		const preferred = model("anthropic", "claude-sonnet-5");

		const setRes = await app.request("/workspace-preferences", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ cwd: config.defaultCwd, model: preferred }),
		});
		expect(setRes.status).toBe(200);
		expect(await json(setRes)).toEqual({ cwd: config.defaultCwd, model: preferred });

		const listedAfterSet = await (await app.request("/workspace-preferences")).json() as { preferences: unknown[] };
		expect(listedAfterSet.preferences).toEqual([{ cwd: config.defaultCwd, model: preferred }]);

		const clearRes = await app.request("/workspace-preferences", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ cwd: config.defaultCwd, model: null }),
		});
		expect(clearRes.status).toBe(200);
		expect(await json(clearRes)).toEqual({ cwd: config.defaultCwd, model: null });

		const listedAfterClear = await (await app.request("/workspace-preferences")).json() as { preferences: unknown[] };
		expect(listedAfterClear.preferences).toEqual([]);
	});

	test.each([
		{ name: "missing provider", model: { id: "gpt-5.1-codex" } },
		{ name: "missing id", model: { provider: "openai" } },
		{ name: "non-string provider", model: { provider: 42, id: "gpt-5.1-codex" } },
		{ name: "non-string id", model: { provider: "openai", id: 42 } },
	])("PUT /workspace-preferences rejects $name", async ({ model: badModel }) => {
		const root = bootDb();
		const config = testConfig(root);
		const bridge = new FakeBridge();
		const app = buildTestApp(bridge, config);

		const res = await app.request("/workspace-preferences", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ cwd: config.defaultCwd, model: badModel }),
		});

		expect(res.status).toBe(400);
		expect(await json(res)).toEqual({ error: "model requires provider and id strings" });
	});
});

describe("DELETE /sessions/:id", () => {
	test("dispose-only on an unknown session returns 404", async () => {
		const root = bootDb();
		const config = testConfig(root);
		const bridge = new FakeBridge();
		const app = buildTestApp(bridge, config);

		const res = await app.request("/sessions/nope", { method: "DELETE" });

		expect(res.status).toBe(404);
		expect(await json(res)).toEqual({ error: "session not found" });
	});

	test("deleteFile=true removes the on-disk transcript found via the persisted index", async () => {
		const root = bootDb();
		const config = testConfig(root);
		const bridge = new FakeBridge();
		const app = buildTestApp(bridge, config);

		fs.mkdirSync(config.defaultCwd, { recursive: true });
		const filePath = path.join(config.defaultCwd, "session-abc.jsonl");
		fs.writeFileSync(filePath, "{}\n");
		bridge.sessions = [
			{
				id: "abc",
				path: filePath,
				cwd: config.defaultCwd,
				createdAt: "2026-01-01T00:00:00.000Z",
				updatedAt: "2026-01-01T00:00:00.000Z",
				messageCount: 0,
			},
		];

		const res = await app.request("/sessions/abc?deleteFile=true", { method: "DELETE" });

		expect(res.status).toBe(200);
		expect(await json(res)).toEqual({ ok: true });
		expect(fs.existsSync(filePath)).toBe(false);
	});

	test("deleteFile=true on an unknown session is a no-op success (nothing to delete)", async () => {
		const root = bootDb();
		const config = testConfig(root);
		const bridge = new FakeBridge();
		const app = buildTestApp(bridge, config);

		const res = await app.request("/sessions/ghost?deleteFile=true", { method: "DELETE" });

		expect(res.status).toBe(200);
		expect(await json(res)).toEqual({ ok: true });
	});

	test("deleteFile=true refuses a transcript path outside every allowed root", async () => {
		// `root` lives under os.tmpdir(), which on Windows resolves under
		// USERPROFILE — and the guard treats home as an allowed root. Clear
		// HOME/USERPROFILE for this case so the ONLY allowed roots are the
		// config's workspace roots, making the "outside" path genuinely outside.
		const prevHome = process.env.HOME;
		const prevProfile = process.env.USERPROFILE;
		delete process.env.HOME;
		delete process.env.USERPROFILE;
		try {
			const root = bootDb();
			const config = testConfig(root);
			const bridge = new FakeBridge();
			const app = buildTestApp(bridge, config);

			const outsideDir = path.join(root, "outside");
			fs.mkdirSync(outsideDir, { recursive: true });
			const outside = path.join(outsideDir, "session.jsonl");
			fs.writeFileSync(outside, "{}\n");
			bridge.sessions = [
				{
					id: "escapee",
					path: outside,
					cwd: outsideDir,
					createdAt: "2026-01-01T00:00:00.000Z",
					updatedAt: "2026-01-01T00:00:00.000Z",
					messageCount: 0,
				},
			];

			const res = await app.request("/sessions/escapee?deleteFile=true", { method: "DELETE" });

			expect(res.status).toBe(500);
			expect(fs.existsSync(outside)).toBe(true);
		} finally {
			if (prevHome !== undefined) process.env.HOME = prevHome;
			if (prevProfile !== undefined) process.env.USERPROFILE = prevProfile;
		}
	});
});
