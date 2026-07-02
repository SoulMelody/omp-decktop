import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Config } from "./config.ts";
import { buildFsReadRouter } from "./routes-fs-read.ts";
type TreeEntry = { name: string; path: string; isDir: boolean };
type TreeResponse = { ok: true; entries: TreeEntry[] } | { ok: false; error: string };

function testConfig(root: string): Config {
	return {
		host: "127.0.0.1",
		port: 0,
		defaultCwd: root,
		extraWorkspaces: [],
		devMode: true,
		idleTimeoutMs: 0,
		dbPath: join(root, "deck.db"),
		uploadsRoot: join(root, "uploads"),
		autoStartCommand: null,
	};
}

describe("/fs/tree", () => {
	let root: string;

	beforeAll(() => {
		root = mkdtempSync(join(tmpdir(), "fs-tree-test-"));
		mkdirSync(join(root, "dir", "nested"), { recursive: true });
		writeFileSync(join(root, "alpha.txt"), "alpha");
		writeFileSync(join(root, "dir", "nested", "deep.txt"), "deep");
	});

	afterAll(() => {
		rmSync(root, { recursive: true, force: true });
	});

	test("lists only direct children for the requested directory", async () => {
		const app = buildFsReadRouter(testConfig(root));

		const res = await app.request(`/fs/tree?cwd=${encodeURIComponent(root)}`);
		const body = await res.json() as TreeResponse;

		expect(body).toMatchObject({ ok: true });
		if (!body.ok) throw new Error(body.error);
		expect(body.entries.map((entry) => entry.path)).toEqual(["dir/", "alpha.txt"]);
		expect(body.entries.some((entry) => entry.path.includes("deep.txt"))).toBe(false);
	});

	test("does not stat files while building directory entries", async () => {
		const app = buildFsReadRouter(testConfig(root));

		const res = await app.request(`/fs/tree?cwd=${encodeURIComponent(root)}`);
		const body = await res.json() as TreeResponse;

		expect(body).toMatchObject({ ok: true });
		if (!body.ok) throw new Error(body.error);
		expect(body.entries.find((entry) => entry.path === "alpha.txt")).toEqual({
			name: "alpha.txt",
			path: "alpha.txt",
			isDir: false,
		});
	});
});
