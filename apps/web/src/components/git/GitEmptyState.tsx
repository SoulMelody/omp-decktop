import { useNavigate } from "react-router-dom";
import { GitBranch } from "lucide-react";

/**
 * Rendered when `gitCheck` reports the current workspace isn't a repo.
 * Routes the user to the Files view so they can pick a different cwd,
 * or shows the path they tried.
 */
interface Props {
	cwd: string;
}

export function GitEmptyState({ cwd }: Props) {
	const navigate = useNavigate();
	return (
		<div className="flex flex-1 items-center justify-center p-8">
			<div className="flex max-w-md flex-col items-center gap-3 text-center text-ink-2">
				<GitBranch className="h-10 w-10 text-ink-4" aria-hidden />
				<h2 className="text-sm font-semibold text-ink">Not a git repository</h2>
				<p className="text-2xs text-ink-3">
					<span className="font-mono text-ink-2">{cwd}</span> isn't a git repository (or any of its parents).
				</p>
				<button
					type="button"
					className="rounded-md bg-accent px-3 py-1.5 text-2xs font-medium text-white hover:opacity-90"
					onClick={() => navigate("/files")}
				>
					Switch workspace
				</button>
			</div>
		</div>
	);
}