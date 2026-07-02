import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, beforeAll, afterAll } from "bun:test";

import { isCwdAllowed } from "./fs-allow.ts";

describe("isCwdAllowed", () => {
	let tmp: string;
	let tmpInside: string;
	let originalHome: string | undefined;

	beforeAll(() => {
		tmp = mkdtempSync(join(tmpdir(), "fs-allow-test-"));
		tmpInside = join(tmp, "inside");
		mkdirSync(tmpInside, { recursive: true });
		// Force HOME to a known allowed root so we exercise the home-fallback branch.
		originalHome = process.env.HOME;
		process.env.HOME = tmp;
	});

	afterAll(() => {
		if (originalHome === undefined) delete process.env.HOME;
		else process.env.HOME = originalHome;
		rmSync(tmp, { recursive: true, force: true });
	});

	it("allows a cwd that is the home root itself", () => {
		expect(isCwdAllowed(tmp, [])).toBe(true);
	});

	it("allows a cwd under the home root", () => {
		expect(isCwdAllowed(tmpInside, [])).toBe(true);
	});
	it("rejects a cwd outside any allowed root", () => {
		// Sibling of `tmp` — `..\elsewhere` resolves out of tmp entirely.
		const saved = process.env.HOME;
		process.env.HOME = "";
		try {
			expect(isCwdAllowed(join(tmp, "..", "elsewhere"), [tmp])).toBe(false);
		} finally {
			process.env.HOME = saved;
		}
	});

	it("accepts any one of multiple allowed roots", () => {
		const a = join(tmp, "a");
		const b = join(tmp, "b");
		mkdirSync(a, { recursive: true });
		mkdirSync(b, { recursive: true });
		expect(isCwdAllowed(a, [a, b])).toBe(true);
		expect(isCwdAllowed(b, [a, b])).toBe(true);
		// Sibling of a/b must not match — temporarily clear HOME so only a/b count.
		const saved = process.env.HOME;
		process.env.HOME = "";
		try {
			expect(isCwdAllowed(tmpInside, [a, b])).toBe(false);
		} finally {
			process.env.HOME = saved;
		}
	});

	it("rejects a cwd that does not exist", () => {
		expect(isCwdAllowed(join(tmp, "does", "not", "exist"), [tmp])).toBe(false);
	});

	it("rejects when cwd is a file, not a directory", () => {
		const filePath = join(tmp, "a-file.txt");
		writeFileSync(filePath, "x");
		expect(isCwdAllowed(filePath, [tmp])).toBe(false);
	});
});
