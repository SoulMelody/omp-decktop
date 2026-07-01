/**
 * GET /api/sessions/:sessionId/agent-output/:agentId
 *
 * Reads a sub-agent's full output (Markdown) from the artifacts directory.
 * Returns 404 when the session is not found or the agent output file doesn't exist.
 * Returns 400 when the agentId is missing, invalid, or contains path traversal.
 */
import { Hono } from "hono";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { AgentRegistry } from "@oh-my-pi/pi-coding-agent/registry/agent-registry";

export function buildAgentOutputRouter(): Hono {
	const app = new Hono();

	app.get("/api/sessions/:sessionId/agent-output/:agentId", async (c) => {
		const sessionId = c.req.param("sessionId");
		const agentId = c.req.param("agentId");
		if (!agentId) {
			return c.json({ error: "Missing agentId" }, 400);
		}

		// Sanitize: prevent path traversal via agentId
		if (agentId.includes("/") || agentId.includes("\\") || agentId.includes("..")) {
			return c.json({ error: "Invalid agentId" }, 400);
		}

		// Find the specific session's artifacts dir from the registry
		let artifactsDir: string | null = null;
		for (const ref of AgentRegistry.global().list()) {
			const sid = ref.session?.sessionManager?.getSessionId();
			if (sid === sessionId) {
				artifactsDir = ref.session?.sessionManager?.getArtifactsDir() ?? null;
				if (!artifactsDir && ref.sessionFile) {
					artifactsDir = ref.sessionFile.slice(0, -6); // strip .jsonl
				}
				break;
			}
		}

		if (!artifactsDir) {
			return c.json({ error: `Session not found or not active: ${sessionId}` }, 404);
		}

		const candidate = path.join(artifactsDir, `${agentId}.md`);
		try {
			const stat = await fs.stat(candidate);
			if (stat.isFile()) {
				const content = await Bun.file(candidate).text();
				return new Response(content, {
					status: 200,
					headers: {
						"Content-Type": "text/markdown; charset=utf-8",
						"X-Agent-Id": agentId,
						"X-Artifacts-Dir": artifactsDir,
					},
				});
			}
		} catch {
			// ENOENT — file not found
		}

		return c.json({ error: `Agent output not found: ${agentId}`, sessionId }, 404);
	});

	return app;
}
