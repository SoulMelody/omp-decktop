import { layoutGraph } from "./gitGraph";

/**
 * Tiny ASCII-ish commit graph rendered alongside the history rows. Keeps
 * the deck from feeling like a plain text dump without dragging in a real
 * graph layout engine.
 */

interface Props {
	shas: string[];
}

export function GitGraphSegment({ shas }: Props) {
	const layout = layoutGraph(shas);
	if (layout.rows.length === 0) return null;
	return (
		<div className="flex flex-col font-mono text-2xs leading-[1.5] text-ink-4" aria-hidden>
			{layout.rows.map((row, i) => {
				const next = layout.rows[i + 1];
				const char = row.hasChild ? "│" : " ";
				return (
					<div key={row.sha} className="flex items-center gap-0">
						{Array.from({ length: layout.laneCount }).map((_, lane) => (
							<span key={lane} className="inline-block w-3 text-center">
								{row.lane === lane ? (next ? "●" : "○") : (next && lane === row.lane ? char : " ")}
							</span>
						))}
					</div>
				);
			})}
		</div>
	);
}