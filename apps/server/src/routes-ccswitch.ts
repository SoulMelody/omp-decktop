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
import { refreshDeckExtensionProviders } from "./auth-singleton.ts";
import { broadcastBus } from "./broadcast-bus.ts";
import { logger } from "./log.ts";

const log = logger("routes-ccswitch");

export function buildCcSwitchRouter(opts: { cwd?: string } = {}): Hono {
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

	// ── POST /import ── RETIRED 410 Gone ── Use POST /api/model-providers/imports/preview then /commit
	app.post("/import", (c) => {
		return c.json(
			{
				error: "endpoint-retired",
				status: 410,
				message: "cc-switch extension generation has been retired; use /api/model-providers/imports/preview and /commit instead.",
				replacement: {
					preview: "POST /api/model-providers/imports/preview",
					commit: "POST /api/model-providers/imports/commit",
				},
			},
			410,
		);
	});

	return app;
}
