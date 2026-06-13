import { watch, type FSWatcher } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

import { prepareLocalizedWebRoot } from "./prepare.ts";

const repoRoot = process.cwd();
const watchedRoots = [
	path.join(repoRoot, "apps", "web", "src"),
	path.join(repoRoot, "apps", "web", "public"),
	path.join(repoRoot, "localization"),
];
const watchedFiles = [
	path.join(repoRoot, "apps", "web", "index.html"),
	path.join(repoRoot, "apps", "web", "tailwind.config.ts"),
	path.join(repoRoot, "apps", "web", "postcss.config.cjs"),
];

const watchers = new Map<string, FSWatcher>();
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let rescanTimer: ReturnType<typeof setTimeout> | null = null;
let isSyncing = false;
let syncQueued = false;

void main().catch((error) => {
	console.error("[l10n:watch] failed:", error);
	process.exitCode = 1;
});

async function main(): Promise<void> {
	console.log("[l10n:watch] initial sync...");
	await prepareLocalizedWebRoot({ clean: false });
	await installWatchers();
	console.log("[l10n:watch] watching apps/web/src -> .generated/web-root-i18n");
}

async function installWatchers(): Promise<void> {
	const targets = new Set<string>();

	for (const root of watchedRoots) {
		for (const dir of await collectDirectories(root)) targets.add(dir);
	}
	for (const file of watchedFiles) targets.add(file);

	for (const [target, watcher] of watchers) {
		if (targets.has(target)) continue;
		watcher.close();
		watchers.delete(target);
	}

	for (const target of targets) {
		if (watchers.has(target)) continue;
		try {
			const watcher = watch(target, (_eventType, filename) => {
				const changed = filename ? path.join(target, filename.toString()) : target;
				console.log(`[l10n:watch] change: ${path.relative(repoRoot, changed)}`);
				scheduleSync();
				scheduleRescan();
			});
			watchers.set(target, watcher);
		} catch (error) {
			console.warn(`[l10n:watch] watch failed for ${target}:`, error);
		}
	}
}

async function collectDirectories(root: string): Promise<string[]> {
	const dirs = [root];
	const entries = await readdir(root, { withFileTypes: true });
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "dist-zh" || entry.name === ".generated") {
			continue;
		}
		dirs.push(...await collectDirectories(path.join(root, entry.name)));
	}
	return dirs;
}

function scheduleSync(): void {
	if (syncTimer) clearTimeout(syncTimer);
	syncTimer = setTimeout(() => {
		syncTimer = null;
		void runSync();
	}, 100);
}

function scheduleRescan(): void {
	if (rescanTimer) clearTimeout(rescanTimer);
	rescanTimer = setTimeout(() => {
		rescanTimer = null;
		void installWatchers();
	}, 220);
}

async function runSync(): Promise<void> {
	if (isSyncing) {
		syncQueued = true;
		return;
	}

	isSyncing = true;
	try {
		await prepareLocalizedWebRoot({ clean: false });
		console.log("[l10n:watch] regenerated localized web root");
	} catch (error) {
		console.error("[l10n:watch] regenerate failed:", error);
	} finally {
		isSyncing = false;
		if (syncQueued) {
			syncQueued = false;
			void runSync();
		}
	}
}
