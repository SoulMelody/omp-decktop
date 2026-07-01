import { Hono } from "hono";
import { terminalService } from "./terminal-service.ts";

export function buildTerminalRouter(): Hono {
	const app = new Hono();

	app.get("/terminal", (c) => {
		return c.json({
			running: terminalService.isRunning(),
			ptyAvailable: terminalService.isRunning(),
		});
	});

	return app;
}
