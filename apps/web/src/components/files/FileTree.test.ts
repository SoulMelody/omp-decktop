import { describe, expect, test } from "bun:test";

import { updateTreeNode } from "./FileTree.tsx";

describe("updateTreeNode", () => {
	test("updates a nested directory without replacing unrelated roots", () => {
		const untouched = { entry: { name: "other", path: "other/", isDir: true }, children: null, loading: false };
		const nested = { entry: { name: "src", path: "src/", isDir: true }, children: null, loading: false };
		const root = { entry: { name: "apps", path: "apps/", isDir: true }, children: [nested], loading: false };

		const result = updateTreeNode([root, untouched], "src/", (node) => ({ ...node, loading: true }));

		expect(result[0]?.children?.[0]?.loading).toBe(true);
		expect(result[1]).toBe(untouched);
	});
});
