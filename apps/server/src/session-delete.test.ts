import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { deleteSessionFile, isSessionFilePathAllowed } from "./session-delete.ts";

let root: string | null = null;

// On Windows `os.tmpdir()` lives under USERPROFILE, which the guard treats as an
// implicit allowed root (mirroring `isCwdAllowed`). That would make the "outside
// every root" cases below spuriously pass. Clear home for the whole suite so the
// only allowed roots are the ones each test passes explicitly; restore after.
const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_USERPROFILE = process.env.USERPROFILE;

beforeEach(() => {
	delete process.env.HOME;
	delete process.env.USERPROFILE;
	root = fs.mkdtempSync(path.join(os.tmpdir(), "omp-deck-session-delete-"));
});

afterEach(() => {
	if (ORIGINAL_HOME !== undefined) process.env.HOME = ORIGINAL_HOME;
	if (ORIGINAL_USERPROFILE !== undefined) process.env.USERPROFILE = ORIGINAL_USERPROFILE;
	if (root) {
		try {
			fs.rmSync(root, { recursive: true, force: true });
		} catch {
			// Windows FS handles can lag; leaking a temp dir is fine.
		}
		root = null;
	}
});

describe("isSessionFilePathAllowed", () => {
	test("accepts a .jsonl file under an allowed root", () => {
		const ws = path.join(root!, "workspace");
		const file = path.join(ws, "session.jsonl");
		expect(isSessionFilePathAllowed(file, [ws])).toBe(true);
	});

	test("accepts a nested .jsonl file under an allowed root", () => {
		const ws = path.join(root!, "workspace");
		const file = path.join(ws, ".omp", "sessions", "abc.jsonl");
		expect(isSessionFilePathAllowed(file, [ws])).toBe(true);
	});

	test("rejects a path outside every allowed root", () => {
		const ws = path.join(root!, "workspace");
		const outside = path.join(root!, "elsewhere", "session.jsonl");
		expect(isSessionFilePathAllowed(outside, [ws])).toBe(false);
	});

	test("rejects a parent-traversal escape", () => {
		const ws = path.join(root!, "workspace");
		const escape = path.join(ws, "..", "secret.jsonl");
		expect(isSessionFilePathAllowed(escape, [ws])).toBe(false);
	});

	test("rejects a non-jsonl file even under an allowed root", () => {
		const ws = path.join(root!, "workspace");
		const file = path.join(ws, "secrets.env");
		expect(isSessionFilePathAllowed(file, [ws])).toBe(false);
	});

	test("rejects when there are no allowed roots and no home", () => {
		const prevHome = process.env.HOME;
		const prevProfile = process.env.USERPROFILE;
		delete process.env.HOME;
		delete process.env.USERPROFILE;
		try {
			expect(isSessionFilePathAllowed(path.join(root!, "s.jsonl"), [])).toBe(false);
		} finally {
			if (prevHome !== undefined) process.env.HOME = prevHome;
			if (prevProfile !== undefined) process.env.USERPROFILE = prevProfile;
		}
	});
});

describe("deleteSessionFile", () => {
	test("removes an allowed session file", async () => {
		const ws = path.join(root!, "workspace");
		fs.mkdirSync(ws, { recursive: true });
		const file = path.join(ws, "session.jsonl");
		fs.writeFileSync(file, "{}\n");
		expect(fs.existsSync(file)).toBe(true);

		await deleteSessionFile(file, [ws]);
		expect(fs.existsSync(file)).toBe(false);
	});

	test("no-ops on an empty path", async () => {
		await deleteSessionFile(undefined, [root!]);
		await deleteSessionFile("", [root!]);
		// No throw = pass.
	});

	test("does not throw when the file is already gone", async () => {
		const ws = path.join(root!, "workspace");
		fs.mkdirSync(ws, { recursive: true });
		const file = path.join(ws, "missing.jsonl");
		await deleteSessionFile(file, [ws]);
		expect(fs.existsSync(file)).toBe(false);
	});

	test("throws — and does not delete — for a path outside allowed roots", async () => {
		const ws = path.join(root!, "workspace");
		const outsideDir = path.join(root!, "elsewhere");
		fs.mkdirSync(outsideDir, { recursive: true });
		const outside = path.join(outsideDir, "session.jsonl");
		fs.writeFileSync(outside, "{}\n");

		await expect(deleteSessionFile(outside, [ws])).rejects.toThrow(/allowed root/);
		expect(fs.existsSync(outside)).toBe(true);
	});

	test("throws for a non-jsonl file", async () => {
		const ws = path.join(root!, "workspace");
		fs.mkdirSync(ws, { recursive: true });
		const file = path.join(ws, "secrets.env");
		fs.writeFileSync(file, "TOKEN=1");

		await expect(deleteSessionFile(file, [ws])).rejects.toThrow(/allowed root/);
		expect(fs.existsSync(file)).toBe(true);
	});
});
