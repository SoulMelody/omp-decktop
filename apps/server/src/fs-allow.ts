import { existsSync, statSync } from "node:fs";
import * as path from "node:path";

/**
 * Decide whether `cwd` is allowed for fs picker/read routes. The deck is
 * loopback-only at the transport layer, but the picker should still refuse to
 * walk system dirs at the request layer.
 *
 * `allowedRoots` is the union of home + the server's configured default cwd +
 * any explicit extra workspaces. Roots are resolved and deduped inside the
 * function, so callers can pass un-normalized config values directly.
 *
 * A cwd that resolves under any allowed root AND exists as a directory
 * counts as allowed. Anything else (or a missing directory) is rejected.
 */
export function isCwdAllowed(cwd: string, allowedRoots: Iterable<string>): boolean {
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

	try {
		const resolved = path.resolve(cwd);
		if (!existsSync(resolved) || !statSync(resolved).isDirectory()) return false;
		for (const root of roots) {
			const rel = path.relative(root, resolved);
			if (!rel.startsWith("..") && !path.isAbsolute(rel)) return true;
		}
		return false;
	} catch {
		return false;
	}
}