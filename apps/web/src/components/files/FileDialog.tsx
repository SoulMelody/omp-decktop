import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";

/**
 * Unified create / rename / delete dialog for tree-node operations. The
 * caller picks the variant via `variant` and supplies the relevant labels.
 * Errors from the server surface inline; the submit button stays disabled
 * while a request is in flight so the user can't double-submit.
 */

export type FileDialogVariant = "create-file" | "create-folder" | "rename" | "delete";

interface Props {
	open: boolean;
	variant: FileDialogVariant;
	/** Path of the parent (for create) or of the node itself (for rename/delete). */
	path: string;
	/** Default name to pre-fill (e.g. "untitled.ts" for create, current name for rename). */
	defaultName?: string;
	/** Current name (used to derive the rename placeholder + delete label). */
	currentName?: string;
	onClose: () => void;
	onSubmit: (input: { name: string; parent: string }) => Promise<void> | void;
}

const TITLES: Record<FileDialogVariant, string> = {
	"create-file": "New File",
	"create-folder": "New Folder",
	"rename": "Rename",
	"delete": "Delete",
};

export function FileDialog({ open, variant, path, defaultName = "", currentName = "", onClose, onSubmit }: Props) {
	const [name, setName] = useState(defaultName);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Reset when the dialog opens so the field is always fresh.
	useEffect(() => {
		if (open) {
			setName(defaultName);
			setSubmitting(false);
			setError(null);
		}
	}, [open, defaultName]);

	const isDelete = variant === "delete";
	const label = TITLES[variant];

	async function handleSubmit(): Promise<void> {
		setSubmitting(true);
		setError(null);
		try {
			const trimmed = name.trim();
			if (!isDelete && !trimmed) {
				setError("name is required");
				setSubmitting(false);
				return;
			}
			// Delete only needs the path; rename/create pass the new name + parent.
			const parent = isDelete ? path : trimTrailingSlash(path);
			await onSubmit({ name: isDelete ? "" : trimmed, parent });
			onClose();
		} catch (err) {
			setError((err as Error)?.message ?? "operation failed");
			setSubmitting(false);
		}
	}

	return (
		<Modal open={open} onClose={onClose} widthClass="max-w-md" dismissOnBackdrop={!submitting}>
			<form
				className="flex flex-col gap-3 p-5"
				onSubmit={(e) => {
					e.preventDefault();
					void handleSubmit();
				}}
			>
				<h2 className="text-sm font-semibold text-ink">{label}</h2>
				{isDelete ? (
					<p className="text-2xs text-ink-3">
						Delete <span className="font-mono text-ink-2">{currentName || path}</span>? This cannot be undone.
					</p>
				) : (
					<>
						<p className="text-2xs text-ink-3">
							{variant === "create-file" || variant === "create-folder" ? (
								<>in <span className="font-mono text-ink-2">{path || "/"}</span></>
							) : (
								<>rename <span className="font-mono text-ink-2">{currentName}</span></>
							)}
						</p>
						<input
							type="text"
							autoFocus
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder={variant === "rename" ? currentName : (variant === "create-file" ? "untitled.ts" : "new-folder")}
							className="rounded-md border border-line bg-paper px-2.5 py-1.5 font-mono text-xs text-ink outline-none focus:border-accent"
							disabled={submitting}
						/>
					</>
				)}
				{error ? <p className="text-2xs text-rose-600">{error}</p> : null}
				<div className="flex justify-end gap-2 pt-1">
					<button
						type="button"
						className="rounded-md px-3 py-1 text-2xs text-ink-3 hover:bg-paper-2"
						onClick={onClose}
						disabled={submitting}
					>
						Cancel
					</button>
					<button
						type="submit"
						className={
							isDelete
								? "rounded-md bg-rose-600 px-3 py-1 text-2xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
								: "rounded-md bg-accent px-3 py-1 text-2xs font-medium text-white hover:opacity-90 disabled:opacity-50"
						}
						disabled={submitting || (!isDelete && !name.trim())}
					>
						{isDelete ? "Delete" : label}
					</button>
				</div>
			</form>
		</Modal>
	);
}

function trimTrailingSlash(p: string): string {
	return p.endsWith("/") ? p.slice(0, -1) : p;
}