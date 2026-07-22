import { Hono } from "hono";
import { join } from "node:path";

import type {
	CommitProviderImportRequest,
	MigrateLegacyProviderRequest,
	PreviewProviderImportRequest,
	RollbackLegacyProviderRequest,
} from "@omp-deck/protocol";

import { broadcastBus } from "./broadcast-bus.ts";
import { ModelsConfigStore, ModelsConfigStoreError } from "./models-config-store.ts";
import { ProviderImportService } from "./provider-import.ts";
import { getAgentDir } from "@oh-my-pi/pi-utils";

interface ProviderImportRoutesOptions {
	agentDir?: string;
}

export function buildProviderImportRoutes(options: ProviderImportRoutesOptions = {}): Hono {
	const router = new Hono();
	const agentDir = options.agentDir ?? getAgentDir();
	const service = new ProviderImportService({
		store: new ModelsConfigStore({ agentDir }),
		agentDir,
	});

	router.get("/imports", async (c) => {
		try {
			const response = await service.scan();
			return c.json(response);
		} catch (error) {
			return translateError(c, error);
		}
	});

	router.post("/imports/preview", async (c) => {
		let body: PreviewProviderImportRequest;
		try {
			body = (await c.req.json()) as PreviewProviderImportRequest;
		} catch {
			return c.json({ error: "invalid json body" }, 400);
		}
		try {
			const response = await service.preview(body);
			return c.json(response);
		} catch (error) {
			return translateError(c, error);
		}
	});

	router.post("/imports/commit", async (c) => {
		let body: CommitProviderImportRequest;
		try {
			body = (await c.req.json()) as CommitProviderImportRequest;
		} catch {
			return c.json({ error: "invalid json body" }, 400);
		}
		try {
			const response = await service.commit(body);
			broadcastBus.broadcast({ type: "models_changed" });
			return c.json(response);
		} catch (error) {
			return translateError(c, error);
		}
	});

	router.post("/legacy/migrate", async (c) => {
		let body: MigrateLegacyProviderRequest;
		try {
			body = (await c.req.json()) as MigrateLegacyProviderRequest;
		} catch {
			return c.json({ error: "invalid json body" }, 400);
		}
		try {
			const response = await service.migrate(body);
			broadcastBus.broadcast({ type: "models_changed" });
			return c.json(response);
		} catch (error) {
			return translateError(c, error);
		}
	});

	router.post("/legacy/rollback", async (c) => {
		let body: RollbackLegacyProviderRequest;
		try {
			body = (await c.req.json()) as RollbackLegacyProviderRequest;
		} catch {
			return c.json({ error: "invalid json body" }, 400);
		}
		try {
			const response = await service.rollback(body);
			broadcastBus.broadcast({ type: "models_changed" });
			return c.json(response);
		} catch (error) {
			return translateError(c, error);
		}
	});

	router.get("/legacy/discover", async (c) => {
		const extensionsRoot = join(agentDir, "extensions");
		const disabledRoot = join(agentDir, "disabled-extensions");
		const found: Array<{ id: string; location: string }> = [];
		try {
			const list = await readdirSafe(extensionsRoot);
			for (const entry of list) {
				if (!/^ccswitch-.+$/.test(entry)) continue;
				found.push({ id: entry, location: "active" });
			}
		} catch {
			// extensions root not yet created — that's fine
		}
		try {
			const list = await readdirSafe(disabledRoot);
			for (const entry of list) {
				if (!/^ccswitch-.+$/.test(entry)) continue;
				found.push({ id: entry, location: "disabled" });
			}
		} catch {
			// ignore
		}
		return c.json({ extensions: found });
	});

	return router;
}

async function readdirSafe(path: string): Promise<string[]> {
	const { readdir } = await import("node:fs/promises");
	return readdir(path);
}

function translateError(c: { json: (value: unknown, status?: number) => Response }, error: unknown): Response {
	if (error instanceof ModelsConfigStoreError) {
		const status = /conflict|revision/i.test(error.message) ? 409 : 400;
		return c.json({ error: "import-error", message: error.message, issues: error.issues }, status);
	}
	return c.json({ error: "internal", message: error instanceof Error ? error.message : "error" }, 500);
}
