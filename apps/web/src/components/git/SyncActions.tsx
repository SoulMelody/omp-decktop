import { useState } from "react";
import { ArrowDown, ArrowUp, RefreshCw, Loader2 } from "lucide-react";

import { gitApi } from "@/lib/gitApi";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Three-button cluster for fetching from the remote, pulling the upstream,
 * and pushing local commits. Each button shows a spinner while in flight.
 * Push surfaces a confirmation dialog when the server reports a non-fast-
 * forward rejection so the user can opt into `--force-with-lease`.
 */

interface Props {
	cwd: string;
}

export function SyncActions({ cwd }: Props) {
	const pushLocalNotification = useStore((s) => s.pushLocalNotification);
	const [busy, setBusy] = useState<null | "fetch" | "pull" | "push">(null);
	const [forceConfirm, setForceConfirm] = useState<{ remote?: string; branch?: string; reason: string } | null>(null);

	async function withBusy(name: "fetch" | "pull" | "push", fn: () => Promise<void>): Promise<void> {
		setBusy(name);
		try { await fn(); } finally { setBusy(null); }
	}

	function notifyError(title: string, r: { message: string }): void {
		pushLocalNotification({ level: "error", title, body: r.message });
	}

	async function doFetch(): Promise<void> {
		const r = await gitApi.fetch(cwd, { prune: true });
		if (r.kind !== "ok") notifyError("Fetch failed", r);
		else pushLocalNotification({ level: "info", title: "Fetched" });
	}
	async function doPull(rebase: boolean): Promise<void> {
		const r = await gitApi.pull(cwd, { rebase });
		if (r.kind === "conflict") {
			pushLocalNotification({ level: "warn", title: "Pull produced conflicts", body: r.message });
		} else if (r.kind !== "ok") {
			notifyError("Pull failed", r);
		} else {
			pushLocalNotification({ level: "info", title: "Pulled" });
		}
	}
	async function doPush(force: "no" | "lease" = "no", remote?: string, branch?: string): Promise<void> {
		setForceConfirm(null);
		const r = await gitApi.push(cwd, { force, remote, branch, confirm: force === "lease" });
		if (r.kind === "rejected") {
			setForceConfirm({ remote, branch, reason: r.message });
		} else if (r.kind !== "ok") {
			notifyError("Push failed", r);
		} else {
			pushLocalNotification({ level: "info", title: r.value.setUpstream ? "Pushed (upstream set)" : "Pushed" });
		}
	}

	return (
		<div className="flex items-center gap-1">
			<button
				type="button"
				className={btnCls}
				disabled={busy !== null}
				onClick={() => void withBusy("fetch", doFetch)}
				title="Fetch from remote"
			>
				{busy === "fetch" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
			</button>
			<button
				type="button"
				className={btnCls}
				disabled={busy !== null}
				onClick={() => void withBusy("pull", () => doPull(false))}
				title="Pull (fast-forward only)"
			>
				{busy === "pull" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowDown className="h-3 w-3" />}
			</button>
			<button
				type="button"
				className={btnCls}
				disabled={busy !== null}
				onClick={() => void withBusy("push", () => doPush("no"))}
				title="Push to remote"
			>
				{busy === "push" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowUp className="h-3 w-3" />}
			</button>
			{forceConfirm ? (
				<ForcePushConfirm
					remote={forceConfirm.remote}
					branch={forceConfirm.branch}
					reason={forceConfirm.reason}
					onClose={() => setForceConfirm(null)}
					onConfirm={() => void doPush("lease", forceConfirm.remote, forceConfirm.branch)}
				/>
			) : null}
		</div>
	);
}

const btnCls = cn(
	"flex h-6 w-6 items-center justify-center rounded-md border border-line bg-paper text-ink-2 transition-colors",
	"hover:bg-paper-2 disabled:cursor-not-allowed disabled:opacity-50",
);

function ForcePushConfirm({ remote, branch, reason, onClose, onConfirm }: { remote?: string; branch?: string; reason: string; onClose: () => void; onConfirm: () => void }) {
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4" role="dialog">
			<div className="w-full max-w-sm rounded-lg border border-line bg-paper p-4 shadow-[0_24px_64px_-16px_rgba(26,24,20,0.4)]">
				<h2 className="text-sm font-semibold text-ink">Force push required</h2>
				<p className="mt-1 text-2xs text-ink-3">
					Remote rejected the push: <span className="font-mono text-ink-2">{reason}</span>
				</p>
				<p className="mt-1 text-2xs text-ink-3">
					Use <span className="font-mono">--force-with-lease</span> to overwrite the remote only if no one else has pushed in the meantime.
					{remote ? <> Target: <span className="font-mono">{remote}</span></> : null}
					{branch ? <> Branch: <span className="font-mono">{branch}</span></> : null}
				</p>
				<div className="mt-3 flex justify-end gap-2">
					<button type="button" onClick={onClose} className="rounded-md px-3 py-1 text-2xs text-ink-3 hover:bg-paper-2">Cancel</button>
					<button type="button" onClick={onConfirm} className="rounded-md bg-rose-600 px-3 py-1 text-2xs font-medium text-white hover:bg-rose-700">
						Force with lease
					</button>
				</div>
			</div>
		</div>
	);
}