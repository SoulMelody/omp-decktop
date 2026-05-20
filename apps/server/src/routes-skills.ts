/**
 * /api/skills — skill-level enumeration over installed marketplace plugins.
 *
 * Phase 1 of the Skills Cockpit (docs/proposals/skills-cockpit.md). This route
 * only lists; install / uninstall / enable / disable continue to flow through
 * /api/marketplace. The skill detail endpoint lands in Phase 1.2 (T-28).
 */

import { Hono } from "hono";

import { logger } from "./log.ts";
import type { SkillsService } from "./skills-service.ts";

const log = logger("routes:skills");

export function buildSkillsRouter(service: SkillsService): Hono {
	const app = new Hono();

	app.get("/skills", async (c) => {
		try {
			const body = await service.listSkills();
			return c.json(body);
		} catch (err) {
			log.error(`listSkills failed`, err);
			return c.json({ error: String(err) }, 500);
		}
	});

	app.get("/skills/:pluginId/:skillName", async (c) => {
		// Hono auto-decodes percent-escaped path params, so a request to
		// `/api/skills/skill-creator%40claude-plugins-official/skill-creator`
		// arrives here as the raw `name@marketplace` and bare skill dir name.
		const pluginId = c.req.param("pluginId");
		const skillName = c.req.param("skillName");
		if (!pluginId || !skillName) {
			return c.json({ error: "pluginId and skillName are required" }, 400);
		}
		try {
			const detail = await service.getSkillDetail(pluginId, skillName);
			if (!detail) return c.json({ error: "skill not found" }, 404);
			return c.json(detail);
		} catch (err) {
			log.error(`getSkillDetail failed`, err);
			return c.json({ error: String(err) }, 500);
		}
	});

	return app;
}
