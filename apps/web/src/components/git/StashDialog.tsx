import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { gitApi } from "@/lib/gitApi";
import { useStore } from "@/lib/store";

/**
 * Single-field dialog that creates a new stash. Always includes untracked
 * files (`-u`) — matches openchamber's behavior. Passes through any error
 * via toast and a blocking error line under the field.
 */

interface Props {
	open: boolean;
	cwd: string;
	onClose(): void;
	onDone(): void;
}

export function StashDialog({ open, cwd, onClose, onDone }: Props) {
	const pushLocalNotification = useStore((s) => s.pushLocalNotification);
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function submit(): Promise<void> {
		setBusy(true);
		setError(null);
		const r = await gitApi.stashPush(cwd, { message: message.trim() || undefined, includeUntracked: true });
		setBusy(false);
		if (r.kind === "ok") {
			setMessage("");
			onDone();
		} else {
			setError((r as { message: string }).message);
			pushLocalNotification({ level: "error", title: "Stash failed", body: (r as { message: string }).message });
		}
	}

	return (
		<Modal open={open} onClose={busy ? () => undefined : onClose} widthClass="max-w-sm">
			<form
				className="flex flex-col gap-3 p-4"
				onSubmit={(e) => { e.preventDefault(); void submit(); }}
			>
				<h2 className="text-sm font-semibold text-ink">Stash changes</h2>
				<p className="text-2xs text-ink-3">Includes untracked files. An empty message generates a default one.</p>
				<input
					type="text"
					autoFocus
					value={message}
					onChange={(e) => setMessage(e.target.value)}
					placeholder="optional message"
					className="rounded-md border border-line bg-paper px-2.5 py-1.5 font-mono text-xs text-ink outline-none focus:border-accent"
					disabled={busy}
				/>
				{error ? <p className="text-2xs text-rose-600">{error}</p> : null}
				<div className="flex justify-end gap-2">
					<button type="button" onClick={onClose} disabled={busy} className="rounded-md px-3 py-1 text-2xs text-ink-3 hover:bg-paper-2">Cancel</button>
					<button type="submit" disabled={busy} className="rounded-md bg-accent px-3 py-1 text-2xs font-medium text-white hover:opacity-90 disabled:opacity-50">Stash</button>
				</div>
			</form>
		</Modal>
	);
}