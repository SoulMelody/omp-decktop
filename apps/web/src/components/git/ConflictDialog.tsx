import { File, X } from "lucide-react";

/**
 * Surfaces a merge/rebase/cherry-pick conflict in three sections:
 *   1. header with the operation name
 *   2. the conflicted file list with per-file resolution choices
 *   3. footer with abort + continue actions
 *
 * Resolution actions are intentionally minimal — the deck ships the
 * "open in editor" path (which already understands `<<<<<<<` markers) so
 * the user has full control. The dialog exposes a global abort and a
 * "Continue" button that the parent enables once the user has staged all
 * resolved files.
 */

interface ConflictFile {
	path: string;
	oursLabel: string;
	theirsLabel: string;
	hunks: number;
}

interface Props {
	operation: "merge" | "rebase" | "cherry-pick" | "revert";
	files: ConflictFile[];
	open: boolean;
	onClose(): void;
	onAbort(): void;
	onContinue(): void;
	onOpenFile?(path: string): void;
}

export function ConflictDialog({ operation, files, open, onClose, onAbort, onContinue, onOpenFile }: Props) {
	if (!open) return null;
	return (
		<div className="fixed inset-0 z-50 flex items-start justify-center px-4 py-[10vh]" role="dialog" aria-modal="true">
			<button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/30 backdrop-blur-[1px]" tabIndex={-1} />
			<div className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-line bg-paper shadow-[0_24px_64px_-16px_rgba(26,24,20,0.4)]">
				<header className="flex items-center justify-between border-b border-line px-3 py-2">
					<h2 className="text-sm font-semibold text-ink">{labelFor(operation)} conflicts</h2>
					<button type="button" onClick={onClose} className="rounded-md p-1 text-ink-4 hover:bg-paper-2" aria-label="Close">
						<X className="h-4 w-4" />
					</button>
				</header>
				<div className="max-h-[50vh] overflow-y-auto px-2 py-2">
					{files.length === 0 ? (
						<p className="px-2 py-3 text-2xs text-ink-3">
							No unmerged paths. All conflicts resolved.
						</p>
					) : (
						<ul className="divide-y divide-line">
							{files.map((f) => (
								<li key={f.path} className="flex items-center gap-2 px-2 py-1.5 text-2xs">
									<File className="h-3 w-3 shrink-0 text-ink-4" />
									<span className="flex-1 truncate font-mono text-ink-2">{f.path}</span>
									<span className="text-ink-4">{f.hunks} hunks</span>
									{onOpenFile ? (
										<button
											type="button"
											className="rounded border border-line px-2 py-0.5 text-2xs hover:bg-paper-2"
											onClick={() => onOpenFile(f.path)}
										>
											Open
										</button>
									) : null}
								</li>
							))}
						</ul>
					)}
				</div>
				<footer className="flex items-center justify-end gap-2 border-t border-line bg-paper-2 px-3 py-2">
					<button
						type="button"
						className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1 text-2xs text-rose-700 hover:bg-rose-100"
						onClick={onAbort}
					>
						Abort {labelFor(operation).toLowerCase()}
					</button>
					<button
						type="button"
						className="rounded-md bg-accent px-3 py-1 text-2xs font-medium text-white hover:opacity-90 disabled:opacity-50"
						disabled={files.length > 0}
						onClick={onContinue}
					>
						Continue
					</button>
				</footer>
			</div>
		</div>
	);
}

function labelFor(op: ConflictDialogProps["operation"]): string {
	return op.charAt(0).toUpperCase() + op.slice(1);
}

type ConflictDialogProps = Props;