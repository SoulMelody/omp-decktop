/**
 * cc-switch import routes.
 *
 * - GET  /providers  — list all providers from the cc-switch SQLite DB
 * - POST /import     — write selected providers as omp SDK extensions
 *
 * The cc-switch DB path defaults to `~/.cc-switch/cc-switch.db` and can
 * be overridden via `CC_SWITCH_DB_PATH` env or per-request `dbPath` body field.
 */

import { Hono } from "hono";
import { existsSync } from "node:fs";

import type {
	CcSwitchImportRequest,
	CcSwitchImportResponse,
	CcSwitchImportResultEntry,
	CcSwitchListResponse,
} from "@omp-deck/protocol";

import {
	readCcSwitchProviders,
	resolveCcSwitchDbPath,
	writeCcSwitchExtension,
} from "./cc-switch-import.ts";
import { broadcastBus } from "./broadcast-bus.ts";
import { logger } from "./log.ts";

const log = logger("routes-ccswitch");

export function buildCcSwitchRouter(): Hono {
	const app = new Hono();

	// ── GET /providers ──────────────────────────────────────────────────────
	app.get("/providers", (c) => {
		const dbPath = resolveCcSwitchDbPath();

		if (!existsSync(dbPath)) {
			const body: CcSwitchListResponse = {
				dbPath,
				accessible: false,
				providers: [],
				error: `cc-switch database not found at: ${dbPath}`,
			};
			return c.json(body);
		}

		try {
			const providers = readCcSwitchProviders(dbPath);
			const body: CcSwitchListResponse = {
				dbPath,
				accessible: true,
				providers,
			};
			return c.json(body);
		} catch (err) {
			const body: CcSwitchListResponse = {
				dbPath,
				accessible: false,
				providers: [],
				error: String(err),
			};
			return c.json(body, 500);
		}
	});

	// ── POST /import ────────────────────────────────────────────────────────
	app.post("/import", async (c) => {
		let req: CcSwitchImportRequest;
		try {
			req = (await c.req.json()) as CcSwitchImportRequest;
		} catch {
			return c.json({ error: "invalid json body" }, 400);
		}

		if (!Array.isArray(req.providerKeys) || req.providerKeys.length === 0) {
			return c.json({ error: "providerKeys must be a non-empty array" }, 400);
		}

		const dbPath = req.dbPath || resolveCcSwitchDbPath();
		if (!existsSync(dbPath)) {
			return c.json({ error: `cc-switch database not found at: ${dbPath}` }, 404);
		}

		let allProviders;
		try {
			allProviders = readCcSwitchProviders(dbPath);
		} catch (err) {
			return c.json({ error: String(err) }, 500);
		}

		// Build lookup by composite key: "id|appType"
		const byKey = new Map(allProviders.map((p) => [`${p.id}|${p.appType}`, p]));
		// Also allow lookup by just id (for de-duplicated entries)
		const byId = new Map(allProviders.map((p) => [p.id, p]));

		const results: CcSwitchImportResultEntry[] = [];
		let okCount = 0;
		let errorCount = 0;

		for (const key of req.providerKeys) {
			const provider = byKey.get(key) ?? byId.get(key);
			if (!provider) {
				results.push({ key, name: key, status: "error", error: "provider not found in DB" });
				errorCount++;
				continue;
			}

			if (!provider.apiType) {
				results.push({
					key,
					name: provider.name,
					status: "error",
					error: `unsupported apiFormat: ${String(provider.meta.apiFormat ?? "unknown")}`,
				});
				errorCount++;
				continue;
			}

			try {
				const extDir = await writeCcSwitchExtension(provider);
				results.push({ key, name: provider.name, status: "ok", extensionDir: extDir });
				okCount++;
				log.info(`imported cc-switch provider "${provider.name}" → ${extDir}`);
			} catch (err) {
				results.push({ key, name: provider.name, status: "error", error: String(err) });
				errorCount++;
				log.error(`failed to import cc-switch provider "${provider.name}"`, err);
			}
		}

		// Notify connected clients that new models may be available.
		if (okCount > 0) {
			broadcastBus.broadcast({ type: "models_changed" });
		}

		const body: CcSwitchImportResponse = {
			imported: results,
			okCount,
			errorCount,
		};
		return c.json(body);
	});

	return app;
}
