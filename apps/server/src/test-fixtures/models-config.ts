import { afterEach, beforeEach } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { ModelsConfigSnapshot } from "../models-config-store.ts";
import { ModelsConfigStore } from "../models-config-store.ts";

/**
 * Isolated models.yml + .env fixture for store tests. Each fixture allocates a
 * private temporary directory and rewrites the deck-known environment variable
 * that points to the active agent directory so neither the store under test nor
 * its helpers ever reach the user's real `~/.omp/agent`.
 *
 * Use via `await withModelsConfigFixture(async (fixture) => { ... })` so the
 * temporary directory is removed even on test failure.
 */

const ENV_AGENT_DIR_KEYS = ["OMP_AGENT_DIR", "PI_CODING_AGENT_DIR", "PI_CODING_AGENT_DIR_ACTIVE"] as const;
const previousEnv = new Map<(typeof ENV_AGENT_DIR_KEYS)[number] | "PATH", string | undefined>();

export interface ModelsConfigFixture {
	dir: string;
	modelsPath: string;
	envPath: string;
	store: ModelsConfigStore;
	readModels(): Promise<string>;
	readEnv(): Promise<string>;
	writeModels(content: string): Promise<void>;
	writeEnv(content: string): Promise<void>;
}

export async function withModelsConfigFixture(
	body: (fixture: ModelsConfigFixture) => Promise<void>,
	options: { modelsContent?: string; envContent?: string } = {},
): Promise<void> {
	for (const key of ENV_AGENT_DIR_KEYS) previousEnv.set(key, process.env[key]);
	const dir = await mkdtemp(join(tmpdir(), `omp-deck-models-${randomUUID()}-`));
	process.env.PI_CODING_AGENT_DIR = dir;
	process.env.PI_CODING_AGENT_DIR_ACTIVE = dir;
	process.env.OMP_AGENT_DIR = dir;
	const modelsPath = join(dir, "models.yml");
	const envPath = join(dir, ".env");
	if (options.modelsContent !== undefined) await writeFile(modelsPath, options.modelsContent, "utf8");
	if (options.envContent !== undefined) await writeFile(envPath, options.envContent, { encoding: "utf8", mode: 0o600 });
	const store = new ModelsConfigStore({ agentDir: dir });
	const fixture: ModelsConfigFixture = {
		dir,
		modelsPath,
		envPath,
		store,
		readModels: () => readText(modelsPath),
		readEnv: () => readText(envPath),
		writeModels: (content) => writeText(modelsPath, content),
		writeEnv: (content) => writeText(envPath, content),
	};
	try {
		await body(fixture);
	} finally {
		await rm(dir, { recursive: true, force: true });
		for (const key of ENV_AGENT_DIR_KEYS) {
			const prev = previousEnv.get(key);
			if (prev === undefined) delete process.env[key];
			else process.env[key] = prev;
		}
	}
}

export async function snapshotFromDisk(fixture: ModelsConfigFixture): Promise<ModelsConfigSnapshot> {
	return fixture.store.snapshot();
}

async function readText(path: string): Promise<string> {
	try {
		return await readFile(path, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
		throw error;
	}
}

async function writeText(path: string, content: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, content, "utf8");
}

export const __resetFixtureEnvKeys = (): void => {
	for (const key of ENV_AGENT_DIR_KEYS) previousEnv.delete(key);
};

beforeEach(__resetFixtureEnvKeys);
afterEach(__resetFixtureEnvKeys);