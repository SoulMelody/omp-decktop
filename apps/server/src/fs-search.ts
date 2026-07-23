/**
 * Fuzzy filesystem search used by `GET /fs/search`.
 *
 * Scoring rules (lower is better, ties broken by path depth then alpha):
 *   0 — exact basename match
 *   1 — basename prefix match
 *   2 — basename substring match
 *   3 — path prefix match
 *   4 — path substring match
 *
 * Hidden directories (leading `.`) are skipped unless the query itself
 * starts with `.`, so users can still type `.gitignore` without the picker
 * walking every dotdir. Results respect an optional `respectGitignore`
 * flag that shells out to `git check-ignore` for each candidate.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import * as path from "node:path";

export interface SearchHit {
	path: string;       // forward-slash relative to root
	name: string;       // basename
	isDir: boolean;
	isFile: boolean;
	isSymlink: boolean;
}

export interface SearchOptions {
	type?: "file" | "directory" | "all";
	dirs?: boolean;
	limit?: number;
	respectGitignore?: boolean;
	query: string;
}

const SKIP_DIRS = new Set([
	"node_modules", ".git", "target", "dist", "build",
	".next", ".turbo", ".cache", ".bun", "__pycache__",
	"venv", ".venv", ".pytest_cache", "coverage", ".nyc_output",
]);

const MAX_ENTRIES = 50_000;

/**
 * Walk `root` and return up to `limit` hits matching `opts.query`. The
 * search is intentionally case-insensitive and forward-slash-only so the
 * web client can render results without platform-specific handling.
 */
export async function searchFilesystemFiles(
	root: string,
	opts: SearchOptions,
): Promise<SearchHit[]> {
	const limit = clampLimit(opts.limit ?? 50);
	const wantDirs = opts.dirs ?? false;
	const type = opts.type ?? (wantDirs ? "all" : "file");
	const lowerQ = opts.query.toLowerCase();
	const includeHidden = lowerQ.startsWith(".");
	const entries: InventoryEntry[] = [];
	walk(root, "", entries, includeHidden);
	if (entries.length === 0) return [];

	let filtered = entries;
	if (type !== "all") {
		filtered = filtered.filter((e) => (type === "directory" ? e.isDir : !e.isDir));
	}

	let scored: Scored[] = filtered
		.map((e) => {
			const tier = scoreTier(e, lowerQ);
			if (tier === -1) return null;
			return { e, tier };
		})
		.filter((s): s is Scored => s !== null);

	if (scored.length === 0) return [];

	scored.sort((a, b) => {
		if (a.tier !== b.tier) return a.tier - b.tier;
		const da = a.e.path.split("/").length;
		const db = b.e.path.split("/").length;
		if (da !== db) return da - db;
		return a.e.path.localeCompare(b.e.path);
	});

	const trimmed = scored.slice(0, limit);

	if (opts.respectGitignore !== false && existsSync(path.join(root, ".git"))) {
		return await filterGitignored(root, trimmed);
	}

	return trimmed.map((s) => toHit(s.e));
}

// ─── Inventory ─────────────────────────────────────────────────────────────

interface InventoryEntry {
	path: string;        // forward slashes, relative to root
	name: string;
	isDir: boolean;
	isFile: boolean;
	isSymlink: boolean;
}

interface Scored { e: InventoryEntry; tier: number }

function walk(root: string, rel: string, out: InventoryEntry[], includeHidden: boolean): void {
	if (out.length >= MAX_ENTRIES) return;
	const abs = rel ? path.join(root, rel) : root;
	let dirents;
	try {
		dirents = readdirSync(abs, { withFileTypes: true });
	} catch {
		return;
	}
	for (const d of dirents) {
		if (out.length >= MAX_ENTRIES) return;
		if (d.name === "." || d.name === "..") continue;
		const hidden = d.name.startsWith(".");
		if (hidden && !includeHidden) continue;
		if (d.isDirectory() && SKIP_DIRS.has(d.name)) continue;
		const sub = rel ? `${rel}/${d.name}` : d.name;
		let isFile = false;
		let isDir = d.isDirectory();
		let isSymlink = d.isSymbolicLink();
		if (isSymlink) {
			try {
				const st = statSync(path.join(root, sub));
				isDir = st.isDirectory();
				isFile = st.isFile();
			} catch {
				// dangling symlink — leave the flags as-is.
			}
		} else if (!isDir) {
			isFile = true;
		}
		out.push({ path: sub, name: d.name, isDir, isFile, isSymlink });
		if (isDir) walk(root, sub, out, includeHidden);
	}
}

function scoreTier(e: InventoryEntry, q: string): number {
	const name = e.name.toLowerCase();
	const p = e.path.toLowerCase();
	if (name === q) return 0;
	if (name.startsWith(q)) return 1;
	if (name.includes(q)) return 2;
	if (p.startsWith(q)) return 3;
	if (p.includes(q)) return 4;
	return -1;
}

function toHit(e: InventoryEntry): SearchHit {
	return {
		path: e.path,
		name: e.name,
		isDir: e.isDir,
		isFile: e.isFile,
		isSymlink: e.isSymlink,
	};
}

// ─── gitignore filter ──────────────────────────────────────────────────────

/**
 * Spawn `git check-ignore --stdin` and feed each candidate path on stdin.
 * The process exits 0 if any path was ignored, 1 if none were, 128 if git
 * isn't available. We swallow non-zero exits and treat them as "no filter
 * applied" so a missing git binary doesn't break search.
 */
async function filterGitignored(root: string, scored: Scored[]): Promise<SearchHit[]> {
	if (scored.length === 0) return [];
	return new Promise<SearchHit[]>((resolve) => {
		const proc = spawn("git", ["check-ignore", "--stdin"], {
			cwd: root,
			stdio: ["pipe", "pipe", "pipe"],
		});
		let stdout = "";
		let resolved = false;
		const done = (hits: SearchHit[]) => {
			if (resolved) return;
			resolved = true;
			resolve(hits);
		};

		proc.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		proc.on("error", () => done(scored.map((s) => toHit(s.e))));
		proc.on("close", () => {
			// git check-ignore prints one ignored path per line. Anything
			// not in the output is considered not-ignored.
			const ignored = new Set(stdout.split("\n").map((s) => s.trim()).filter(Boolean));
			const filtered = scored
				.filter((s) => !ignored.has(s.e.path))
				.map((s) => toHit(s.e));
			done(filtered);
		});

		try {
			for (const s of scored) {
				proc.stdin.write(`${s.e.path}\n`);
			}
			proc.stdin.end();
		} catch {
			done(scored.map((s) => toHit(s.e)));
		}
	});
}

function clampLimit(raw: number): number {
	if (!Number.isFinite(raw) || raw <= 0) return 50;
	return Math.max(1, Math.min(200, Math.trunc(raw)));
}