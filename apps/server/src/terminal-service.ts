/**
 * PTY-backed terminal service for the omp-deck terminal panel.
 *
 * Uses Bun's built-in `Bun.spawn({ terminal: { ... } })` for PTY support.
 * No native addons needed — works everywhere Bun runs.
 *
 * Shell: always bash for a consistent experience.
 * On Windows that means Git Bash (ships with Git for Windows).
 * On Unix/Android it's the system bash.
 */

import type { ServerWebSocket, Subprocess } from "bun";
import { logger } from "./log.ts";
import { broadcastBus } from "./broadcast-bus.ts";
import type { ConnectionData } from "./ws.ts";

const log = logger("terminal");

// ---------------------------------------------------------------------------
// Shell detection — always bash for consistency
// ---------------------------------------------------------------------------

/**
 * Detect the shell path for PTY terminal.
 *
 * On Windows, we **skip `which("bash")`** and always use Git Bash.
 * `Bun.which("bash")` on Windows can return WSL's bash (`bash.exe` in
 * System32 or a UNC WSL path), which is NOT a valid Windows PTY shell.
 *
 * On Unix/Android, we use `which("bash")` first, then fallback to /bin/bash.
 */
export function detectShell(
	platform: NodeJS.Platform = process.platform,
	env: NodeJS.ProcessEnv = process.env,
	which: (bin: string) => string | null = Bun.which,
): string {
	// Windows: always Git Bash, never WSL bash
	if (platform === "win32") {
		const gitBash = env.ProgramFiles
			? `${env.ProgramFiles}\\Git\\bin\\bash.exe`
			: "C:\\Program Files\\Git\\bin\\bash.exe";
		return gitBash;
	}

	// Unix/Android: which first, then fallback
	const bash = which("bash");
	if (bash) return bash;
	return "/bin/bash";
}

// ---------------------------------------------------------------------------
// TerminalService
// ---------------------------------------------------------------------------

export interface TerminalExitInfo {
	exitCode: number;
	signalCode?: string;
}

type TerminalSpawn = typeof Bun.spawn;

interface TerminalServiceDeps {
	detectShell?: typeof detectShell;
	spawn?: TerminalSpawn;
}

export class TerminalService {
	private proc: Subprocess | null = null;
	private readonly dataSubscribers = new Set<(data: string) => void>();
	private readonly exitSubscribers = new Set<(info: TerminalExitInfo) => void>();
	private readonly detectShell: typeof detectShell;
	private readonly spawn: TerminalSpawn;

	constructor(deps: TerminalServiceDeps = {}) {
		this.detectShell = deps.detectShell ?? detectShell;
		this.spawn = deps.spawn ?? Bun.spawn;
	}

	isRunning(): boolean {
		return this.proc !== null && !this.proc.killed;
	}

	start(cwd: string = process.cwd()): boolean {
		if (this.proc && !this.proc.killed) return true;

		const shell = this.detectShell();

		try {
			this.proc = this.spawn([shell, "--login"], {
				cwd,
				env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" },
				terminal: {
					cols: 80,
					rows: 24,
					data: (_terminal, data) => {
						const text = new TextDecoder().decode(data);
						for (const sub of this.dataSubscribers) {
							try { sub(text); } catch { /* subscriber threw */ }
						}
						broadcastBus.broadcast({ type: "terminal_data", data: text });
					},
					exit: (_terminal, exitCode, signal) => {
						log.info(`terminal stream closed: exitCode=${exitCode} signal=${signal}`);
					},
				},
			});

			log.info(`terminal started: pid=${this.proc.pid} shell=${shell}`);

			this.proc.exited.then((exitCode) => {
				log.info(`terminal process exited: code=${exitCode}`);
				const info: TerminalExitInfo = {
					exitCode,
					signalCode: this.proc?.signalCode ?? undefined,
				};
				for (const sub of this.exitSubscribers) {
					try { sub(info); } catch { /* subscriber threw */ }
				}
				this.proc = null;
				broadcastBus.broadcast({ type: "terminal_close" });
			});

			return true;
		} catch (err) {
			log.error("terminal spawn failed", err);
			this.proc = null;
			return false;
		}
	}

	write(data: string): void {
		this.proc?.terminal?.write(data);
	}

	resize(cols: number, rows: number): void {
		this.proc?.terminal?.resize(cols, rows);
	}

	kill(): void {
		if (!this.proc) return;
		this.proc.terminal?.close();
		this.proc.kill();
		this.proc = null;
		broadcastBus.broadcast({ type: "terminal_close" });
	}

	onData(cb: (data: string) => void): () => void {
		this.dataSubscribers.add(cb);
		return () => { this.dataSubscribers.delete(cb); };
	}

	onExit(cb: (info: TerminalExitInfo) => void): () => void {
		this.exitSubscribers.add(cb);
		return () => { this.exitSubscribers.delete(cb); };
	}

	sendState(ws: ServerWebSocket<ConnectionData>): void {
		if (this.proc && !this.proc.killed) {
			ws.send(JSON.stringify({ type: "terminal_open" }));
		}
	}
}

/** Singleton — one PTY for the whole deck server. */
export const terminalService = new TerminalService();
