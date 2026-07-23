import { describe, expect, test, beforeEach } from "bun:test";

import { issueGrant, consumeGrant, _grantsSize, _pruneExpired } from "./fs-grants.ts";

describe("fs-grants", () => {
	beforeEach(() => {
		// Drop any leftover grants between tests so the size assertion below is hermetic.
		_pruneExpired(Number.MAX_SAFE_INTEGER);
	});

	test("issues a grant that returns the same canonical path on verify", () => {
		const { token, expiresAt } = issueGrant("/tmp/a/b.txt", { ttlMs: 5000 });
		expect(token.startsWith("grant_")).toBe(true);
		expect(expiresAt).toBeGreaterThan(Date.now());
		const verified = consumeGrant(token, "/tmp/a/../a/b.txt");
		expect(verified).toBe("/tmp/a/b.txt");
	});

	test("rejects reuse (single-use)", () => {
		const { token } = issueGrant("/tmp/file.txt");
		expect(consumeGrant(token, "/tmp/file.txt")).toBe("/tmp/file.txt");
		expect(consumeGrant(token, "/tmp/file.txt")).toBeNull();
	});

	test("rejects mismatched path", () => {
		const { token } = issueGrant("/tmp/one.txt");
		expect(consumeGrant(token, "/tmp/two.txt")).toBeNull();
		// Even after a mismatch, the grant is consumed.
		expect(_grantsSize()).toBe(0);
	});

	test("rejects unknown token", () => {
		expect(consumeGrant("grant_unknown", "/tmp/x")).toBeNull();
	});

	test("rejects expired grant", () => {
		const { token } = issueGrant("/tmp/old.txt", { ttlMs: 1 });
		// Force the wall clock past expiry instead of sleeping — makes the
		// test immune to clock-resolution quirks.
		_pruneExpired(Date.now() + 1000);
		expect(consumeGrant(token, "/tmp/old.txt")).toBeNull();
	});

	test("clamps ttl to default and to max", () => {
		const a = issueGrant("/tmp/a", { ttlMs: -10 });
		const b = issueGrant("/tmp/b", { ttlMs: 9_999_999_999 });
		// Negative ttl falls back to default 60s.
		expect(a.expiresAt).toBeGreaterThan(Date.now() + 30_000);
		expect(a.expiresAt).toBeLessThanOrEqual(Date.now() + 60_000 + 100);
		// Oversized ttl clamps to MAX (600s).
		expect(b.expiresAt).toBeLessThanOrEqual(Date.now() + 600_000 + 100);
		expect(b.expiresAt).toBeGreaterThan(Date.now() + 100_000);
	});

	test("rejects empty path", () => {
		expect(() => issueGrant("")).toThrow();
	});

	test("_pruneExpired drops only expired entries", () => {
		const { token: t1 } = issueGrant("/tmp/x", { ttlMs: 60_000 });
		const { token: t2 } = issueGrant("/tmp/y", { ttlMs: 1 });
		// Pass `now` explicitly so the test is deterministic regardless of
		// the wall clock resolution.
		const removed = _pruneExpired(Date.now() + 1000);
		expect(removed).toBe(1);
		expect(_grantsSize()).toBe(1);
		// The live one is still consumable.
		expect(consumeGrant(t1, "/tmp/x")).toBe("/tmp/x");
		// The pruned one is gone.
		expect(consumeGrant(t2, "/tmp/y")).toBeNull();
	});
});