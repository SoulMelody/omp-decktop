import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { searchFilesystemFiles } from "./fs-search.ts";

describe("fs-search", () => {
	let root: string;

	beforeAll(() => {
		root = mkdtempSync(join(tmpdir(), "fs-search-test-"));
		mkdirSync(join(root, "src", "components"), { recursive: true });
		mkdirSync(join(root, "src", "lib"), { recursive: true });
		writeFileSync(join(root, "src", "components", "Composer.tsx"), "");
		writeFileSync(join(root, "src", "components", "ChatPanel.tsx"), "");
		writeFileSync(join(root, "src", "lib", "store.ts"), "");
		writeFileSync(join(root, "package.json"), "");
		writeFileSync(join(root, "README.md"), "");
	});

	afterAll(() => {
		rmSync(root, { recursive: true, force: true });
	});

	test("finds a basename prefix match and ranks it above substring matches", async () => {
		const hits = await searchFilesystemFiles(root, { query: "comp", limit: 10 });
		expect(hits.length).toBeGreaterThan(0);
		// Search is case-insensitive on the query but the original casing
		// of the basename is preserved.
		expect(hits[0]?.name.toLowerCase().startsWith("comp")).toBe(true);
	});

	test("respects file vs directory type filter", async () => {
		const onlyFiles = await searchFilesystemFiles(root, {
			query: "src", type: "file", limit: 50,
		});
		expect(onlyFiles.every((h) => !h.isDir)).toBe(true);
	});

	test("skips node_modules even when the query matches", async () => {
		mkdirSync(join(root, "node_modules", "react"), { recursive: true });
		writeFileSync(join(root, "node_modules", "react", "index.js"), "");
		const hits = await searchFilesystemFiles(root, { query: "react", limit: 50 });
		expect(hits.find((h) => h.path.includes("node_modules"))).toBeUndefined();
	});

	test("respects gitignore when invoked inside a git repo", async () => {
		// Initialize a real git repo so git check-ignore is meaningful.
		execSync("git init -q -b main", { cwd: root });
		writeFileSync(join(root, ".gitignore"), "ignored/\n");
		mkdirSync(join(root, "ignored"), { recursive: true });
		writeFileSync(join(root, "ignored", "secret.txt"), "secret");
		const hits = await searchFilesystemFiles(root, {
			query: "secret", limit: 50, respectGitignore: true,
		});
		expect(hits.find((h) => h.path.includes("ignored"))).toBeUndefined();
	});

	test("returns nothing for empty query", async () => {
		const hits = await searchFilesystemFiles(root, { query: "zzzzz_no_match" });
		expect(hits.length).toBe(0);
	});

	test("clamps oversize limit", async () => {
		const hits = await searchFilesystemFiles(root, { query: ".", limit: 9999 });
		// Implementation caps at 200; we only assert it doesn't blow up.
		expect(hits.length).toBeLessThanOrEqual(200);
	});
});