import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface Config {
	host: string;
	port: number;
	defaultCwd: string;
	extraWorkspaces: string[];
	agentDir?: string;
	webDist?: string;
	devMode: boolean;
	/** Ms a session may sit without WS subscribers before the reaper disposes it. 0 disables. */
	idleTimeoutMs: number;
	/** Absolute path to the sqlite database file. */
	dbPath: string;
	/** Absolute path to the uploads root (images pasted into task bodies). */
	uploadsRoot: string;
	/**
	 * Prompt to fire automatically on every NEW session once a WS subscriber
	 * attaches. Empty string or null disables. Default: "/start" (expands to the
	 * ~/.omp/agent/commands/start.md slash command if present).
	 */
	autoStartCommand: string | null;
	/**
	 * Enable the background command runner (`POST /fs/exec`). Default false —
	 * the runner is opt-in so a misconfigured server cannot execute arbitrary
	 * commands even from loopback callers.
	 */
	enableFsExec: boolean;
	/** Hard timeout for `/fs/exec` jobs in ms (also the per-job cap). */
	execTimeoutMs: number;
	/** Hard timeout for `git clone` in ms. */
	cloneTimeoutMs: number;
	/** Maximum decoded bytes accepted by `POST /fs/write`. Default 5 MB. */
	maxWriteBytes: number;
	/** Maximum bytes streamed by `GET /fs/raw`. Default 50 MB. */
	maxRawBytes: number;
	/** Rate-limit `/fs/clone` to N requests per window per cwd. */
	cloneRateLimit: { maxPerWindow: number; windowMs: number };
}

export function parseInt10(value: string | undefined, fallback: number): number {
	if (!value) return fallback;
	const n = Number.parseInt(value, 10);
	return Number.isFinite(n) ? n : fallback;
}

export function parseAutoStart(value: string | undefined): string | null {
	// Default is OFF on a fresh install: a new session lands on an empty
	// composer waiting for the user's first prompt. Opt-in by setting the env
	// var (typically to `/start` after creating `~/.omp/agent/commands/start.md`).
	if (value === undefined) return null;
	const trimmed = value.trim();
	if (trimmed === "" || trimmed === "0" || trimmed.toLowerCase() === "false") return null;
	return trimmed;
}

export function splitList(value: string | undefined): string[] {
	if (!value) return [];
	return value
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

function resolveWebDist(): string | undefined {
	const explicit = process.env.OMP_DECK_WEB_DIST?.trim();
	const candidates = [
		explicit,
		// Common deployment layouts:
		path.resolve(process.cwd(), "public"),
		path.resolve(process.cwd(), "../web/dist"),
		path.resolve(process.cwd(), "../../apps/web/dist"),
	].filter((c): c is string => Boolean(c));
	for (const c of candidates) {
		try {
			if (fs.statSync(c).isDirectory()) return c;
		} catch {
			// not found — try the next candidate
		}
	}
	return undefined;
}

export function loadConfig(): Config {
	const home = os.homedir();
	const defaultCwd = process.env.OMP_DECK_DEFAULT_CWD?.trim() || home;
	const extra = splitList(process.env.OMP_DECK_WORKSPACES);
	const agentDir = process.env.OMP_AGENT_DIR?.trim() || undefined;
	const webDist = resolveWebDist();

	return {
		host: process.env.OMP_DECK_HOST?.trim() || "127.0.0.1",
		port: parseInt10(process.env.OMP_DECK_PORT, 8787),
		defaultCwd: path.resolve(defaultCwd),
		extraWorkspaces: extra.map((p) => path.resolve(p)),
		agentDir,
		webDist,
		devMode: process.env.NODE_ENV !== "production",
		// 0 disables reaping (default). Sessions persist on disk until explicitly deleted.
		idleTimeoutMs: parseInt10(process.env.OMP_DECK_IDLE_TIMEOUT_MS, 0),
		dbPath: path.resolve(
			process.env.OMP_DECK_DB_PATH?.trim() ||
				process.env.OMP_DECK_DB?.trim() ||
				path.join(process.cwd(), "data", "deck.db"),
		),
		uploadsRoot: path.resolve(
			process.env.OMP_DECK_UPLOADS_ROOT?.trim() ||
				path.join(
					path.dirname(
						path.resolve(
							process.env.OMP_DECK_DB_PATH?.trim() ||
								process.env.OMP_DECK_DB?.trim() ||
								path.join(process.cwd(), "data", "deck.db"),
						),
					),
					"uploads",
				),
		),
		// Set OMP_DECK_AUTO_START="" or "0" to disable, or to any other prompt
		// string to override the default "/start" slash-command invocation.
		autoStartCommand: parseAutoStart(process.env.OMP_DECK_AUTO_START),
		// Default OFF: the runner is a sharp tool and must be opted in.
		enableFsExec: parseBool10(process.env.OMP_DECK_ENABLE_FS_EXEC, false),
		execTimeoutMs: parseInt10(process.env.OMP_DECK_EXEC_TIMEOUT_MS, 30_000),
		cloneTimeoutMs: parseInt10(process.env.OMP_DECK_CLONE_TIMEOUT_MS, 120_000),
		maxWriteBytes: parseInt10(process.env.OMP_DECK_MAX_WRITE_BYTES, 5_000_000),
		maxRawBytes: parseInt10(process.env.OMP_DECK_MAX_RAW_BYTES, 50_000_000),
		cloneRateLimit: {
			maxPerWindow: parseInt10(process.env.OMP_DECK_CLONE_RATE_MAX, 1),
			windowMs: parseInt10(process.env.OMP_DECK_CLONE_RATE_WINDOW_MS, 10_000),
		},
	};
}

export function parseBool10(value: string | undefined, fallback: boolean): boolean {
	if (value === undefined) return fallback;
	const v = value.trim().toLowerCase();
	if (v === "" || v === "0" || v === "false" || v === "no") return false;
	if (v === "1" || v === "true" || v === "yes") return true;
	return fallback;
}
