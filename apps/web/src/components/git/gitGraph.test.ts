import { describe, expect, test } from "bun:test";

import { layoutGraph } from "./gitGraph.ts";

describe("layoutGraph", () => {
	test("empty list returns one-lane empty graph", () => {
		expect(layoutGraph([])).toEqual({ rows: [], laneCount: 1 });
	});

	test("single commit sits in lane 0 with no edges", () => {
		const r = layoutGraph(["a"]);
		expect(r.laneCount).toBe(1);
		expect(r.rows[0]).toEqual({ sha: "a", lane: 0, hasChild: false, hasParent: false });
	});

	test("linear history connects each row", () => {
		const r = layoutGraph(["a", "b", "c"]);
		expect(r.rows).toHaveLength(3);
		expect(r.rows[0]?.hasChild).toBe(true);
		expect(r.rows[1]?.hasParent).toBe(true);
		expect(r.rows[1]?.hasChild).toBe(true);
		expect(r.rows[2]?.hasParent).toBe(true);
		expect(r.rows[2]?.hasChild).toBe(false);
	});
});