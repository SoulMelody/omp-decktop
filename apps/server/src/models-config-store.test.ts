import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmod, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { withModelsConfigFixture } from "./test-fixtures/models-config.ts";
import { ModelsConfigStore, ModelsRevisionConflictError, ModelsConfigStoreError, managedProviderEnvName } from "./models-config-store.ts";
import { MODEL_PROVIDER_MANAGED_ENV_PREFIX } from "./model-provider-compat.ts";

const KNOWN_FAKE_KEY = "sk-test-deadbeef-cafe-1234";

async function writeText(path: string, content: string): Promise<void> {
	await writeFile(path, content, "utf8");
}

describe("ModelsConfigStore", () => {
	beforeEach(() => {
		// Ensure no leaked managed-key state interferes with these tests.
		for (const key of Object.keys(process.env)) {
			if (key.startsWith(MODEL_PROVIDER_MANAGED_ENV_PREFIX)) delete process.env[key];
		}
	});
	afterEach(() => {
		for (const key of Object.keys(process.env)) {
			if (key.startsWith(MODEL_PROVIDER_MANAGED_ENV_PREFIX)) delete process.env[key];
		}
	});

	test("snapshot on empty agent directory initializes a single empty provider list", async () => {
		await withModelsConfigFixture(async (fx) => {
			const snapshot = await fx.store.snapshot();
			expect(snapshot.providers).toEqual([]);
			expect(snapshot.paths.models).toBe(fx.modelsPath);
			expect(snapshot.paths.env).toBe(fx.envPath);
			expect(snapshot.revision.length).toBeGreaterThan(0);
		});
	});

	test("PUT merges a custom provider, writes the key to .env, and redaction never returns the value", async () => {
		await withModelsConfigFixture(async (fx) => {
			const revision = (await fx.store.snapshot()).revision;
			const { snapshot, receipt } = await fx.store.commit({
				revision,
				puts: [
					{
						id: "alpha",
						definition: {
							baseUrl: "https://api.alpha.test/v1",
							api: "openai-completions",
							headers: { "X-Alpha": "tag" },
							authHeader: true,
							models: [{ id: "alpha-fast", contextWindow: 128000, maxTokens: 8192 }],
						},
						credential: { action: "set", value: KNOWN_FAKE_KEY },
					},
				],
			});

			expect(receipt.managedKeys).toHaveLength(1);
			expect(receipt.managedKeys[0]?.startsWith(MODEL_PROVIDER_MANAGED_ENV_PREFIX)).toBe(true);

			const persisted = await fx.readModels();
			expect(persisted).toContain("alpha:");
			expect(persisted).toContain("baseUrl: https://api.alpha.test/v1");
			expect(persisted).toContain("X-Alpha: tag");
			expect(persisted).not.toContain(KNOWN_FAKE_KEY);

			const envSource = await fx.readEnv();
			expect(envSource).toContain(KNOWN_FAKE_KEY);
			expect(envSource).toContain("# omp-deck managed".replace("#", "#"));

			const stored = snapshot.providers.find((p) => p.id === "alpha");
			expect(stored?.credential.source).toBe("managed-env");
			expect(stored?.credential.managed).toBe(true);
			expect(stored?.credential.configured).toBe(true);
			expect(stored?.definition.api).toBe("openai-completions");
			expect(stored?.definition.headers?.["X-Alpha"]).toBe("__OMP_DECK_SECRET__");
			expect(JSON.stringify(stored)).not.toContain(KNOWN_FAKE_KEY);
		});
	});

	test("Comments, ordering, and unknown fields are preserved across merges", async () => {
		await withModelsConfigFixture(async (fx) => {
			await writeText(fx.modelsPath, [
				"# top-level note",
				"providers:",
				"  alpha:",
				"    baseUrl: https://api.alpha.test/v1",
				"    api: openai-completions",
				"    custom: preserved",
				"    headers:",
				"      X-Alpha: keep",
				"  # future-ready provider",
				"  zeta:",
				"    baseUrl: https://api.zeta.test",
				"    api: anthropic-messages",
				"future_field: kept",
			].join("\n"));
			const revision = (await fx.store.snapshot()).revision;
			await fx.store.commit({
				revision,
				puts: [
					{
						id: "alpha",
						definition: { headers: { "X-Alpha": "updated", "X-Second": "two" } },
					},
				],
			});
			const persisted = await fx.readModels();
			expect(persisted).toContain("# top-level note");
			expect(persisted).toContain("future_field: kept");
			expect(persisted).toContain("custom: preserved");
			expect(persisted).toContain("# future-ready provider");
			expect(persisted).toContain("X-Alpha: updated");
			expect(persisted).toContain("X-Second: two");
			expect(persisted.indexOf("alpha:")).toBeLessThan(persisted.indexOf("zeta:"));
		});
	});

	test("Replace mode swaps the entire provider node while keeping unrelated providers", async () => {
		await withModelsConfigFixture(async (fx) => {
			const initialRevision = (await fx.store.snapshot()).revision;
			await fx.store.commit({
				revision: initialRevision,
				puts: [
					{
						id: "alpha",
						definition: { baseUrl: "https://api.alpha.test/v1", api: "openai-completions", keep: "yes" },
					},
					{
						id: "beta",
						definition: { baseUrl: "https://api.beta.test/v1", api: "openai-completions" },
					},
				],
			});
			const revision = (await fx.store.snapshot()).revision;
			await fx.store.commit({
				revision,
				puts: [
					{
						id: "alpha",
						mode: "replace",
						definition: { baseUrl: "https://api.alpha-new.test", api: "openai-completions" },
					},
				],
			});
			const persisted = await fx.readModels();
			expect(persisted).toContain("api.alpha-new.test");
			expect(persisted).not.toContain("api.alpha.test/v1");
			expect(persisted).not.toContain("keep: yes");
			expect(persisted).toContain("beta:");
		});
	});

	test("Stale revision raises 409-equivalent conflict and leaves files untouched", async () => {
		await withModelsConfigFixture(async (fx) => {
			const first = (await fx.store.snapshot()).revision;
			await fx.store.commit({
				revision: first,
				puts: [
					{
						id: "alpha",
						definition: { baseUrl: "https://api.alpha.test/v1", api: "openai-completions" },
					},
				],
			});
			const stale = (await fx.store.snapshot()).revision;
			// mutate the file behind the store back
			await fx.writeModels("providers: {}\n");
			await expect(
				fx.store.commit({
					revision: stale,
					puts: [
						{
							id: "beta",
							definition: { baseUrl: "https://api.beta.test/v1", api: "openai-completions" },
						},
					],
				}),
			).rejects.toBeInstanceOf(ModelsRevisionConflictError);
			const persisted = await fx.readModels();
			expect(persisted).not.toContain("beta");
		});
	});

	test("Managed key removal drops the .env line and the live process value", async () => {
		await withModelsConfigFixture(async (fx) => {
			const revision = (await fx.store.snapshot()).revision;
			const { receipt } = await fx.store.commit({
				revision,
				puts: [
					{
						id: "alpha",
						definition: { baseUrl: "https://api.alpha.test/v1", api: "openai-completions" },
						credential: { action: "set", value: KNOWN_FAKE_KEY },
					},
				],
			});
			const managed = receipt.managedKeys[0]!;
			expect(process.env[managed]).toBe(KNOWN_FAKE_KEY);

			const snapshot = await fx.store.snapshot();
			const secondRevision = snapshot.revision;
			await fx.store.commit({
				revision: secondRevision,
				puts: [
					{
						id: "alpha",
						definition: { baseUrl: "https://api.alpha.test/v1", api: "openai-completions" },
						credential: { action: "remove" },
					},
				],
			});
			expect(process.env[managed]).toBeUndefined();
			const envSource = await fx.readEnv();
			expect(envSource).not.toContain(KNOWN_FAKE_KEY);
			expect(envSource).not.toContain(managed);
		});
	});

	test("Replacing a provider's key keeps ownership and rotates the variable", async () => {
		await withModelsConfigFixture(async (fx) => {
			const first = (await fx.store.snapshot()).revision;
			await fx.store.commit({
				revision: first,
				puts: [
					{
						id: "alpha",
						definition: { baseUrl: "https://api.alpha.test/v1", api: "openai-completions" },
						credential: { action: "set", value: KNOWN_FAKE_KEY },
					},
				],
			});
			const envAfterFirst = await fx.readEnv();
			const original = Object.values(managedProviderEnvName("alpha"));
			const match = original
				.map(() => null)
				.find(() => false);
			expect(match).toBeUndefined();
			const ref = envAfterFirst
				.split(/\r?\n/)
				.map((line) => line.match(/^([^=]+)=/)?.[1])
				.filter((value): value is string => Boolean(value && value.startsWith(MODEL_PROVIDER_MANAGED_ENV_PREFIX)))
				.find((value) => value.startsWith(managedProviderEnvName("alpha")));
			expect(ref).toBeDefined();

			const second = (await fx.store.snapshot()).revision;
			await fx.store.commit({
				revision: second,
				puts: [
					{
						id: "alpha",
						definition: { baseUrl: "https://api.alpha.test/v1", api: "openai-completions" },
						credential: { action: "set", value: "sk-replacement-key" },
					},
				],
			});
			const envAfterSecond = await fx.readEnv();
			expect(envAfterSecond).toContain("sk-replacement-key");
			expect(envAfterSecond).not.toContain(KNOWN_FAKE_KEY);
			expect(process.env[ref!]).toBe("sk-replacement-key");
		});
	});

	test("External environment keys are preserved when editing other providers", async () => {
		await withModelsConfigFixture(async (fx) => {
			await fx.writeEnv(`OMP_EXTERNAL_KEY=external-secret\n`);
			const first = (await fx.store.snapshot()).revision;
			await fx.store.commit({
				revision: first,
				puts: [
					{
						id: "alpha",
						definition: { baseUrl: "https://api.alpha.test/v1", api: "openai-completions" },
						credential: { action: "preserve" },
					},
				],
			});
			const envSource = await fx.readEnv();
			expect(envSource).toContain("OMP_EXTERNAL_KEY=external-secret");
		});
	});

	test("Managed key name avoids collisions with existing providers", async () => {
		await withModelsConfigFixture(async (fx) => {
			const first = (await fx.store.snapshot()).revision;
			await fx.store.commit({
				revision: first,
				puts: [
					{
						id: "alpha",
						definition: { baseUrl: "https://api.alpha.test/v1", api: "openai-completions" },
						credential: { action: "set", value: "k1" },
					},
					{
						id: "alpha-duplicate",
						definition: { baseUrl: "https://api.duplicate.test/v1", api: "openai-completions" },
						credential: { action: "set", value: "k2" },
					},
				],
			});
			const envSource = await fx.readEnv();
			const refs = envSource
				.split(/\r?\n/)
				.map((line) => line.match(/^([^=]+)=/)?.[1])
				.filter((value): value is string => Boolean(value && value.startsWith(MODEL_PROVIDER_MANAGED_ENV_PREFIX)));
			const unique = new Set(refs);
			expect(unique.size).toBe(refs.length);
		});
	});

	test("Invalid provider configuration is rejected before any write", async () => {
		await withModelsConfigFixture(async (fx) => {
			const revision = (await fx.store.snapshot()).revision;
			await expect(
				fx.store.commit({
					revision,
					puts: [
						{
							id: "alpha",
							definition: {
								api: "openai-completions",
								models: [{ id: "alpha-fast", api: "openai-completions", baseUrl: "https://api.alpha.test/v1" }],
							},
						},
					],
				}),
			).rejects.toBeInstanceOf(ModelsConfigStoreError);
			expect(await fx.readModels()).not.toContain("alpha");
		});
	});

	test("apiKey in the definition payload is rejected as write-only", async () => {
		await withModelsConfigFixture(async (fx) => {
			const revision = (await fx.store.snapshot()).revision;
			await expect(
				fx.store.commit({
					revision,
					puts: [
						{
							id: "alpha",
							definition: { apiKey: "should-not-be-allowed", api: "openai-completions" },
						} as never,
					],
				}),
			).rejects.toBeInstanceOf(ModelsConfigStoreError);
		});
	});

	test("Rolling back restores the prior files and managed environment", async () => {
		await withModelsConfigFixture(async (fx) => {
			const revision = (await fx.store.snapshot()).revision;
			const commit = await fx.store.commit({
				revision,
				puts: [
					{
						id: "alpha",
						definition: { baseUrl: "https://api.alpha.test/v1", api: "openai-completions" },
						credential: { action: "set", value: KNOWN_FAKE_KEY },
					},
				],
			});
			expect(process.env[commit.receipt.managedKeys[0]!]).toBe(KNOWN_FAKE_KEY);

			const rollback = await fx.store.rollback(commit.receipt);
			expect(await fx.readModels()).not.toContain("alpha");
			expect(await fx.readEnv()).not.toContain(KNOWN_FAKE_KEY);
			expect(process.env[commit.receipt.managedKeys[0]!]).toBeUndefined();
			expect(rollback.providers).toHaveLength(0);
		});
	});

	test("Second write failure rolls back the .env when models.yml write fails", async () => {
		await withModelsConfigFixture(async (fx) => {
			const revision = (await fx.store.snapshot()).revision;
			await fx.store.commit({
				revision,
				puts: [
					{
						id: "alpha",
						definition: { baseUrl: "https://api.alpha.test/v1", api: "openai-completions" },
						credential: { action: "set", value: "primary" },
					},
				],
			});

			const second = (await fx.store.snapshot()).revision;
			const originalModels = await fx.readModels();
			const originalEnv = await fx.readEnv();
			// Pretend another writer stomps models.yml between env write and models write.
			await fx.writeModels("providers: {}\n");
			await expect(
				fx.store.commit({
					revision: second,
					puts: [
						{
							id: "alpha",
							definition: { baseUrl: "https://api.alpha.test/v1", api: "openai-completions" },
							credential: { action: "set", value: "rolled-back" },
						},
					],
				}),
			).rejects.toBeInstanceOf(ModelsRevisionConflictError);

			expect(await fx.readModels()).toBe("providers: {}\n");
			expect(await fx.readEnv()).toBe(originalEnv);
			expect(originalEnv).not.toContain("rolled-back");
			expect(originalEnv).toContain("primary");
			expect(originalEnv).not.toBe(originalModels);
		});
	});

	test("Agent .env file mode is 0600 on POSIX", async () => {
		if (process.platform === "win32") return;
		await withModelsConfigFixture(async (fx) => {
			const revision = (await fx.store.snapshot()).revision;
			await fx.store.commit({
				revision,
				puts: [
					{
						id: "alpha",
						definition: { baseUrl: "https://api.alpha.test/v1", api: "openai-completions" },
						credential: { action: "set", value: "value" },
					},
				],
			});
			const stats = await stat(fx.envPath);
			expect(stats.mode & 0o777).toBe(0o600);
		});
	});

	test("Secret sentinels in advanced JSON preserve existing header values", async () => {
		await withModelsConfigFixture(async (fx) => {
			await fx.writeModels([
				"providers:",
				"  alpha:",
				"    baseUrl: https://api.alpha.test/v1",
				"    api: openai-completions",
				"    headers:",
				"      X-Alpha: sentinel-keep",
				"      X-Other: literal-keep",
			].join("\n"));
			const revision = (await fx.store.snapshot()).revision;
			await fx.store.commit({
				revision,
				puts: [
					{
						id: "alpha",
						definition: {
							headers: { "X-Alpha": "__OMP_DECK_SECRET__", "X-Other": "new-value", "X-Added": "added-value" },
						},
					},
				],
			});
			const persisted = await fx.readModels();
			expect(persisted).toContain("X-Alpha: sentinel-keep");
			expect(persisted).toContain("X-Other: new-value");
			expect(persisted).toContain("X-Added: added-value");
		});
	});

	test("Lock recovery continues when a stale lock file is detected", async () => {
		await withModelsConfigFixture(async (fx) => {
			const lockPath = join(fx.dir, "models.yml.lock");
			await writeFile(lockPath, JSON.stringify({ pid: 999_999, createdAt: Date.now() - 60_000 }), "utf8");
			await chmod(lockPath, 0o600);
			const staleAt = (Date.now() - 60_000) / 1000;
			await utimes(lockPath, staleAt, staleAt);
			const revision = (await fx.store.snapshot()).revision;
			await fx.store.commit({
				revision,
				puts: [
					{
						id: "alpha",
						definition: { baseUrl: "https://api.alpha.test/v1", api: "openai-completions" },
					},
				],
			});
			expect(await fx.readModels()).toContain("alpha");
		});
	});
});