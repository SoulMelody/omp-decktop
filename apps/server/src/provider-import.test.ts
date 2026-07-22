import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";

import { ProviderImportService } from "./provider-import.ts";
import { ModelsConfigStore } from "./models-config-store.ts";
import { getAgentDir, refreshDirsFromEnv } from "@oh-my-pi/pi-utils";

const ENV_KEYS = ["OMP_AGENT_DIR", "PI_CODING_AGENT_DIR", "PI_CODING_AGENT_DIR_ACTIVE"] as const;
const previousEnv = new Map<(typeof ENV_KEYS)[number], string | undefined>();

async function withTempAgentDir(body: (dir: string) => Promise<void>): Promise<void> {
	for (const key of ENV_KEYS) previousEnv.set(key, process.env[key]);
	const dir = await mkdtemp(join(tmpdir(), "omp-deck-import-"));
	process.env.PI_CODING_AGENT_DIR = dir;
	process.env.PI_CODING_AGENT_DIR_ACTIVE = dir;
	process.env.OMP_AGENT_DIR = dir;
	refreshDirsFromEnv();
	try {
		await body(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
		for (const key of ENV_KEYS) {
			const prev = previousEnv.get(key);
			if (prev === undefined) delete process.env[key];
			else process.env[key] = prev;
		}
		refreshDirsFromEnv();
	}
}

function buildCcSwitchDb(path: string, rows: Array<Record<string, unknown>>): void {
	const db = new Database(path);
	try {
		db.run(`CREATE TABLE providers (
			id TEXT NOT NULL,
			app_type TEXT NOT NULL,
			name TEXT NOT NULL,
			settings_config TEXT,
			website_url TEXT,
			category TEXT,
			provider_type TEXT,
			api_key TEXT,
			sort_index INTEGER,
			is_current INTEGER,
			meta TEXT
		)`);
		const insert = db.prepare(
			`INSERT INTO providers (id, app_type, name, settings_config, website_url, category, provider_type, api_key, sort_index, is_current, meta)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		);
		for (const row of rows) {
			insert.run(
				String(row.id),
				String(row.appType),
				String(row.name),
				typeof row.settings_config === "string" ? row.settings_config : null,
				typeof row.website_url === "string" ? row.website_url : null,
				typeof row.category === "string" ? row.category : null,
				typeof row.provider_type === "string" ? row.provider_type : null,
				typeof row.api_key === "string" ? row.api_key : null,
				typeof row.sort_index === "number" ? row.sort_index : 0,
				typeof row.is_current === "number" ? row.is_current : 0,
				typeof row.meta === "string" ? row.meta : null,
			);
		}
	} finally {
		db.close();
	}
}

describe("ProviderImportService", () => {
	beforeEach(() => {
		mock.module("./auth-singleton.ts", () => ({
			getDeckModelRegistry: async () => undefined,
		}));
	});
	afterEach(() => {
		mock.restore();
	});

	test("scan redacts credentials and skips raw env/auth values", async () => {
		await withTempAgentDir(async (dir) => {
			const dbPath = join(dir, "cc-switch.db");
			buildCcSwitchDb(dbPath, [
				{
					id: "alpha",
					appType: "claude",
					name: "Alpha Test",
					settings_config: JSON.stringify({
						env: { ANTHROPIC_AUTH_TOKEN: "sk-leaked-secret-1" },
						auth: { ANTHROPIC_AUTH_TOKEN: "sk-leaked-secret-2" },
					}),
					meta: JSON.stringify({ apiFormat: "anthropic" }),
					is_current: 1,
					sort_index: 1,
				},
			]);
			const service = new ProviderImportService({
				store: new ModelsConfigStore({ agentDir: dir }),
				dbPath,
				agentDir: dir,
			});
			const response = await service.scan();
			expect(response.accessible).toBe(true);
			expect(response.candidates.length).toBe(1);
			const serialized = JSON.stringify(response);
			expect(serialized).not.toContain("sk-leaked-secret-1");
			expect(serialized).not.toContain("sk-leaked-secret-2");
			expect(serialized).not.toContain("ANTHROPIC_AUTH_TOKEN");
			expect(response.candidates[0]!.credentialConfigured).toBe(true);
			expect(response.candidates[0]!.suggestedApi).toBe("anthropic-messages");
			expect(response.candidates[0]!.baseUrl).toBeUndefined();
		});
	});

	test("scan tolerates missing, null, and malformed settings objects", async () => {
		await withTempAgentDir(async (dir) => {
			const dbPath = join(dir, "cc-switch.db");
			buildCcSwitchDb(dbPath, [
				{
					id: "missing-env",
					appType: "claude",
					name: "Missing env",
					settings_config: JSON.stringify({ config: 'base_url = "https://missing-env.test"' }),
					meta: JSON.stringify({ apiFormat: "anthropic" }),
				},
				{
					id: "null-env",
					appType: "claude",
					name: "Null env",
					settings_config: JSON.stringify({ env: null, auth: null }),
					meta: JSON.stringify({ apiFormat: "anthropic" }),
				},
				{
					id: "null-settings",
					appType: "claude",
					name: "Null settings",
					settings_config: "null",
					meta: JSON.stringify({ apiFormat: "anthropic" }),
				},
				{
					id: "array-settings",
					appType: "claude",
					name: "Array settings",
					settings_config: "[]",
					meta: "[]",
				},
			]);
			const service = new ProviderImportService({
				store: new ModelsConfigStore({ agentDir: dir }),
				dbPath,
				agentDir: dir,
			});

			const response = await service.scan();

			expect(response.accessible).toBe(true);
			expect(response.error).toBeUndefined();
			expect(response.candidates).toHaveLength(4);
			expect(response.candidates.find((candidate) => candidate.id === "missing-env")?.baseUrl).toBe(
				"https://missing-env.test",
			);
			expect(response.candidates.every((candidate) => !candidate.credentialConfigured)).toBe(true);
		});
	});

	test("scan surfaces manual-mapping status for unknown api formats", async () => {
		await withTempAgentDir(async (dir) => {
			const dbPath = join(dir, "cc-switch.db");
			buildCcSwitchDb(dbPath, [
				{
					id: "mystery",
					appType: "claude",
					name: "Mystery",
					settings_config: JSON.stringify({ env: {} }),
					meta: JSON.stringify({ apiFormat: "obscure-api-format" }),
					sort_index: 1,
				},
			]);
			const service = new ProviderImportService({ store: new ModelsConfigStore({ agentDir: dir }), dbPath, agentDir: dir });
			const response = await service.scan();
			expect(response.candidates[0]!.status).toBe("manual-mapping");
			expect(response.candidates[0]!.suggestedApi).toBeUndefined();
			expect(response.candidates[0]!.warning).toContain("obscure-api-format");
		});
	});

	test("preview rejects duplicate target IDs", async () => {
		await withTempAgentDir(async (dir) => {
			const dbPath = join(dir, "cc-switch.db");
			buildCcSwitchDb(dbPath, [
				{
					id: "alpha",
					appType: "claude",
					name: "Alpha",
					settings_config: JSON.stringify({ env: { ANTHROPIC_BASE_URL: "https://api.alpha.test" } }),
					meta: JSON.stringify({ apiFormat: "anthropic" }),
					sort_index: 1,
				},
			]);
			const service = new ProviderImportService({ store: new ModelsConfigStore({ agentDir: dir }), dbPath, agentDir: dir });
			const scan = await service.scan();
			expect(async () => {
				await service.preview({
					revision: scan.fingerprint ?? "",
					sourceFingerprint: scan.fingerprint ?? "",
					mappings: [
						{
							sourceKey: scan.candidates[0]!.sourceKey,
							targetId: "same",
							api: "anthropic-messages",
							baseUrl: "https://api.alpha.test",
							migrateCredential: false,
							catalogStrategy: "dynamic",
							collisionAction: "new",
							confirmReplace: false,
						},
						{
							sourceKey: scan.candidates[0]!.sourceKey,
							targetId: "same",
							api: "anthropic-messages",
							baseUrl: "https://api.alpha.test",
							migrateCredential: false,
							catalogStrategy: "dynamic",
							collisionAction: "new",
							confirmReplace: false,
						},
					],
				});
			}).toThrow(/Duplicate/);
		});
	});

	test("commit writes providers to native models.yml without creating extensions", async () => {
		await withTempAgentDir(async (dir) => {
			const dbPath = join(dir, "cc-switch.db");
			buildCcSwitchDb(dbPath, [
				{
					id: "alpha",
					appType: "claude",
					name: "Alpha",
					settings_config: JSON.stringify({
						env: {
							ANTHROPIC_AUTH_TOKEN: "sk-migrate-1",
							ANTHROPIC_BASE_URL: "https://api.alpha.test",
						},
					}),
					meta: JSON.stringify({ apiFormat: "anthropic" }),
					sort_index: 1,
				},
			]);
			const store = new ModelsConfigStore({ agentDir: dir });
			const service = new ProviderImportService({ store, dbPath, agentDir: dir });
			const scan = await service.scan();
			const initial = await store.snapshot();
			const response = await service.commit({
				revision: initial.revision,
				sourceFingerprint: scan.fingerprint ?? "",
				previewToken: "preview",
				mappings: [
					{
						sourceKey: scan.candidates[0]!.sourceKey,
						targetId: "ccswitch-alpha",
						api: "anthropic-messages",
						baseUrl: "https://api.alpha.test",
						migrateCredential: true,
						catalogStrategy: "dynamic",
						collisionAction: "new",
						confirmReplace: false,
					},
				],
			});
			expect(response.providers.find((p) => p.id === "ccswitch-alpha")).toBeDefined();
			const envText = await Bun.file(join(dir, ".env")).text();
			expect(envText).toContain("sk-migrate-1");
			const modelsText = await Bun.file(join(dir, "models.yml")).text();
			expect(modelsText).not.toContain("sk-migrate-1");
			// Note: extension dirs are NOT created
			const extDir = await readdirSafe(join(dir, "extensions"));
			expect(extDir.filter((entry) => entry.startsWith("ccswitch-"))).toEqual([]);
		});
	});

	test("commit rejects when source fingerprint changed after preview", async () => {
		await withTempAgentDir(async (dir) => {
			const dbPath = join(dir, "cc-switch.db");
			buildCcSwitchDb(dbPath, [
				{
					id: "alpha",
					appType: "claude",
					name: "Alpha",
					settings_config: JSON.stringify({ env: { ANTHROPIC_BASE_URL: "https://api.alpha.test" } }),
					meta: JSON.stringify({ apiFormat: "anthropic" }),
					sort_index: 1,
				},
			]);
			const store = new ModelsConfigStore({ agentDir: dir });
			const service = new ProviderImportService({ store, dbPath, agentDir: dir });
			await store.snapshot();
			expect(async () => {
				await service.commit({
					revision: "R0",
					sourceFingerprint: "stale-hash",
					previewToken: "",
					mappings: [
						{
							sourceKey: "alpha::claude",
							targetId: "ccswitch-alpha",
							api: "anthropic-messages",
							baseUrl: "https://api.alpha.test",
							migrateCredential: false,
							catalogStrategy: "dynamic",
							collisionAction: "new",
							confirmReplace: false,
						},
					],
				});
			}).toThrow(/fingerprint/);
		});
	});

	test("legacy/migrate retires the extension directory after success", async () => {
		await withTempAgentDir(async (dir) => {
			const dbPath = join(dir, "cc-switch.db");
			buildCcSwitchDb(dbPath, [
				{
					id: "alpha",
					appType: "claude",
					name: "Alpha",
					settings_config: JSON.stringify({ env: { ANTHROPIC_BASE_URL: "https://api.alpha.test" } }),
					meta: JSON.stringify({ apiFormat: "anthropic" }),
					sort_index: 1,
				},
			]);
			const extDir = join(dir, "extensions", "ccswitch-alpha");
			await mkdir(extDir, { recursive: true });
			await writeFile(join(extDir, "index.ts"), "// omp-deck cc-switch import\nccswitch_alpha(pi) {}\n", "utf8");

			const store = new ModelsConfigStore({ agentDir: dir });
			const service = new ProviderImportService({ store, dbPath, agentDir: dir });
			const scan = await service.scan();
			const revision = (await store.snapshot()).revision;
			const response = await service.migrate({
				revision,
				extensionPath: "ccswitch-alpha",
				mapping: {
					sourceKey: scan.candidates[0]!.sourceKey,
					targetId: "ccswitch-alpha",
					api: "anthropic-messages",
					baseUrl: "https://api.alpha.test",
					migrateCredential: false,
					catalogStrategy: "dynamic",
					collisionAction: "new",
					confirmReplace: false,
				},
			});
			expect(response.providers.find((p) => p.id === "ccswitch-alpha")).toBeDefined();
			const activeExt = await readdirSafe(join(dir, "extensions"));
			expect(activeExt.filter((e) => e.startsWith("ccswitch-"))).toEqual([]);
			const disabledExt = await readdirSafe(join(dir, "disabled-extensions"));
			expect(disabledExt).toContain("ccswitch-alpha");
		});
	});

	test("legacy/rollback restores the extension directory", async () => {
		await withTempAgentDir(async (dir) => {
			const extDir = join(dir, "extensions", "ccswitch-bravo");
			const backupDir = join(dir, "disabled-extensions", "ccswitch-bravo");
			await mkdir(backupDir, { recursive: true });
			await writeFile(join(backupDir, "index.ts"), "// saved\n", "utf8");
			const store = new ModelsConfigStore({ agentDir: dir });
			const snapshot = await store.snapshot();
			await store.commit({
				revision: snapshot.revision,
				puts: [{ id: "ccswitch-bravo", definition: { baseUrl: "https://api.bravo.test", api: "openai-completions" } }],
			});
			const service = new ProviderImportService({ store, agentDir: dir });
			const final = await service.rollback({
				providerId: "ccswitch-bravo",
				backupPath: backupDir,
				revision: (await store.snapshot()).revision,
			});
			const restored = await readdirSafe(join(dir, "extensions"));
			expect(restored).toContain("ccswitch-bravo");
			const removed = (await store.snapshot()).providers.find((p) => p.id === "ccswitch-bravo");
			expect(removed).toBeUndefined();
			expect(final.backupPath).toBe(backupDir);
		});
	});
});

async function readdirSafe(path: string): Promise<string[]> {
	const { readdir } = await import("node:fs/promises");
	try {
		return await readdir(path);
	} catch {
		return [];
	}
}

void getAgentDir;