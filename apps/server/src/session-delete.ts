import { rm } from "node:fs/promises";
import * as path from "node:path";

/**
 * Decide whether `filePath` is a session JSONL file we're allowed to delete.
 *
 * Unlike a bare suffix check, this confines deletion to files under an allowed
 * root — the union of the user's home dir and the deck's configured workspace
 * roots — so a bug, or a surprising SDK-reported path, can't remove an
 * arbitrary file on disk. The path is always server-sourced (looked up from
 * `bridge.listSessions()`, never taken from client input); these checks are
 * defense-in-depth on top of that.
 *
 * Mirrors `isCwdAllowed` in `fs-allow.ts`, but validates a *file* (must resolve
 * under a root AND carry the `.jsonl` extension) rather than a directory.
 */
export function isSessionFilePathAllowed(filePath: string, allowedRoots: Iterable<string>): boolean {
	const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
	const roots: string[] = [];
	const seen = new Set<string>();
	const add = (raw: string): void => {
		if (!raw) return;
		let resolved: string;
		try {
			resolved = path.resolve(raw);
		} catch {
			return;
		}
		const key = resolved.toLowerCase();
		if (seen.has(key)) return;
		seen.add(key);
		roots.push(resolved);
	};
	add(home);
	for (const r of allowedRoots) add(r);
	if (roots.length === 0) return false;

	let resolved: string;
	try {
		resolved = path.resolve(filePath);
	} catch {
		return false;
	}
	if (!resolved.toLowerCase().endsWith(".jsonl")) return false;
	for (const root of roots) {
		const rel = path.relative(root, resolved);
		if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) return true;
	}
	return false;
}

/**
 * Permanently delete a session's on-disk JSONL history. No-ops on an empty
 * path. Throws if the path fails the allowed-root/extension guard, so a caller
 * that passes an unexpected path gets a 500 rather than silently deleting.
 * `rm` uses `force: true` so a missing file is not an error (the session may
 * have already been cleaned up).
 */
export async function deleteSessionFile(
	filePath: string | undefined,
	allowedRoots: Iterable<string>,
): Promise<void> {
	if (!filePath) return;
	if (!isSessionFilePathAllowed(filePath, allowedRoots)) {
		throw new Error("session file path is not under an allowed root");
	}
	await rm(path.resolve(filePath), { force: true });
}
