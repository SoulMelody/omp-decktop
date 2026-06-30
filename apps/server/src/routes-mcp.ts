/**
 * MCP server management REST endpoints.
 *
 * Reads and writes the user-level mcp.json via the SDK's config-writer.
 * Routes:
 *   GET    /api/mcp              — list servers
 *   POST   /api/mcp              — add server
 *   PUT    /api/mcp/:name        — update / rename server
 *   DELETE /api/mcp/:name        — remove server
 *   POST   /api/mcp/:name/toggle — toggle disabled status
 *   POST   /api/mcp/:name/test   — test connection (initialize handshake)
 */

import { Hono } from "hono";
import { getMCPConfigPath } from "@oh-my-pi/pi-utils";
import {
	addMCPServer,
	readMCPConfigFile,
	removeMCPServer,
	setServerDisabled,
	updateMCPServer,
	validateServerName,
} from "@oh-my-pi/pi-coding-agent/mcp/config-writer";
import { validateServerConfig } from "@oh-my-pi/pi-coding-agent/mcp/config";
import type {
	McpCreateRequest,
	McpListResponse,
	McpServerConfigWire,
	McpTestResponse,
	McpUpdateRequest,
} from "@omp-deck/protocol";

import { logger } from "./log.ts";

const log = logger("mcp");

// ─── Helpers ────────────────────────────────────────────────────────────────

function configToWire(
	name: string,
	raw: Record<string, unknown>,
	disabled: boolean,
	source: string,
) {
	const cfg: McpServerConfigWire = {
		type: (raw.type as McpServerConfigWire["type"]) ?? "stdio",
	};
	if (raw.command) cfg.command = raw.command as string;
	if (raw.args) cfg.args = raw.args as string[];
	if (raw.env) cfg.env = raw.env as Record<string, string>;
	if (raw.cwd) cfg.cwd = raw.cwd as string;
	if (raw.url) cfg.url = raw.url as string;
	if (raw.headers) cfg.headers = raw.headers as Record<string, string>;
	if (raw.timeout !== undefined) cfg.timeout = raw.timeout as number;
	if (raw.enabled !== undefined) cfg.enabled = raw.enabled as boolean;
	return { name, config: cfg, disabled, source };
}

/**
 * Test a stdio MCP server: spawn, send initialize, optionally list tools.
 */
async function testStdio(
	cfg: McpServerConfigWire,
	name: string,
): Promise<McpTestResponse> {
	const cmd = cfg.command;
	if (!cmd) return { ok: false, serverName: name, error: "command is required for stdio" };

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let child: any;
	try {
		child = Bun.spawn({
			cmd: [cmd, ...(cfg.args ?? [])],
			env: cfg.env ?? undefined,
			cwd: cfg.cwd ?? process.cwd(),
			stdin: "pipe",
			stdout: "pipe",
			stderr: "pipe",
		});
	} catch (err) {
		return { ok: false, serverName: name, error: `spawn failed: ${String(err)}` };
	}

	const TIMEOUT = 10_000;

	try {
		// Send initialize request via FileSink
		const initMsg =
			JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2024-11-05",
					capabilities: {},
					clientInfo: { name: "omp-deck", version: "1.0" },
				},
			}) + "\n";
		child.stdin.write(new TextEncoder().encode(initMsg));
		child.stdin.end();

		// Read stdout until we get a complete JSON-RPC initialize response,
		// or the process exits, or the timeout fires. MCP servers are
		// long-running, so we can't wait for process exit.
		const timeout = new Promise<"timeout">((resolve) =>
			setTimeout(() => resolve("timeout"), TIMEOUT),
		);

		// Read stdout byte by byte and try to parse a JSON-RPC message
		// with id=1. When found, stop reading and kill the child.
		const readPromise = (async () => {
			const reader = child.stdout.getReader();
			let buf = "";
			while (true) {
				const chunk = await reader.read();
				if (chunk.done) break;
				if (chunk.value) buf += new TextDecoder().decode(chunk.value);
				// Try to extract a complete JSON-RPC response (one per line)
				const lines = buf.split("\n");
				// Keep the last incomplete line in the buffer
				buf = lines.length > 1 ? (lines.pop() ?? "") : buf;
				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed) continue;
					try {
						const msg = JSON.parse(trimmed);
						if (msg.id === 1 || msg.id === 2) {
							return msg;
						}
					} catch { /* skip non-JSON */ }
				}
			}
			return null;
		})();

		const msg = await Promise.race([readPromise, timeout]);

		if (msg === "timeout") {
			try { child.kill(); } catch { /* ignore */ }
			return { ok: false, serverName: name, error: "Timed out" };
		}

		if (!msg) {
			return { ok: false, serverName: name, error: "No initialize response received" };
		}

		if (msg.error) {
			const em = (msg.error as Record<string, unknown>)?.message ?? JSON.stringify(msg.error);
			return { ok: false, serverName: name, error: `Initialize error: ${String(em)}` };
		}

		const tools: string[] = [];
		const caps = msg.result as Record<string, unknown> | undefined;

		// If server advertises tools, try tools/list
		if (caps?.capabilities && (caps.capabilities as Record<string, unknown>)?.tools) {
			// Spawn a second process for tools/list
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			let child2: any;
			try {
				child2 = Bun.spawn({
					cmd: [cmd, ...(cfg.args ?? [])],
					env: cfg.env ?? undefined,
					cwd: cfg.cwd ?? process.cwd(),
					stdin: "pipe",
					stdout: "pipe",
					stderr: "pipe",
				});
			} catch {
				return { ok: true, serverName: name, tools };
			}

			const listMsg =
				JSON.stringify({
					jsonrpc: "2.0",
					id: 2,
					method: "tools/list",
					params: {},
				}) + "\n";
			child2.stdin.write(new TextEncoder().encode(listMsg));
			child2.stdin.end();

			// Read byte by byte looking for JSON-RPC response with id=2
			let out2 = "";
			const r2 = child2.stdout.getReader();
			const listTimer = setTimeout(() => { try { child2.kill(); } catch { /* ignore */ } }, 5000);
			while (true) {
				const c = await r2.read();
				if (c.done) break;
				if (c.value) out2 += new TextDecoder().decode(c.value);
				// Check if we got a complete response
				for (const line of out2.split("\n")) {
					const trimmed = line.trim();
					if (!trimmed) continue;
					try {
						const parsed = JSON.parse(trimmed);
						if (parsed.id === 2) {
							clearTimeout(listTimer);
							if (parsed.result?.tools) {
								for (const t of parsed.result.tools as Array<{ name?: string }>) {
									if (t.name) tools.push(t.name);
								}
							}
							try { child2.kill(); } catch { /* ignore */ }
							return { ok: true, serverName: name, tools };
						}
					} catch { /* skip */ }
				}
			}
		}

		return { ok: true, serverName: name, tools };
	} catch (err) {
		try { child.kill(); } catch { /* ignore */ }
		return { ok: false, serverName: name, error: `I/O error: ${String(err)}` };
	}
}

/**
 * Test an SSE / HTTP MCP server via fetch-based initialize.
 */
async function testSseOrHttp(
	cfg: McpServerConfigWire,
	name: string,
): Promise<McpTestResponse> {
	const url = cfg.url;
	if (!url) return { ok: false, serverName: name, error: "url is required for http/sse" };

	const signal = AbortSignal.timeout(10_000);

	try {
		const initRes = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json", ...cfg.headers },
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2024-11-05",
					capabilities: {},
					clientInfo: { name: "omp-deck", version: "1.0" },
				},
			}),
			signal,
		});

		if (!initRes.ok) {
			const text = await initRes.text().catch(() => "");
			return { ok: false, serverName: name, error: `HTTP ${initRes.status}: ${text.slice(0, 200)}` };
		}

		const contentType = initRes.headers.get("content-type") ?? "";
		const body = await initRes.text();
		let msg: Record<string, unknown>;

		if (contentType.includes("text/event-stream")) {
			const dataLine = body.split("\n").find((l) => l.startsWith("data:"));
			if (!dataLine) return { ok: false, serverName: name, error: "No data line in SSE response" };
			msg = JSON.parse(dataLine.replace(/^data:\s*/, ""));
		} else {
			msg = JSON.parse(body);
		}

		if (msg.error) {
			const em = (msg.error as Record<string, unknown>)?.message ?? JSON.stringify(msg.error);
			return { ok: false, serverName: name, error: `Initialize error: ${String(em)}` };
		}

		const caps = msg.result as Record<string, unknown> | undefined;
		const tools: string[] = [];

		if (caps?.capabilities && (caps.capabilities as Record<string, unknown>)?.tools) {
			try {
				const listRes = await fetch(url, {
					method: "POST",
					headers: { "Content-Type": "application/json", ...cfg.headers },
					body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
					signal: AbortSignal.timeout(5000),
				});
				if (listRes.ok) {
					const lb = await listRes.text();
					let lm: Record<string, unknown>;
					if (listRes.headers.get("content-type")?.includes("text/event-stream")) {
						const dl = lb.split("\n").find((l) => l.startsWith("data:"));
						lm = dl ? JSON.parse(dl.replace(/^data:\s*/, "")) : {};
					} else {
						lm = JSON.parse(lb);
					}
					if ((lm.result as Record<string, unknown>)?.tools) {
						for (const t of (lm.result as Record<string, unknown>).tools as Array<{ name?: string }>) {
							if (t.name) tools.push(t.name);
						}
					}
				}
			} catch { /* best-effort */ }
		}

		return { ok: true, serverName: name, tools: tools.length > 0 ? tools : undefined };
	} catch (err) {
		if ((err as Error).name === "AbortError" || (err as Error).name === "TimeoutError") {
			return { ok: false, serverName: name, error: "Timed out connecting to server" };
		}
		return { ok: false, serverName: name, error: `Connection failed: ${String(err)}` };
	}
}

// ─── Router ─────────────────────────────────────────────────────────────────

function buildRouter(): Hono {
	const app = new Hono();

	// ── list ────────────────────────────────────────────────────────────────
	app.get("/", async (c) => {
		const userPath = getMCPConfigPath("user", process.cwd());
		try {
			const file = await readMCPConfigFile(userPath);
			const servers = file.mcpServers ?? {};
			const disabledSet = new Set(file.disabledServers ?? []);
			return c.json({
				servers: Object.entries(servers).map(([n, cfg]) =>
					configToWire(n, cfg as unknown as Record<string, unknown>, disabledSet.has(n), userPath),
				),
				userConfigPath: userPath,
			} satisfies McpListResponse);
		} catch (err) {
			log.error("list failed", err);
			return c.json({ error: String(err) }, 500);
		}
	});

	// ── add ─────────────────────────────────────────────────────────────────
	app.post("/", async (c) => {
		let body: McpCreateRequest;
		try {
			body = (await c.req.json()) as McpCreateRequest;
		} catch {
			return c.json({ error: "invalid json body" }, 400);
		}

		const nameErr = validateServerName(body.name);
		if (nameErr) return c.json({ error: nameErr }, 400);

		const configErrs = validateServerConfig(body.name, body.config as Parameters<typeof validateServerConfig>[1]);
		if (configErrs.length > 0) return c.json({ error: configErrs.join("; ") }, 400);

		const userPath = getMCPConfigPath("user", process.cwd());
		try {
			await addMCPServer(userPath, body.name, body.config as Parameters<typeof addMCPServer>[2]);
			return c.json({ ok: true });
		} catch (err) {
			log.error("add failed", err);
			return c.json({ error: String(err) }, 409);
		}
	});

	// ── update / rename ─────────────────────────────────────────────────────
	app.put("/:name", async (c) => {
		const oldName = c.req.param("name");
		let body: McpUpdateRequest;
		try {
			body = (await c.req.json()) as McpUpdateRequest;
		} catch {
			return c.json({ error: "invalid json body" }, 400);
		}

		const newName = body.name?.trim() || oldName;
		const nameErr = validateServerName(newName);
		if (nameErr) return c.json({ error: nameErr }, 400);

		const configErrs = validateServerConfig(newName, body.config as Parameters<typeof validateServerConfig>[1]);
		if (configErrs.length > 0) return c.json({ error: configErrs.join("; ") }, 400);

		const userPath = getMCPConfigPath("user", process.cwd());
		try {
			if (newName !== oldName) {
				await removeMCPServer(userPath, oldName);
			}
			await updateMCPServer(userPath, newName, body.config as Parameters<typeof updateMCPServer>[2]);
			return c.json({ ok: true });
		} catch (err) {
			log.error("update failed", err);
			return c.json({ error: String(err) }, 500);
		}
	});

	// ── delete ──────────────────────────────────────────────────────────────
	app.delete("/:name", async (c) => {
		const name = c.req.param("name");
		const userPath = getMCPConfigPath("user", process.cwd());
		try {
			await removeMCPServer(userPath, name);
			return c.json({ ok: true });
		} catch (err) {
			log.error("delete failed", err);
			return c.json({ error: String(err) }, 500);
		}
	});

	// ── toggle ──────────────────────────────────────────────────────────────
	app.post("/:name/toggle", async (c) => {
		const name = c.req.param("name");
		const userPath = getMCPConfigPath("user", process.cwd());
		try {
			const file = await readMCPConfigFile(userPath);
			const disabledSet = new Set(file.disabledServers ?? []);
			const currentlyDisabled = disabledSet.has(name);
			await setServerDisabled(userPath, name, !currentlyDisabled);
			return c.json({ ok: true, disabled: !currentlyDisabled });
		} catch (err) {
			log.error("toggle failed", err);
			return c.json({ error: String(err) }, 500);
		}
	});

	// ── test ────────────────────────────────────────────────────────────────
	app.post("/:name/test", async (c) => {
		const name = c.req.param("name");
		const userPath = getMCPConfigPath("user", process.cwd());
		try {
			const file = await readMCPConfigFile(userPath);
			const raw = (file.mcpServers ?? {})[name];
			if (!raw) {
				return c.json({ ok: false, serverName: name, error: `Server "${name}" not found` } satisfies McpTestResponse, 404);
			}

			const r = raw as unknown as Record<string, unknown>;
			const cfg: McpServerConfigWire = {
				type: (r.type as McpServerConfigWire["type"]) ?? "stdio",
				command: r.command as string | undefined,
				args: r.args as string[] | undefined,
				env: r.env as Record<string, string> | undefined,
				cwd: r.cwd as string | undefined,
				url: r.url as string | undefined,
				headers: r.headers as Record<string, string> | undefined,
				timeout: r.timeout as number | undefined,
			};

			const result = cfg.command && !cfg.url
				? await testStdio(cfg, name)
				: await testSseOrHttp(cfg, name);
			return c.json(result);
		} catch (err) {
			log.error("test failed", err);
			return c.json({ ok: false, serverName: name, error: String(err) } satisfies McpTestResponse, 500);
		}
	});

	return app;
}

export const mcpApp = buildRouter();
