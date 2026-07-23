import { useState } from "react";
import { Archive, X } from "lucide-react";
import type { GitStashEntry } from "@omp-deck/protocol";

import { gitApi } from "@/lib/gitApi";
import { useStore } from "@/lib/store";

/**
 * Modal showing every stash entry with per-row Apply / Pop / Drop. Pop and
 * Apply both reload the underlying status (caller passes `onChange`).
 */

interface Props {
	open: boolean;
	cwd: string;
	entries: GitStashEntry[];
	onClose(): void;
	onChange(): void;
}

export function StashesDialog({ open, cwd, entries, onClose, onChange }: Props) {
	const pushLocalNotification = useStore((s) => s.pushLocalNotification);
	const [busy, setBusy] = useState<string | null>(null);

	async function act(ref: string, op: "apply" | "pop" | "drop"): Promise<void> {
		setBusy(ref);
		try {
			let r;
			if (op === "apply") r = await gitApi.stashApply(cwd, ref);
			else if (op === "pop") r = await gitApi.stashPop(cwd, ref);
			else r = await gitApi.stashDrop(cwd, ref);
			if (r.kind === "ok") {
				pushLocalNotification({ level: "info", title: `Stash ${op === "drop" ? "dropped" : "applied"}` });
				onChange();
			} else {
				pushLocalNotification({ level: "error", title: `Stash ${op} failed`, body: (r as { message: string }).message });
			}
		} finally {
			setBusy(null);
		}
	}

	if (!open) return null;
	return (
		<div className="fixed inset-0 z-50 flex items-start justify-center px-4 py-[10vh]" role="dialog" aria-modal="true">
			<button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/30 backdrop-blur-[1px]" tabIndex={-1} />
			<div className="relative flex w-full max-w-xl flex-col overflow-hidden rounded-lg border border-line bg-paper shadow-[0_24px_64px_-16px_rgba(26,24,20,0.4)]">
				<header className="flex items-center justify-between border-b border-line px-3 py-2">
					<h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
						<Archive className="h-4 w-4" /> Stashes
					</h2>
					<button type="button" onClick={onClose} className="rounded-md p-1 text-ink-4 hover:bg-paper-2" aria-label="Close">
						<X className="h-4 w-4" />
					</button>
				</header>
				<ul className="max-h-[50vh] divide-y divide-line overflow-y-auto">
					{entries.length === 0 ? (
						<li className="px-3 py-6 text-center text-2xs text-ink-4">No stashes.</li>
					) : entries.map((e) => (
						<li key={e.ref} className="flex items-center gap-2 px-3 py-2 text-2xs">
							<span className="font-mono text-ink-4">{e.ref}</span>
							<span className="flex-1 truncate text-ink-2">{e.subject}</span>
							{["apply", "pop", "drop"].map((op) => (
								<button
									key={op}
									type="button"
									disabled={busy === e.ref}
									className="rounded border border-line px-2 py-0.5 text-2xs capitalize text-ink-2 hover:bg-paper-2 disabled:opacity-50"
									onClick={() => void act(e.ref, op as "apply" | "pop" | "drop")}
								>
									{op}
								</button>
							))}
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}