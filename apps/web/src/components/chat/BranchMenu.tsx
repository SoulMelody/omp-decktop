import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GitBranch, GitFork, Undo2 } from "lucide-react";

import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

interface BranchMenuProps {
	sessionId: string;
}

type Picker = null | "branch" | "rewind";

/**
 * Chat-header affordance for session forking + per-message branching/rewinding.
 *
 *  - `fork` copies the current conversation into a fresh session file in place
 *    (sessionId stays the same).
 *  - `branch` and `rewind` open a picker of every user message; the server's
 *    response is replayed through the `session_replaced` synthetic event, and
 *    any returned `selectedText`/`editorText` is pushed into the composer
 *    draft via `setPendingDraft` so the user can immediately edit the message
 *    they're now re-running.
 */
export function BranchMenu({ sessionId }: BranchMenuProps) {
	const { t } = useTranslation();
	const setPendingDraft = useStore((s) => s.setPendingDraft);
	const [picker, setPicker] = useState<Picker>(null);
	const [points, setPoints] = useState<{ entryId: string; text: string }[]>([]);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | undefined>(undefined);

	async function openPicker(mode: Exclude<Picker, null>): Promise<void> {
		setError(undefined);
		setBusy(true);
		try {
			const res = await api.branchPoints(sessionId);
			setPoints(res.points);
			setPicker(mode);
		} catch (e) {
			setError(t("chat.branch.error", { defaultValue: "Couldn't load branch points" }));
			console.warn("branchPoints failed", e);
		} finally {
			setBusy(false);
		}
	}

	async function runFork(): Promise<void> {
		setError(undefined);
		setBusy(true);
		try {
			await api.forkSession(sessionId);
		} catch (e) {
			setError(t("chat.branch.forkError", { defaultValue: "Fork failed" }));
			console.warn("fork failed", e);
		} finally {
			setBusy(false);
		}
	}

	async function choose(entryId: string): Promise<void> {
		if (!picker) return;
		setError(undefined);
		setBusy(true);
		try {
			if (picker === "branch") {
				const res = await api.branchSession(sessionId, entryId);
				if (res.selectedText) setPendingDraft({ text: res.selectedText });
			} else {
				const res = await api.rewindSession(sessionId, entryId);
				if (res.editorText) setPendingDraft({ text: res.editorText });
			}
			setPicker(null);
		} catch (e) {
			setError(t("chat.branch.error", { defaultValue: "Branch/rewind failed" }));
			console.warn("branch/rewind failed", e);
		} finally {
			setBusy(false);
		}
	}

	return (
		<>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				disabled={busy}
				onClick={() => void runFork()}
				title={t("chat.branch.fork", { defaultValue: "Fork" })}
				aria-label={t("chat.branch.fork", { defaultValue: "Fork" })}
			>
				<GitFork className="h-3.5 w-3.5" />
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				disabled={busy}
				onClick={() => void openPicker("branch")}
				title={t("chat.branch.branch", { defaultValue: "Branch" })}
				aria-label={t("chat.branch.branch", { defaultValue: "Branch" })}
			>
				<GitBranch className="h-3.5 w-3.5" />
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				disabled={busy}
				onClick={() => void openPicker("rewind")}
				title={t("chat.branch.rewind", { defaultValue: "Rewind" })}
				aria-label={t("chat.branch.rewind", { defaultValue: "Rewind" })}
			>
				<Undo2 className="h-3.5 w-3.5" />
			</Button>

			<Modal
				open={picker !== null}
				onClose={() => {
					if (!busy) setPicker(null);
				}}
				widthClass="max-w-xl"
			>
				<div className="border-b border-line px-3 py-2 text-2xs uppercase tracking-meta text-ink-3">
					{picker === "branch"
						? t("chat.branch.branchTitle", { defaultValue: "Branch from a user message" })
						: t("chat.branch.rewindTitle", { defaultValue: "Rewind to a user message" })}
				</div>
				<div className="max-h-[60vh] divide-y divide-line overflow-auto">
					{points.length === 0 ? (
						<div className="px-3 py-4 text-sm text-ink-3">
							{t("chat.branch.empty", { defaultValue: "No user messages yet." })}
						</div>
					) : (
						points.map((p) => (
							<button
								key={p.entryId}
								type="button"
								disabled={busy}
								onClick={() => void choose(p.entryId)}
								className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-paper-3/60 disabled:opacity-50"
							>
								{p.text || p.entryId}
							</button>
						))
					)}
				</div>
				{error ? (
					<div className="border-t border-line bg-danger/10 px-3 py-2 font-mono text-2xs text-danger">{error}</div>
				) : null}
			</Modal>
		</>
	);
}
