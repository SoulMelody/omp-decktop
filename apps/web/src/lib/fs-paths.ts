/**
 * Pure path utilities used by `FilesView` and the file-tree components.
 * All functions operate on forward-slash paths (the server normalizes to
 * forward slashes in its responses; the client only needs to keep that
 * invariant on the way out).
 */

export function basename(fp: string): string {
	const parts = fp.replace(/\\/g, "/").split("/");
	return parts[parts.length - 1] ?? fp;
}

export function dirname(p: string): string {
	const idx = p.lastIndexOf("/");
	return idx === -1 ? "" : p.slice(0, idx);
}

export function joinPath(parent: string, child: string): string {
	if (!parent) return child;
	if (parent.endsWith("/")) return `${parent}${child}`;
	return `${parent}/${child}`;
}