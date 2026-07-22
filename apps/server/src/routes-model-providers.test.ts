import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createModelProvidersRoutes } from "./routes-model-providers.ts";
import { ModelRegistry } from "@oh-my-pi/pi-coding-agent";

const ENV_AGENT_DIR_KEYS = ["OMP_AGENT_DIR", "PI_CODING_AGENT_DIR", "PI_CODING_AGENT_DIR_ACTIVE"] as const;
const previousEnv = new Map<(typeof ENV_AGENT_DIR_KEYS)[number] | "PATH", string | undefined>();

async function withTempAgentDir(body: (dir: string) => Promise<void>): Promise<void> {
	for (const key of ENV_AGENT_DIR_KEYS) previousEnv.set(key, process.env[key]);
	const dir = await mkdtemp(join(tmpdir(), "omp-deck-mp-routes-"));
	process.env.PI_CODING_AGENT_DIR = dir;
	process.env.PI_CODING_AGENT_DIR_ACTIVE = dir;
	process.env.OMP_AGENT_DIR = dir;
	const { refreshDirsFromEnv } = await import("@oh-my-pi/pi-utils");
	refreshDirsFromEnv();
	try {
		await body(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
		for (const key of ENV_AGENT_DIR_KEYS) {
			const prev = previousEnv.get(key);
			if (prev === undefined) delete process.env[key];
			else process.env[key] = prev;
		}
		refreshDirsFromEnv();
	}
}

describe("Model providers REST", () => {
	beforeEach(() => {
		mock.module("./auth-singleton.ts", () => ({
			getDeckModelRegistry: async () => ({
				getAvailable: () => [],
				getAll: () => [],
				getProviderDiscoveryState: () => undefined,
				refresh: async () => undefined,
				refreshProvider: async () => undefined,
				authStorage: { hasAuth: () => false, hasOAuth: () => false },
			}),
		}));
	});
	afterEach(() => {
		mock.restore();
	});

	test("GET /model-providers/ returns redacted inventory + compatibility info", async () => {
		await withTempAgentDir(async () => {
			const routes = createModelProvidersRoutes();
			const response = await routes.router.request("/");
			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				revision: string;
				providers: Array<{ id: string; layers: string[] }>;
				addable: Array<{ id: string }>;
				compatibility: { apis: string[]; secretSentinel: string };
			};
			expect(body.revision.length).toBeGreaterThan(0);
			expect(Array.isArray(body.providers)).toBe(true);
			expect(body.compatibility.apis).toContain("openai-completions");
			expect(body.compatibility.secretSentinel).toBe("__OMP_DECK_SECRET__");
			expect(body.addable.some((entry) => entry.id === "custom")).toBe(true);
		});
	});

	test("PUT /:id creates a provider and persists only the managed env reference", async () => {
		await withTempAgentDir(async (dir) => {
			const routes = createModelProvidersRoutes();
			const list = await routes.router.request("/");
			const { revision } = (await list.json()) as { revision: string };

			const fakeKey = "sk-test-credential-1234";
			const put = await routes.router.request(`/alpha`, {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					revision,
					definition: { baseUrl: "https://api.alpha.test/v1", api: "openai-completions" },
					credential: { action: "set", value: fakeKey },
				}),
			});
			expect(put.status).toBe(200);
			const body = (await put.json()) as {
				provider: { id: string; credential: { source: string; managed: boolean; configured: boolean } };
				providers: Array<{ id: string }>;
			};
			expect(body.provider.id).toBe("alpha");
			expect(body.provider.credential.source).toBe("managed-env");
			expect(body.provider.credential.managed).toBe(true);
			expect(body.provider.credential.configured).toBe(true);
			expect(JSON.stringify(body)).not.toContain(fakeKey);

			const env = await Bun.file(join(dir, ".env")).text();
			expect(env).toContain(fakeKey);
			const modelsYml = await Bun.file(join(dir, "models.yml")).text();
			expect(modelsYml).not.toContain(fakeKey);
		});
	});

	test("Stale revision returns 409 with the latest revision metadata", async () => {
		await withTempAgentDir(async () => {
			const routes = createModelProvidersRoutes();
			const list = await routes.router.request("/");
			const { revision } = (await list.json()) as { revision: string };
			const put = await routes.router.request(`/alpha`, {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					revision,
					definition: { baseUrl: "https://api.alpha.test/v1", api: "openai-completions" },
				}),
			});
			expect(put.status).toBe(200);
			const stale = await routes.router.request(`/alpha`, {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					revision,
					definition: { baseUrl: "https://api.alpha.test/v2", api: "openai-completions" },
				}),
			});
			expect(stale.status).toBe(409);
			const conflict = (await stale.json()) as { error: string; revision: string };
			expect(conflict.error).toBe("revision-conflict");
			expect(conflict.revision).not.toBe(revision);
		});
	});

	test("Invalid provider schema returns 400 with field-addressable issues", async () => {
		await withTempAgentDir(async () => {
			const routes = createModelProvidersRoutes();
			const list = await routes.router.request("/");
			const { revision } = (await list.json()) as { revision: string };
			const put = await routes.router.request(`/alpha`, {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					revision,
					definition: { baseUrl: "https://api.alpha.test/v1", api: "bogus-api" },
				}),
			});
			expect(put.status).toBe(400);
			const body = (await put.json()) as { error: string; issues: Array<{ path: string }> };
			expect(body.error).toBe("validation");
			expect(body.issues.length).toBeGreaterThan(0);
		});
	});

	test("DELETE /:id removes the provider and clears its managed env reference", async () => {
		await withTempAgentDir(async (dir) => {
			const routes = createModelProvidersRoutes();
			const list = await routes.router.request("/");
			const { revision } = (await list.json()) as { revision: string };
			await routes.router.request(`/alpha`, {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					revision,
					definition: { baseUrl: "https://api.alpha.test/v1", api: "openai-completions" },
					credential: { action: "set", value: "primary-key" },
				}),
			});

			const afterPut = await routes.router.request("/");
			const revisionAfter = (await afterPut.json()) as { revision: string };
			const del = await routes.router.request(`/alpha`, {
				method: "DELETE",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ revision: revisionAfter.revision, confirm: true }),
			});
			expect(del.status).toBe(200);
			const env = await Bun.file(join(dir, ".env")).text();
			expect(env).not.toContain("primary-key");
			const yaml = await Bun.file(join(dir, "models.yml")).text();
			expect(yaml).not.toContain("alpha:");
		});
	});

	test("Extension-owned provider is reported as read-only legacy", async () => {
		await withTempAgentDir(async (dir) => {
			const extDir = join(dir, "extensions", "ccswitch-bravo");
			await mkdir(extDir, { recursive: true });
			await writeFile(
				join(extDir, "index.ts"),
				`// omp-deck cc-switch import\nccswitch_bravo(pi) { pi.registerProvider("ccswitch-bravo", {}); }\n`,
				"utf8",
			);
			const routes = createModelProvidersRoutes();
			const response = await routes.router.request("/");
			const body = (await response.json()) as {
				providers: Array<{ id: string; layers: string[]; health: string; legacy?: { status: string } }>;
			};
			const legacy = body.providers.find((entry) => entry.id === "ccswitch-bravo");
			expect(legacy).toBeDefined();
			expect(legacy?.layers).toContain("extension");
			expect(legacy?.health).toBe("legacy");
			expect(legacy?.legacy?.status).toBe("active");
		});
	});

	test("Stored API key never appears in any response payload, log, or models.yml", async () => {
		await withTempAgentDir(async (dir) => {
			const routes = createModelProvidersRoutes();
			const list = await routes.router.request("/");
			const { revision } = (await list.json()) as { revision: string };
			const fakeKey = "sk-strict-redaction-99";
			await routes.router.request(`/alpha`, {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					revision,
					definition: { baseUrl: "https://api.alpha.test/v1", api: "openai-completions" },
					credential: { action: "set", value: fakeKey },
				}),
			});

			const listAgain = await routes.router.request("/");
			const inventoryJson = JSON.stringify(await listAgain.json());
			expect(inventoryJson).not.toContain(fakeKey);

			const yaml = await Bun.file(join(dir, "models.yml")).text();
			expect(yaml).not.toContain(fakeKey);
		});
	});

	test("Probe and discover response payloads never echo the saved credential", async () => {
		await withTempAgentDir(async (dir) => {
			const routes = createModelProvidersRoutes();
			const list = await routes.router.request("/");
			const { revision } = (await list.json()) as { revision: string };
			const fakeKey = "sk-probe-secret-42";
			await routes.router.request(`/alpha`, {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					revision,
					definition: { baseUrl: "https://api.alpha.test/v1", api: "openai-completions" },
					credential: { action: "set", value: fakeKey },
				}),
			});
			const probe = await routes.router.request(`/probe`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ providerId: "alpha" }),
			});
			const probeBody = JSON.stringify(await probe.json());
			expect(probeBody).not.toContain(fakeKey);

			const discover = await routes.router.request(`/discover`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ providerId: "alpha" }),
			});
			const discoverBody = JSON.stringify(await discover.json());
			expect(discoverBody).not.toContain(fakeKey);
		});
	});
});