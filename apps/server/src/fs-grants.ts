/**
 * Outside-workspace grant tokens for write operations.
 *
 * Mirrors `outsideFileGrants` from openchamber: a caller can issue a
 * short-lived grant for a specific absolute path, then present that grant
 * as `grantToken` on a single fs-ops request. Each grant is single-use
 * (consumed atomically on verify) and path-scoped (mismatch is rejected).
 *
 * Grants live in-memory only — they are intentionally not persisted so a
 * server restart cannot leak tokens to a new requester.
 */

import { randomUUID } from "node:crypto";
import * as path from "node:path";

interface Grant {
	/** Absolute path this grant is scoped to (canonicalized). */
	path: string;
	expiresAt: number;
}

const grants = new Map<string, Grant>();

/** Default TTL when not specified by the caller. */
const DEFAULT_TTL_MS = 60_000;
/** Hard cap on TTL so a misconfigured caller can't lock a path for hours. */
const MAX_TTL_MS = 600_000;

export interface IssueGrantOptions {
	ttlMs?: number;
}

/**
 * Issue a grant token authorizing one write to `path`. Returns the token
 * string and its expiry timestamp (ms since epoch). `path` is canonicalized
 * via `path.resolve` so callers can't bypass the check by aliasing.
 */
export function issueGrant(path: string, opts: IssueGrantOptions = {}): { token: string; expiresAt: number } {
	const ttl = clampTtl(opts.ttlMs);
	const resolved = resolveSafe(path);
	if (!resolved) throw new Error("invalid path");
	const token = `grant_${randomUUID()}`;
	const expiresAt = Date.now() + ttl;
	grants.set(token, { path: resolved, expiresAt });
	return { token, expiresAt };
}

/**
 * Verify and consume a grant in a single atomic step. Returns the canonical
 * path the grant was scoped to on success, or `null` on any failure
 * (missing, expired, path mismatch). The grant is removed from the map
 * regardless of the path-match result so a wrong-path attempt still
 * invalidates the token.
 */
export function consumeGrant(token: string, requestedPath: string): string | null {
	const grant = grants.get(token);
	if (!grant) return null;
	// Always remove on first verify — single-use semantics. If it fails,
	// the caller must request a new grant.
	grants.delete(token);
	if (grant.expiresAt < Date.now()) return null;
	const resolved = resolveSafe(requestedPath);
	if (!resolved) return null;
	if (resolved !== grant.path) return null;
	return grant.path;
}

/** Test helper: number of live grants. Not exported through the route. */
export function _grantsSize(): number {
	return grants.size;
}

/** Test helper: prune expired grants without consuming them. */
export function _pruneExpired(now: number = Date.now()): number {
	let removed = 0;
	for (const [token, grant] of grants) {
		if (grant.expiresAt < now) {
			grants.delete(token);
			removed++;
		}
	}
	return removed;
}

function clampTtl(raw: number | undefined): number {
	// Fall back to default for invalid values; clamp valid values to MAX so a
	// misconfigured caller can't lock a path for hours.
	if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return DEFAULT_TTL_MS;
	return Math.min(raw, MAX_TTL_MS);
}

function resolveSafe(p: string): string | null {
	if (typeof p !== "string" || p.length === 0) return null;
	try {
		return path.resolve(p);
	} catch {
		return null;
	}
}