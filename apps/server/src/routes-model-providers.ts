import { Hono } from "hono";

import {
	CommitProviderImportRequest,
	DeleteModelProviderRequest,
	DiscoverModelsRequest,
	ModelProviderCompatibility,
	ModelProviderRecord,
	PreviewProviderImportRequest,
	ProbeProviderRequest,
	PutModelProviderRequest,
	type ListModelProvidersResponse,
	type ModelProviderMutationResponse,
} from "@omp-deck/protocol";

import { ModelsConfigSchema } from "@oh-my-pi/pi-coding-agent/config/models-config-schema";
import type { ModelRegistry } from "@oh-my-pi/pi-coding-agent";

import { getDeckModelRegistry } from "./auth-singleton.ts";
import { broadcastBus } from "./broadcast-bus.ts";
import { modelProviderCompatibility, MODEL_PROVIDER_APIS, validateModelProviderId } from "./model-provider-compat.ts";
import { buildInventory, providerInventoryContext, type ProviderInventoryContext } from "./model-provider-inventory.ts";
import { ModelsConfigStore, ModelsConfigStoreError, ModelsRevisionConflictError } from "./models-config-store.ts";
import { ProviderDiscoveryService } from "./provider-discovery.ts";
import { ProviderProbeService } from "./provider-probe.ts";
import { logger } from "./log.ts";

const log = logger("routes-model-providers");

interface ModelProvidersRouteDeps {
	ctx: ProviderInventoryContext;
	store: ModelsConfigStore;
}

export interface ModelProvidersRoutes {
	router: Hono;
	invalidate: () => void;
}

export function buildModelProvidersRouter(deps: ModelProvidersRouteDeps): ModelProvidersRoutes {
	const router = new Hono();
	let cachedRevision = "";

	async function list(): Promise<{
		body: ListModelProvidersResponse;
		refreshRegistry: () => Promise<void>;
	}> {
		const compatibility: ModelProviderCompatibility = modelProviderCompatibility();
		let registry: ModelRegistry | undefined;
		try {
			registry = await getDeckModelRegistry();
		} catch {
			registry = undefined;
		}
		const inventory = await buildInventory({ store: deps.store, ctx: deps.ctx, registry });
		cachedRevision = inventory.revision;
		const body: ListModelProvidersResponse = {
			revision: inventory.revision,
			paths: { models: deps.ctx.modelsPath, env: deps.ctx.envPath },
			providers: inventory.providers,
			addable: inventory.addable,
			compatibility,
		};
		return { body, refreshRegistry: () => registry?.refresh("offline") ?? Promise.resolve() };
	}

	router.get("/", async (c) => {
		const { body } = await list();
		c.header("cache-control", "no-store");
		return c.json(body);
	});

	router.put("/:id", async (c) => {
		const id = c.req.param("id");
		const targetId = validateModelProviderId(id);
		let body: PutModelProviderRequest;
		try {
			body = (await c.req.json()) as PutModelProviderRequest;
		} catch {
			return c.json({ error: "invalid json body" }, 400);
		}
		if (!body.definition || typeof body.definition !== "object") {
			return c.json({ error: "definition is required" }, 400);
		}
		validateSchemaForProvider(targetId, body.definition);
		try {
			const { receipt } = await deps.store.commit({
				revision: body.revision,
				puts: [{ id: targetId, definition: body.definition, ...(body.credential ? { credential: body.credential } : {}) }],
			});
			const { body: snapshot } = await list();
			await applyReceiptToRegistry(receipt);
			broadcastBus.broadcast({ type: "models_changed" });
			const provider = snapshot.providers.find((entry) => entry.id === targetId);
			if (!provider) return c.json({ error: "Provider vanished after commit" }, 500);
			const response: ModelProviderMutationResponse = { ...snapshot, provider };
			return c.json(response);
		} catch (error) {
			return translateError(c, error);
		}
	});

	router.delete("/:id", async (c) => {
		let body: DeleteModelProviderRequest;
		try {
			body = (await c.req.json()) as DeleteModelProviderRequest;
		} catch {
			return c.json({ error: "invalid json body" }, 400);
		}
		if (!body.confirm) {
			return c.json({ error: "confirm: true is required" }, 400);
		}
		const id = validateModelProviderId(c.req.param("id"));
		try {
			const { receipt } = await deps.store.commit({ revision: body.revision, deletes: [id] });
			await applyReceiptToRegistry(receipt);
			broadcastBus.broadcast({ type: "models_changed" });
			const { body: snapshot } = await list();
			return c.json(snapshot);
		} catch (error) {
			return translateError(c, error);
		}
	});

	router.post("/discover", async (c) => {
		let body: DiscoverModelsRequest;
		try {
			body = (await c.req.json()) as DiscoverModelsRequest;
		} catch {
			return c.json({ error: "invalid json body" }, 400);
		}
		const compatibility = modelProviderCompatibility();
		const registry = await getDeckModelRegistry().catch(() => undefined);
		const service = new ProviderDiscoveryService({ store: deps.store, registry, compatibility });
		try {
			return c.json(await service.discover(body));
		} catch (error) {
			return translateError(c, error);
		}
	});

	router.post("/probe", async (c) => {
		let body: ProbeProviderRequest;
		try {
			body = (await c.req.json()) as ProbeProviderRequest;
		} catch {
			return c.json({ error: "invalid json body" }, 400);
		}
		const service = new ProviderProbeService({ store: deps.store });
		try {
			return c.json(await service.probe(body));
		} catch (error) {
			return translateError(c, error);
		}
	});

	router.post("/:id/refresh", async (c) => {
		const id = validateModelProviderId(c.req.param("id"));
		const registry = await getDeckModelRegistry().catch(() => undefined);
		if (!registry) return c.json({ error: "registry unavailable" }, 503);
		await registry.refreshProvider(id, "online");
		const discovery = registry.getProviderDiscoveryState(id);
		const available = registry.getAll().filter((model) => model.provider === id).length;
		return c.json({
			providerId: id,
			modelCount: available,
			...(discovery
				? {
						discovery: {
							status: discovery.status,
							optional: discovery.optional,
							stale: discovery.stale,
							modelIds: discovery.models,
							...(discovery.fetchedAt ? { fetchedAt: discovery.fetchedAt } : {}),
							...(discovery.error ? { error: discovery.error } : {}),
						},
					}
				: {}),
		});
	});

	return {
		router,
		invalidate: () => {
			cachedRevision = "";
		},
	};
}

async function applyReceiptToRegistry(receipt: { before: { models: string; env: string }; after: { models: string; env: string } }): Promise<void> {
	if (receipt.before.models === receipt.after.models && receipt.before.env === receipt.after.env) return;
	const registry = await getDeckModelRegistry().catch(() => undefined);
	if (!registry) return;
	try {
		await registry.refresh("offline");
	} catch (error) {
		log.warn("registry refresh after commit failed", error);
	}
}

function validateSchemaForProvider(id: string, definition: Record<string, unknown>): void {
	try {
		ModelsConfigSchema({ providers: { [id]: definition } });
	} catch (error) {
		throw new ModelsConfigStoreError(
			error instanceof Error ? sanitizeSchemaMessage(error.message) : "Invalid provider definition",
			[{ path: "providers." + id, message: error instanceof Error ? sanitizeSchemaMessage(error.message) : "invalid" }],
		);
	}
}

function sanitizeSchemaMessage(message: string): string {
	return message
		.replace(/^TraversalError:\s*/, "")
		.split("\n")[0]!
		.trim();
}

function translateError(c: { json: (value: unknown, status?: number) => Response }, error: unknown): Response {
	if (error instanceof ModelsRevisionConflictError) {
		return c.json({ error: "revision-conflict", message: error.message, revision: error.revision }, 409);
	}
	if (error instanceof ModelsConfigStoreError) {
		const body = { error: "validation", message: error.message, issues: error.issues };
		return c.json(body, 400);
	}
	const message = error instanceof Error ? error.message : "request failed";
	return c.json({ error: "internal", message }, 500);
}

export function createModelProvidersRoutes(): ModelProvidersRoutes {
	const ctx = providerInventoryContext();
	return buildModelProvidersRouter({ ctx, store: new ModelsConfigStore({ agentDir: ctx.agentDir }) });
}

void MODEL_PROVIDER_APIS; // keep reference for IDE symbol lookup