import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Save, AlertTriangle } from "lucide-react";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Plain-text in-place editor. Sprint 2 ships a textarea + line-number gutter;
 * Sprint 5 swaps the textarea for Monaco. Same props either way so callers
 * don't change. The component owns:
 *
 *   - dirty tracking (debounced autosave at 750 ms)
 *   - 409 stale detection via the `expectedSha256` round-trip
 *   - explicit save via toolbar button or `Ctrl/Cmd+S`
 */

interface Props {
	cwd: string;
	filePath: string;
	/** Initial content (already loaded by `FilePreview`). */
	initialContent: string;
	/** Initial sha256 used for stale detection on save. */
	initialSha256: string;
	/** Read-only mime (e.g. "image/png"); binary files render a viewer, not the editor. */
	mime: string;
}

const AUTOSAVE_MS = 750;
const LINE_HEIGHT_REM = 1.5;

export function Editor({ cwd, filePath, initialContent, initialSha256, mime }: Props) {
	const [content, setContent] = useState(initialContent);
	const [savedContent, setSavedContent] = useState(initialContent);
	const [sha256, setSha256] = useState(initialSha256);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [stale, setStale] = useState<{ serverSha256: string; serverSize: number } | null>(null);

	const taRef = useRef<HTMLTextAreaElement>(null);
	const dirty = content !== savedContent;

	// Detect Ctrl/Cmd+S to trigger an explicit save.
	useEffect(() => {
		function onKey(e: KeyboardEvent): void {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
				e.preventDefault();
				void save();
			}
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [content, sha256]);

	// Autosave on idle: debounce 750 ms after the last edit.
	useEffect(() => {
		if (!dirty) return;
		const t = window.setTimeout(() => { void save(); }, AUTOSAVE_MS);
		return () => window.clearTimeout(t);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [content]);

	const lineCount = useMemo(() => content.split(/\r?\n/).length, [content]);

	async function save(): Promise<void> {
		if (saving) return;
		setSaving(true);
		setError(null);
		try {
			const res = await api.writeFile(cwd, filePath, content, { expectedSha256: sha256 });
			if (res.ok) {
				setSavedContent(content);
				setSha256(res.sha256);
				setStale(null);
			} else if ("stale" in res && res.stale) {
				setStale(res.stale);
				setError("file changed on disk — reload before saving");
			} else {
				setError(res.error);
			}
		} catch (err) {
			setError((err as Error)?.message ?? "save failed");
		} finally {
			setSaving(false);
		}
	}

	async function reloadFromDisk(): Promise<void> {
		try {
			const res = await api.openEditor(cwd, filePath);
			if (res.ok) {
				setContent(res.content);
				setSavedContent(res.content);
				setSha256(res.sha256);
				setStale(null);
				setError(null);
			} else {
				setError(res.error);
			}
		} catch (err) {
			setError((err as Error)?.message ?? "reload failed");
		}
	}

	function saveAnyway(): void {
		// Bypass the stale check by sending no expectedSha256.
		void (async () => {
			setSaving(true);
			setError(null);
			try {
				const res = await api.writeFile(cwd, filePath, content);
				if (res.ok) {
					setSavedContent(content);
					setSha256(res.sha256);
					setStale(null);
				} else {
					setError(res.error);
				}
			} catch (err) {
				setError((err as Error)?.message ?? "save failed");
			} finally {
				setSaving(false);
			}
		})();
	}

	const isBinary = mime.startsWith("image/") || mime === "application/octet-stream";
	if (isBinary) {
		return (
			<div className="flex flex-1 items-center justify-center text-2xs text-ink-3">
				Binary files ({mime}) can&apos;t be edited in-app. Use the viewer pane.
			</div>
		);
	}

	return (
		<div className="flex flex-1 flex-col min-h-0">
			<div className="flex items-center justify-between gap-2 border-b border-line bg-paper px-3 py-1.5 text-2xs text-ink-3">
				<div className="flex items-center gap-3 truncate">
					<span className="font-mono text-ink-2 truncate">{filePath}</span>
					<span className="tabular-nums">{lineCount} lines</span>
					{dirty && !saving ? <span className="text-amber-600">● unsaved</span> : null}
					{saving ? (
						<span className="flex items-center gap-1 text-ink-4">
							<Loader2 className="h-3 w-3 animate-spin" /> saving…
						</span>
					) : null}
				</div>
				<div className="flex items-center gap-2">
					{stale ? (
						<>
							<button
								type="button"
								className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-2xs text-amber-800 hover:bg-amber-100"
								onClick={() => void reloadFromDisk()}
							>
								Reload
							</button>
							<button
								type="button"
								className="rounded-md border border-rose-300 bg-rose-50 px-2 py-0.5 text-2xs text-rose-800 hover:bg-rose-100"
								onClick={saveAnyway}
							>
								Save anyway
							</button>
						</>
					) : (
						<button
							type="button"
							disabled={!dirty || saving}
							className={cn(
								"flex items-center gap-1 rounded-md px-2 py-0.5 text-2xs",
								dirty
									? "bg-accent text-white hover:opacity-90"
									: "border border-line text-ink-4 cursor-not-allowed",
							)}
							onClick={() => void save()}
						>
							<Save className="h-3 w-3" /> Save
						</button>
					)}
				</div>
			</div>
			{stale ? (
				<div className="flex items-center gap-2 border-b border-amber-300 bg-amber-50 px-3 py-1 text-2xs text-amber-800">
					<AlertTriangle className="h-3 w-3" />
					File changed on disk — sha256 no longer matches.
				</div>
			) : null}
			{error && !stale ? (
				<div className="border-b border-rose-300 bg-rose-50 px-3 py-1 text-2xs text-rose-800">
					{error}
				</div>
			) : null}
			<div className="flex flex-1 min-h-0 font-mono text-2xs leading-[1.5]">
				<div
					aria-hidden
					className="select-none border-r border-line bg-paper-2 px-2 py-2 text-right text-ink-4"
					style={{ minWidth: "3em" }}
				>
					{Array.from({ length: lineCount }, (_, i) => (
						<div key={i + 1} style={{ lineHeight: `${LINE_HEIGHT_REM}rem` }}>{i + 1}</div>
					))}
				</div>
				<textarea
					ref={taRef}
					value={content}
					onChange={(e) => setContent(e.target.value)}
					spellCheck={false}
					className="flex-1 resize-none bg-paper p-2 text-ink outline-none"
					style={{ lineHeight: `${LINE_HEIGHT_REM}rem` }}
				/>
			</div>
		</div>
	);
}