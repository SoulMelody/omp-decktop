/**
 * GET /api/sessions/:sessionId/agent-output/:agentId
 *
 * Reads a sub-agent's full output (Markdown) from the artifacts directory.
 * Returns 404 when the agent output file doesn't exist.
 * Returns 400 when no artifacts directory is registered (no active session).
 */
import { Hono } from "hono";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { artifactsDirsFromRegistry } from "@oh-my-pi/pi-coding-agent/internal-urls/registry-helpers";

export function buildAgentOutputRouter(): Hono {
	const app = new Hono();

	app.get("/api/sessions/:sessionId/agent-output/:agentId", async (c) => {
		const agentId = c.req.param("agentId");
		if (!agentId) {
			return c.json({ error: "Missing agentId" }, 400);
		}

		// Sanitize: prevent path traversal via agentId
		if (agentId.includes("/") || agentId.includes("\\") || agentId.includes("..")) {
			return c.json({ error: "Invalid agentId" }, 400);
		}

		const dirs = artifactsDirsFromRegistry();
		if (dirs.length === 0) {
			return c.json({ error: "No active session — agent outputs unavailable" }, 400);
		}

		// Search each artifacts dir for <agentId>.md
		for (const dir of dirs) {
			const candidate = path.join(dir, `${agentId}.md`);
			try {
				const stat = await fs.stat(candidate);
				if (stat.isFile()) {
					const content = await Bun.file(candidate).text();
					return new Response(content, {
						status: 200,
						headers: {
							"Content-Type": "text/markdown; charset=utf-8",
							"X-Agent-Id": agentId,
							"X-Artifacts-Dir": dir,
						},
					});
				}
			} catch {
				// ENOENT — not in this dir, try next
			}
		}

		return c.json({ error: `Agent output not found: ${agentId}` }, 404);
	});

	return app;
}
