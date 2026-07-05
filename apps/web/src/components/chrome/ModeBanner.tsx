import type { GoalModeContextWire } from "@omp-deck/protocol";
import type { SessionUi } from "@/lib/types";

interface Props {
	mode: SessionUi["mode"];
	goalMode?: GoalModeContextWire;
}

export function ModeBanner({ mode, goalMode }: Props) {
	if (!mode && !goalMode) return null;
	return (
		<section className="border-b border-line px-4 py-4">
			<div className="meta mb-2">Mode</div>
			<div className="space-y-1.5 font-mono text-2xs">
				{mode ? (
					<div className="flex items-center gap-1.5">
						<span className="text-accent">{mode.mode}</span>
						{mode.data && typeof mode.data === "object" && "planFile" in (mode.data as Record<string, unknown>) ? (
							<span className="truncate text-ink-3 normal-case tracking-normal">
								{String((mode.data as Record<string, unknown>).planFile)}
							</span>
						) : null}
					</div>
				) : null}
				{goalMode ? (
					<div className="text-ink-2 normal-case tracking-normal">
						<span className="text-ink-3">goal: </span>
						<span className="text-accent">{goalMode.status}</span>
						<span className="text-ink-3"> — </span>
						<span className="truncate">{goalMode.objective}</span>
					</div>
				) : null}
			</div>
		</section>
	);
}
