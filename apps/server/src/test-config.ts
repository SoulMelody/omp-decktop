/**
 * Test fixture for `Config` objects. Provides sensible defaults for all the
 * fields that are otherwise tedious to spell out in every test file. Tests
 * that need to override `enableFsExec` or `cloneTimeoutMs` can spread the
 * result and override the relevant keys.
 */

import * as path from "node:path";

import type { Config } from "./config.ts";

export function makeTestConfig(overrides: Partial<Config> = {}): Config {
	const cwd = overrides.defaultCwd ?? process.cwd();
	return {
		host: "127.0.0.1",
		port: 0,
		defaultCwd: cwd,
		extraWorkspaces: [],
		devMode: true,
		idleTimeoutMs: 0,
		dbPath: path.join(cwd, "deck.db"),
		uploadsRoot: path.join(cwd, "uploads"),
		autoStartCommand: null,
		enableFsExec: false,
		execTimeoutMs: 30_000,
		cloneTimeoutMs: 120_000,
		maxWriteBytes: 5_000_000,
		maxRawBytes: 50_000_000,
		cloneRateLimit: { maxPerWindow: 1, windowMs: 10_000 },
		...overrides,
	};
}