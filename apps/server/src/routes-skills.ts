/**
 * /api/skills — skill enumeration + mutation across every omp provider.
 *
 * - `GET /api/skills?cwd=<abs>` lists every skill `loadCapability(skillCapability.id)`
 *   returns, native-first.
 * - `GET /api/skills/:id?cwd=<abs>` returns one skill's body + co-located files.
 *   `id` is the server-issued opaque identifier carried on every list row;
 *   clients never construct it from parts.
 * - `POST /api/skills` — create a new native skill.
 * - `PUT /api/skills/:id` — edit a native skill's SKILL.md body.
 * - `DELETE /api/skills/:id` — delete a native skill's directory.
 * - `POST /api/skills/install` — install a skill from a URL into the native root.
 */

import type { CreateSkillRequest, InstallSkillFromUrlRequest, UpdateSkillRequest } from "@omp-deck/protocol";
import { Hono } from "hono";

import { broadcastBus } from "./broadcast-bus.ts";
import { logger } from "./log.ts";
import type { SkillsService } from "./skills-service.ts";

export function buildSkillsRouter(service: SkillsService): Hono {
	const log = logger("routes:skills");
	const app = new Hono();

	app.get("/skills", async (c) => {
		const cwd = c.req.query("cwd");
		try {
			const body = await service.listSkills(cwd);
			return c.json(body);
		} catch (err) {
			log.error(`listSkills failed`, err);
			return c.json({ error: String(err) }, 500);
		}
	});

	app.get("/skills/:id", async (c) => {
		const id = c.req.param("id");
		const cwd = c.req.query("cwd");
		if (!id) return c.json({ error: "id is required" }, 400);
		try {
			const detail = await service.getSkillDetail(id, cwd);
			if (!detail) return c.json({ error: "skill not found" }, 404);
			return c.json(detail);
		} catch (err) {
			log.error(`getSkillDetail failed`, err);
			return c.json({ error: String(err) }, 500);
		}
	});


	// ─── skill mutations ───────────────────────────────────────────────────

	app.post("/skills", async (c) => {
		let body: CreateSkillRequest;
		try {
			body = (await c.req.json()) as CreateSkillRequest;
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
		if (!body.body || !body.dirName) {
			return c.json({ error: "dirName and body are required" }, 400);
		}
		try {
			const result = await service.createSkill(body);
			broadcastBus.broadcast({ type: "skills_changed" });
			return c.json(result, 201);
		} catch (err) {
			log.error(`createSkill failed`, err);
			return c.json({ error: String(err) }, 500);
		}
	});

	app.put("/skills/:id", async (c) => {
		const id = c.req.param("id");
		if (!id) return c.json({ error: "id is required" }, 400);
		let req: UpdateSkillRequest;
		try {
			req = (await c.req.json()) as UpdateSkillRequest;
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
		if (!req.body) return c.json({ error: "body is required" }, 400);
		try {
			const result = await service.updateSkill(id, req);
			broadcastBus.broadcast({ type: "skills_changed" });
			return c.json(result);
		} catch (err) {
			log.error(`updateSkill failed`, err);
			const msg = String(err);
			if (msg.includes("not found")) return c.json({ error: msg }, 404);
			if (msg.includes("read-only")) return c.json({ error: msg }, 403);
			return c.json({ error: msg }, 500);
		}
	});

	app.delete("/skills/:id", async (c) => {
		const id = c.req.param("id");
		if (!id) return c.json({ error: "id is required" }, 400);
		const cwd = c.req.query("cwd");
		try {
			const result = await service.deleteSkill(id, cwd);
			broadcastBus.broadcast({ type: "skills_changed" });
			return c.json(result);
		} catch (err) {
			log.error(`deleteSkill failed`, err);
			const msg = String(err);
			if (msg.includes("not found")) return c.json({ error: msg }, 404);
			if (msg.includes("read-only")) return c.json({ error: msg }, 403);
			return c.json({ error: msg }, 500);
		}
	});

	app.post("/skills/install", async (c) => {
		let req: InstallSkillFromUrlRequest;
		try {
			req = (await c.req.json()) as InstallSkillFromUrlRequest;
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
		if (!req.url) return c.json({ error: "url is required" }, 400);
		try {
			const result = await service.installFromUrl(req);
			broadcastBus.broadcast({ type: "skills_changed" });
			return c.json(result, 201);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			const status = getErrorStatus(err);
			log.error(`installFromUrl failed`, err);
			if (status) return c.json({ error: msg }, status);
			if (msg.includes("not under an allowed root")) return c.json({ error: msg }, 403);
			return c.json({ error: msg }, 500);
		}
	});
	return app;
}

type ClientErrorStatus = 400 | 409 | 413 | 415 | 502;

function getErrorStatus(err: unknown): ClientErrorStatus | undefined {
	if (!err || typeof err !== "object" || !("status" in err)) return undefined;
	const status = err.status;
	if (status === 400 || status === 409 || status === 413 || status === 415 || status === 502) return status;
	return undefined;
}
