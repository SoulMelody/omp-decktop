#!/usr/bin/env node
// ompd — omp-deck with Chinese (zh-CN) localization.
//
// Like `omp-deck` but serves the i18n-transformed web build (dist-zh).
// Runs the l10n prepare step, builds the zh web assets if missing,
// then starts the Bun server with OMP_DECK_WEB_DIST pointed at dist-zh,
// and opens the deck in the default browser.

import { execSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(HERE, "..");
const SERVER_ENTRY = path.join(PKG_ROOT, "apps", "server", "src", "index.ts");
const WEB_DIST_ZH = path.join(PKG_ROOT, "apps", "web", "dist-zh");
const STARTER_SKILLS = path.join(PKG_ROOT, "starter-skills");
const STARTER_EXTENSIONS = path.join(PKG_ROOT, "starter-extensions");

function fail(msg) {
	console.error(`ompd: ${msg}`);
	process.exit(1);
}

function ensureBun() {
	const probe = spawnSync(process.platform === "win32" ? "where" : "which", ["bun"], {
		stdio: ["ignore", "pipe", "ignore"],
	});
	if (probe.status === 0 && probe.stdout.toString().trim().length > 0) return;
	console.error("ompd requires Bun (https://bun.sh) — not found on PATH.");
	console.error("");
	console.error("Install:");
	console.error("  curl -fsSL https://bun.sh/install | bash    (macOS / Linux)");
	console.error('  powershell -c "irm bun.sh/install.ps1 | iex"  (Windows)');
	console.error("");
	console.error("Then re-run: ompd");
	process.exit(127);
}

function resolveDataDir() {
	const explicit = process.env.OMP_DECK_DATA_DIR?.trim();
	if (explicit) return path.resolve(explicit);
	return path.join(os.homedir(), ".omp-deck");
}

function ensureZhBuild() {
	if (existsSync(path.join(WEB_DIST_ZH, "index.html"))) return;

	console.log("ompd: zh-CN web build not found, building...");
	try {
		// Step 1: run l10n:prepare to generate the i18n source tree
		execSync("bun run l10n:prepare", { cwd: PKG_ROOT, stdio: "inherit" });
		// Step 2: build the zh web assets
		execSync("bun run build:zh", { cwd: PKG_ROOT, stdio: "inherit" });
	} catch (err) {
		fail(`zh-CN build failed: ${err.message ?? err}`);
	}

	if (!existsSync(path.join(WEB_DIST_ZH, "index.html"))) {
		fail("zh-CN build completed but dist-zh/index.html not found");
	}
	console.log("ompd: zh-CN build ready.");
}

function openBrowser(url) {
	const cmd =
		process.platform === "darwin"
			? "open"
			: process.platform === "win32"
				? "cmd"
				: "xdg-open";
	const args =
		process.platform === "win32"
			? ["/c", "start", "", url]
			: [url];

	try {
		const child = spawn(cmd, args, { stdio: "ignore", detached: true });
		child.unref();
	} catch {
		// Non-critical — the user can open the URL manually.
	}
}

function main() {
	if (!existsSync(SERVER_ENTRY)) {
		fail(`server entry missing at ${SERVER_ENTRY} — broken install?`);
	}
	ensureBun();
	ensureZhBuild();

	const dataDir = resolveDataDir();
	mkdirSync(dataDir, { recursive: true });

	const env = { ...process.env };
	env.OMP_DECK_DB_PATH ??= path.join(dataDir, "deck.db");
	env.OMP_DECK_UPLOADS_ROOT ??= path.join(dataDir, "uploads");
	// Force the zh-CN web dist
	env.OMP_DECK_WEB_DIST = WEB_DIST_ZH;
	env.OMP_DECK_STARTER_SKILLS_DIR ??= STARTER_SKILLS;
	env.OMP_DECK_STARTER_EXTENSIONS_DIR ??= STARTER_EXTENSIONS;
	env.OMP_DECK_DEFAULT_CWD ??= os.homedir();

	const host = env.OMP_DECK_HOST?.trim() || "127.0.0.1";
	const port = env.OMP_DECK_PORT?.trim() || "8787";
	const deckUrl = `http://${host}:${port}/`;

	const args = process.argv.slice(2);
	const child = spawn("bun", [SERVER_ENTRY, ...args], {
		stdio: "inherit",
		env,
		cwd: PKG_ROOT,
	});

	function forward(sig) {
		try {
			child.kill(sig);
		} catch {
			/* child already exited */
		}
	}
	process.on("SIGINT", () => forward("SIGINT"));
	process.on("SIGTERM", () => forward("SIGTERM"));

	// Open browser after a short delay to let the server start.
	setTimeout(() => openBrowser(deckUrl), 2000);

	console.log(`ompd: deck at ${deckUrl}`);

	child.on("exit", (code, signal) => {
		if (signal) {
			process.kill(process.pid, signal);
		} else {
			process.exit(code ?? 0);
		}
	});
	child.on("error", (err) => {
		fail(`failed to spawn bun: ${err.message}`);
	});
}

main();
