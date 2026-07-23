import { describe, expect, test } from "bun:test";

import { basename, dirname, joinPath } from "./fs-paths.ts";

describe("fs-paths", () => {
	test("basename returns the last path segment", () => {
		expect(basename("src/components/FilesView.tsx")).toBe("FilesView.tsx");
		expect(basename("README.md")).toBe("README.md");
		expect(basename("")).toBe("");
	});

	test("basename normalizes backslashes", () => {
		expect(basename("src\\components\\App.tsx")).toBe("App.tsx");
	});

	test("dirname returns the parent path", () => {
		expect(dirname("src/components/FilesView.tsx")).toBe("src/components");
		expect(dirname("solo.ts")).toBe("");
		expect(dirname("")).toBe("");
	});

	test("joinPath joins parent + child with a single slash", () => {
		expect(joinPath("src", "foo.ts")).toBe("src/foo.ts");
		expect(joinPath("src/", "foo.ts")).toBe("src/foo.ts");
		expect(joinPath("", "foo.ts")).toBe("foo.ts");
		expect(joinPath("src/components", "App.tsx")).toBe("src/components/App.tsx");
	});

	test("joinPath doesn't double-slash when parent ends with /", () => {
		const result = joinPath("a/b/", "c.ts");
		expect(result).not.toContain("//");
		expect(result).toBe("a/b/c.ts");
	});
});