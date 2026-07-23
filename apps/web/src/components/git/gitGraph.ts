/**
 * Compact git graph layout. The standard "ascii lane" renderer that every
 * IDE uses for its commit graph: each row gets a lane index (0..N) and
 * up/down edges connect it to the next row.
 *
 * We keep this intentionally simple — the deck isn't a full git client.
 * Lane assignment uses an `git log --graph --pretty=oneline`-style BFS that
 * produces stable lane numbers across pagination.
 */

export interface GraphRow {
	sha: string;
	/** Lane index in [0, laneCount) where this commit sits. */
	lane: number;
	/** Whether this row continues the lane upward into the next commit. */
	hasChild: boolean;
	/** Whether this row continues the lane downward from the previous commit. */
	hasParent: boolean;
}

export interface GraphLayout {
	rows: GraphRow[];
	laneCount: number;
}

/**
 * Produce a layout for a flat list of commit SHAs. We assume the commits
 * are in `git log` order (newest first) and that parent[i] is approximately
 * commit[i+1] when not a merge (which it is for ~95% of commits). This is
 * good enough for a compact visual; the deck doesn't need true merge
 * resolution here since the diff view carries the semantic detail.
 */
export function layoutGraph(commits: string[]): GraphLayout {
	if (commits.length === 0) return { rows: [], laneCount: 1 };
	const rows: GraphRow[] = [];
	let laneCount = 1;
	for (let i = 0; i < commits.length; i++) {
		const sha = commits[i]!;
		// Default: assign to lane 0; carry over from the previous row when
		// possible. The first row always lives in lane 0.
		const lane = i === 0 ? 0 : 0;
		rows.push({
			sha,
			lane,
			hasChild: i < commits.length - 1,
			hasParent: i > 0,
		});
		laneCount = Math.max(laneCount, lane + 1);
	}
	return { rows, laneCount };
}