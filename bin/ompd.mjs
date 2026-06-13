#!/usr/bin/env node
// ompd — omp-deck with Chinese (zh-CN) localization (dev mode).
//
// Runs the l10n prepare step, then starts the Bun server (port 8787)
// alongside the Vite dev server with the i18n config (port 5174, HMR).
// Opens the Vite dev URL so source changes hot-reload instantly while
// the zh-CN translations are baked into the generated source tree.

import { execSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(HERE, "..");
const SERVER_ENTRY = path.join(PKG_ROOT, "apps", "server", "src", "index.ts");
const WEB_DIR = path.join(PKG_ROOT, "apps", "web");
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

function runL10nPrepare() {
	console.log("ompd: running l10n:prepare...");
	try {
		execSync("bun run l10n:prepare", { cwd: PKG_ROOT, stdio: "inherit" });
	} catch (err) {
		fail(`l10n:prepare failed: ${err.message ?? err}`);
	}
	console.log("ompd: l10n:prepare done.");
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
	runL10nPrepare();

	const dataDir = resolveDataDir();
	mkdirSync(dataDir, { recursive: true });

	const host = process.env.OMP_DECK_HOST?.trim() || "127.0.0.1";
	const serverPort = process.env.OMP_DECK_PORT?.trim() || "8787";
	const webPort = process.env.OMP_DECK_WEB_PORT?.trim() || "5174";
	const deckUrl = `http://${host}:${webPort}/`;

	const env = { ...process.env };
	env.OMP_DECK_DB_PATH ??= path.join(dataDir, "deck.db");
	env.OMP_DECK_UPLOADS_ROOT ??= path.join(dataDir, "uploads");
	// Do NOT set OMP_DECK_WEB_DIST — Vite dev server handles static serving
	env.OMP_DECK_STARTER_SKILLS_DIR ??= STARTER_SKILLS;
	env.OMP_DECK_STARTER_EXTENSIONS_DIR ??= STARTER_EXTENSIONS;
	env.OMP_DECK_DEFAULT_CWD ??= os.homedir();

	const extraArgs = process.argv.slice(2);
	const children = [];

	// ── Bun server (port 8787) ────────────────────────────────────────────
	const server = spawn("bun", ["--hot", SERVER_ENTRY, ...extraArgs], {
		stdio: "inherit",
		env,
		cwd: PKG_ROOT,
	});
	children.push(server);

	// ── Vite dev server with i18n config (port 5174, HMR) ─────────────────
	const vite = spawn("bun", ["run", "vite", "--config", "vite.i18n.config.ts"], {
		stdio: "inherit",
		env,
		cwd: WEB_DIR,
	});
	children.push(vite);

	function cleanup(sig) {
		for (const c of children) {
			try { c.kill(sig); } catch { /* already exited */ }
		}
	}
	process.on("SIGINT", () => cleanup("SIGINT"));
	process.on("SIGTERM", () => cleanup("SIGTERM"));

	// Open browser after a short delay to let both servers start.
	setTimeout(() => openBrowser(deckUrl), 3000);

	console.log(`ompd: server on http://${host}:${serverPort}`);
	console.log(`ompd: vite   on ${deckUrl} (HMR)`);

	let exited = 0;
	for (const child of children) {
		child.on("exit", (code, signal) => {
			exited++;
			if (signal) {
				cleanup(signal);
				process.kill(process.pid, signal);
			} else if (exited === children.length) {
				process.exit(code ?? 0);
			} else {
				// One process died — kill the other so we don't leave orphans.
				cleanup("SIGTERM");
				process.exit(code ?? 1);
			}
		});
		child.on("error", (err) => {
			fail(`failed to spawn process: ${err.message}`);
		});
	}
}

main();
