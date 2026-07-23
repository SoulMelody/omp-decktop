import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Multi-line commit message editor. Two side-by-side action buttons: plain
 * commit, or commit-and-push. The input grows up to 8 lines tall, then
 * scrolls internally. Both buttons stay disabled when the message is empty
 * or no staged rows exist (the caller passes that signal in).
 */

interface Props {
	disabled: boolean;
	busy: boolean;
	onCommit(message: string, pushAfter: boolean): Promise<void> | void;
	/** AI-suggested message; user clicks a small "✨" button to accept it. */
	aiSuggestion?: string | null;
	onRequestAiSuggestion?(): void;
}

export function CommitSection({ disabled, busy, onCommit, aiSuggestion, onRequestAiSuggestion }: Props) {
	const { t } = useTranslation();
	const [message, setMessage] = useState("");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		// When the AI emits a suggestion, accept it as the current message.
		if (aiSuggestion) setMessage(aiSuggestion);
	}, [aiSuggestion]);

	async function commit(pushAfter: boolean): Promise<void> {
		const trimmed = message.trim();
		if (!trimmed) {
			setError(t("files.commitMessageRequired", "commit message is required"));
			return;
		}
		setError(null);
		try {
			await onCommit(trimmed, pushAfter);
			setMessage("");
		} catch (err) {
			setError((err as Error)?.message ?? "commit failed");
		}
	}

	return (
		<div className="flex flex-col gap-2 border-t border-line bg-paper p-2">
			<textarea
				value={message}
				onChange={(e) => { setMessage(e.target.value); setError(null); }}
				placeholder="Commit message"
				rows={3}
				spellCheck={false}
				className={cn(
					"block w-full resize-y rounded-md border border-line bg-paper px-2 py-1.5 font-mono text-2xs text-ink outline-none",
					"focus:border-accent disabled:opacity-50",
				)}
				style={{ minHeight: 60, maxHeight: 160 }}
				disabled={disabled || busy}
			/>
			{error ? <p className="text-2xs text-rose-600">{error}</p> : null}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-1">
					{onRequestAiSuggestion ? (
						<button
							type="button"
							className="rounded-md border border-line bg-paper px-2 py-1 text-2xs text-ink-2 hover:bg-paper-2 disabled:opacity-50"
							disabled={disabled || busy}
							onClick={() => onRequestAiSuggestion()}
							title="Generate commit message"
						>
							✨ Suggest
						</button>
					) : null}
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						className="flex items-center gap-1 rounded-md border border-line bg-paper px-2 py-1 text-2xs text-ink-2 hover:bg-paper-2 disabled:opacity-50"
						disabled={disabled || busy || !message.trim()}
						onClick={() => void commit(false)}
					>
						{busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
						Commit
					</button>
					<button
						type="button"
						className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-2xs font-medium text-white hover:opacity-90 disabled:opacity-50"
						disabled={disabled || busy || !message.trim()}
						onClick={() => void commit(true)}
					>
						Commit &amp; push
					</button>
				</div>
			</div>
		</div>
	);
}