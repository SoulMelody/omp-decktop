import { useState } from "react";
import { GitBranch, ChevronDown, Plus, Trash2, Edit3 } from "lucide-react";
import type { GitBranchInfo, GitBranchCreateRequest } from "@omp-deck/protocol";

import { Modal } from "@/components/ui/Modal";
import { gitApi } from "@/lib/gitApi";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Drop-down branch picker with create / delete / rename affordances. The
 * destructive actions live in a confirmation modal so a misclick doesn't
 * lose work. Lists both local and remote branches; remotes are prefixed
 * with their remote name to avoid name collisions.
 */

interface Props {
	cwd: string;
	current: string;
	branches: { local: GitBranchInfo[]; remote: GitBranchInfo[] };
	onChange: () => void;
}

export function BranchSelector({ cwd, current, branches, onChange }: Props) {
	const pushLocalNotification = useStore((s) => s.pushLocalNotification);
	const [open, setOpen] = useState(false);
	const [creating, setCreating] = useState(false);
	const [renaming, setRenaming] = useState<string | null>(null);
	const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

	async function checkout(name: string): Promise<void> {
		setOpen(false);
		const r = await gitApi.checkout(cwd, name);
		if (r.kind === "ok") {
			pushLocalNotification({ level: "info", title: `Switched to ${name}` });
			onChange();
		} else {
			pushLocalNotification({ level: "error", title: "Checkout failed", body: r.message });
		}
	}

	async function deleteBranch(name: string, force: boolean): Promise<void> {
		setConfirmDelete(null);
		const r = await gitApi.deleteBranch(cwd, name, { force, confirm: force });
		if (r.kind === "ok") {
			pushLocalNotification({ level: "info", title: `Deleted ${name}` });
			onChange();
		} else {
			pushLocalNotification({ level: "error", title: "Delete failed", body: r.message });
		}
	}

	return (
		<div className="relative">
			<button
				type="button"
				className="flex items-center gap-1 rounded-md border border-line bg-paper px-2 py-0.5 text-2xs text-ink-2 hover:bg-paper-2"
				onClick={() => setOpen((v) => !v)}
			>
				<GitBranch className="h-3 w-3" />
				<span className="font-mono">{current}</span>
				<ChevronDown className="h-3 w-3 text-ink-4" />
			</button>
			{open ? (
				<div className="absolute right-0 top-full z-10 mt-1 w-72 rounded-md border border-line bg-paper shadow-[0_12px_32px_-8px_rgba(26,24,20,0.4)]">
					<div className="flex items-center justify-between border-b border-line px-2 py-1 text-2xs text-ink-4">
						<span>Branches</span>
						<button
							type="button"
							className="flex items-center gap-0.5 rounded px-1 hover:bg-paper-2 hover:text-ink-2"
							onClick={() => { setOpen(false); setCreating(true); }}
						>
							<Plus className="h-3 w-3" /> new
						</button>
					</div>
					<ul className="max-h-[40vh] overflow-y-auto py-1">
						{branches.local.length === 0 ? <li className="px-2 py-1 text-2xs text-ink-4">No local branches</li> : null}
						{branches.local.map((b) => (
							<BranchRow
								key={b.name}
								name={b.name}
								isCurrent={b.isCurrent}
								onCheckout={() => void checkout(b.name)}
								onRename={() => { setOpen(false); setRenaming(b.name); }}
								onDelete={() => setConfirmDelete(b.name)}
							/>
						))}
						{branches.remote.length > 0 ? (
							<>
								<li className="mt-1 border-t border-line px-2 py-1 text-2xs text-ink-4">Remote</li>
								{branches.remote.map((b) => (
									<BranchRow
										key={`remote-${b.name}`}
										name={`${b.name}`}
										remote={true}
										isCurrent={false}
										onCheckout={() => void checkout(b.name)}
										onRename={null}
										onDelete={null}
									/>
								))}
							</>
						) : null}
					</ul>
				</div>
			) : null}

			{creating ? (
				<CreateBranchDialog
					cwd={cwd}
					onClose={() => setCreating(false)}
					onDone={() => { setCreating(false); onChange(); }}
				/>
			) : null}
			{renaming ? (
				<RenameBranchDialog
					cwd={cwd}
					oldName={renaming}
					onClose={() => setRenaming(null)}
					onDone={() => { setRenaming(null); onChange(); }}
				/>
			) : null}
			{confirmDelete ? (
				<ConfirmDeleteBranch
					name={confirmDelete}
					onClose={() => setConfirmDelete(null)}
					onConfirm={(force) => void deleteBranch(confirmDelete, force)}
				/>
			) : null}
		</div>
	);
}

function BranchRow({
	name, remote, isCurrent, onCheckout, onRename, onDelete,
}: {
	name: string;
	remote?: boolean;
	isCurrent: boolean;
	onCheckout: () => void;
	onRename: (() => void) | null;
	onDelete: (() => void) | null;
}) {
	return (
		<li className={cn("group flex items-center gap-1 px-2 py-0.5 text-2xs hover:bg-paper-2", isCurrent && "bg-paper-2")}>
			<button
				type="button"
				className="flex-1 truncate text-left font-mono"
				onClick={onCheckout}
			>
				<span className={cn(isCurrent ? "text-accent" : "text-ink-2")}>{name}</span>
				{remote ? <span className="ml-1 text-2xs text-ink-4">(remote)</span> : null}
			</button>
			{onRename ? (
				<button
					type="button"
					aria-label={`Rename ${name}`}
					className="hidden h-5 w-5 items-center justify-center rounded text-ink-4 hover:bg-paper-3 hover:text-ink-2 group-hover:flex"
					onClick={(e) => { e.stopPropagation(); onRename(); }}
				>
					<Edit3 className="h-3 w-3" />
				</button>
			) : null}
			{onDelete ? (
				<button
					type="button"
					aria-label={`Delete ${name}`}
					className="hidden h-5 w-5 items-center justify-center rounded text-ink-4 hover:bg-rose-50 hover:text-rose-600 group-hover:flex"
					onClick={(e) => { e.stopPropagation(); onDelete(); }}
				>
					<Trash2 className="h-3 w-3" />
				</button>
			) : null}
		</li>
	);
}

function CreateBranchDialog({ cwd, onClose, onDone }: { cwd: string; onClose: () => void; onDone: () => void }) {
	const [name, setName] = useState("");
	const [startPoint, setStartPoint] = useState("");
	const [busy, setBusy] = useState(false);
	async function submit(): Promise<void> {
		setBusy(true);
		const body: GitBranchCreateRequest = { cwd, name: name.trim(), startPoint: startPoint.trim() || undefined, checkout: true };
		const r = await gitApi.createBranch(cwd, body.name, { startPoint: body.startPoint, checkout: body.checkout });
		setBusy(false);
		if (r.kind === "ok") onDone();
		else alert((r as { message: string }).message);
	}
	return (
		<Modal open onClose={onClose} widthClass="max-w-sm">
			<form
				className="flex flex-col gap-3 p-4"
				onSubmit={(e) => { e.preventDefault(); void submit(); }}
			>
				<h2 className="text-sm font-semibold text-ink">New branch</h2>
				<input
					type="text"
					autoFocus
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="branch-name"
					className="rounded-md border border-line bg-paper px-2.5 py-1.5 font-mono text-xs text-ink outline-none focus:border-accent"
				/>
				<input
					type="text"
					value={startPoint}
					onChange={(e) => setStartPoint(e.target.value)}
					placeholder="start point (optional, e.g. main)"
					className="rounded-md border border-line bg-paper px-2.5 py-1.5 font-mono text-xs text-ink-2 outline-none focus:border-accent"
				/>
				<div className="flex justify-end gap-2">
					<button type="button" onClick={onClose} className="rounded-md px-3 py-1 text-2xs text-ink-3 hover:bg-paper-2">Cancel</button>
					<button type="submit" disabled={busy || !name.trim()} className="rounded-md bg-accent px-3 py-1 text-2xs font-medium text-white hover:opacity-90 disabled:opacity-50">Create</button>
				</div>
			</form>
		</Modal>
	);
}

function RenameBranchDialog({ cwd, oldName, onClose, onDone }: { cwd: string; oldName: string; onClose: () => void; onDone: () => void }) {
	const [name, setName] = useState(oldName);
	const [busy, setBusy] = useState(false);
	async function submit(): Promise<void> {
		setBusy(true);
		const r = await gitApi.renameBranch(cwd, oldName, name.trim());
		setBusy(false);
		if (r.kind === "ok") onDone();
		else alert((r as { message: string }).message);
	}
	return (
		<Modal open onClose={onClose} widthClass="max-w-sm">
			<form
				className="flex flex-col gap-3 p-4"
				onSubmit={(e) => { e.preventDefault(); void submit(); }}
			>
				<h2 className="text-sm font-semibold text-ink">Rename branch</h2>
				<p className="text-2xs text-ink-3">
					from <span className="font-mono text-ink-2">{oldName}</span>
				</p>
				<input
					type="text"
					autoFocus
					value={name}
					onChange={(e) => setName(e.target.value)}
					className="rounded-md border border-line bg-paper px-2.5 py-1.5 font-mono text-xs text-ink outline-none focus:border-accent"
				/>
				<div className="flex justify-end gap-2">
					<button type="button" onClick={onClose} className="rounded-md px-3 py-1 text-2xs text-ink-3 hover:bg-paper-2">Cancel</button>
					<button type="submit" disabled={busy || !name.trim() || name === oldName} className="rounded-md bg-accent px-3 py-1 text-2xs font-medium text-white hover:opacity-90 disabled:opacity-50">Rename</button>
				</div>
			</form>
		</Modal>
	);
}

function ConfirmDeleteBranch({ name, onClose, onConfirm }: { name: string; onClose: () => void; onConfirm: (force: boolean) => void }) {
	const [force, setForce] = useState(false);
	return (
		<Modal open onClose={onClose} widthClass="max-w-sm">
			<div className="flex flex-col gap-3 p-4">
				<h2 className="text-sm font-semibold text-ink">Delete branch</h2>
				<p className="text-2xs text-ink-3">
					Delete <span className="font-mono text-ink-2">{name}</span>?
					{force ? " This discards any commits that aren't reachable from elsewhere." : null}
				</p>
				<label className="flex items-center gap-2 text-2xs text-ink-3">
					<input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
					Force-delete (discard unmerged commits)
				</label>
				<div className="flex justify-end gap-2">
					<button type="button" onClick={onClose} className="rounded-md px-3 py-1 text-2xs text-ink-3 hover:bg-paper-2">Cancel</button>
					<button
						type="button"
						onClick={() => onConfirm(force)}
						className={force
							? "rounded-md bg-rose-700 px-3 py-1 text-2xs font-medium text-white hover:bg-rose-800"
							: "rounded-md bg-rose-600 px-3 py-1 text-2xs font-medium text-white hover:bg-rose-700"}
					>
						Delete
					</button>
				</div>
			</div>
		</Modal>
	);
}