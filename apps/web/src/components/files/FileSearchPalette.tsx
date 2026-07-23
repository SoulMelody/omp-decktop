import { useEffect, useMemo, useRef, useState } from "react";
import type { FsEntryMeta } from "@omp-deck/protocol";
import { Search, File, Folder } from "lucide-react";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Quick-open palette for `Cmd/Ctrl+P`. Renders fuzzy matches from the
 * server's `/fs/search` endpoint with keyboard navigation (`↑`/`↓`/`Enter`
 * /`Esc`). Auto-refreshes the result list as the user types — debounced at
 * 150 ms to keep the typing latency low without flooding the server.
 */

interface Props {
	cwd: string;
	open: boolean;
	onClose: () => void;
	onOpenFile: (filePath: string) => void;
}

const DEBOUNCE_MS = 150;
const MIN_QUERY_LEN = 1;

export function FileSearchPalette({ cwd, open, onClose, onOpenFile }: Props) {
	const [query, setQuery] = useState("");
	const [hits, setHits] = useState<FsEntryMeta[]>([]);
	const [selected, setSelected] = useState(0);
	const [loading, setLoading] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	// Focus the input whenever the palette opens; reset state on close.
	useEffect(() => {
		if (open) {
			setQuery("");
			setHits([]);
			setSelected(0);
			setLoading(false);
			window.setTimeout(() => inputRef.current?.focus(), 0);
		}
	}, [open]);

	// Debounced server search. Cancels in-flight requests when a newer query
	// supersedes them.
	useEffect(() => {
		if (!open) return;
		if (query.length < MIN_QUERY_LEN) {
			setHits([]);
			return;
		}
		let cancelled = false;
		const t = window.setTimeout(() => {
			setLoading(true);
			api.searchFiles(cwd, query, { limit: 30 })
				.then((res) => {
					if (cancelled) return;
					setHits(res.ok ? res.hits : []);
					setSelected(0);
				})
				.finally(() => {
					if (!cancelled) setLoading(false);
				});
		}, DEBOUNCE_MS);
		return () => {
			cancelled = true;
			window.clearTimeout(t);
		};
	}, [cwd, query, open]);

	const visible = useMemo(() => hits.slice(0, 30), [hits]);

	function handleEnter(): void {
		const hit = visible[selected];
		if (!hit) return;
		onOpenFile(hit.path);
		onClose();
	}

	function handleKey(e: React.KeyboardEvent): void {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setSelected((s) => Math.min(visible.length - 1, s + 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setSelected((s) => Math.max(0, s - 1));
		} else if (e.key === "Enter") {
			e.preventDefault();
			handleEnter();
		} else if (e.key === "Escape") {
			e.preventDefault();
			onClose();
		}
	}

	if (!open) return null;
	return (
		<div
			className="fixed inset-0 z-50 flex items-start justify-center px-4 py-[18vh]"
			role="dialog"
			aria-label="Quick open file"
		>
			<button
				type="button"
				aria-label="Close"
				onClick={onClose}
				className="absolute inset-0 bg-ink/30 backdrop-blur-[1px]"
				tabIndex={-1}
			/>
			<div
				className="relative w-full max-w-xl overflow-hidden rounded-lg border border-line bg-paper shadow-[0_24px_64px_-16px_rgba(26,24,20,0.4)]"
				onKeyDown={handleKey}
			>
				<div className="flex items-center gap-2 border-b border-line px-3 py-2">
					<Search className="h-4 w-4 shrink-0 text-ink-4" />
					<input
						ref={inputRef}
						type="text"
						placeholder="Type to search files…"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-4"
					/>
					{loading ? <span className="text-2xs text-ink-4">searching…</span> : null}
				</div>
				<ul className="max-h-[40vh] overflow-y-auto py-1">
					{visible.length === 0 && query.length >= MIN_QUERY_LEN && !loading ? (
						<li className="px-3 py-2 text-2xs text-ink-4">No matches.</li>
					) : null}
					{visible.length === 0 && query.length < MIN_QUERY_LEN ? (
						<li className="px-3 py-2 text-2xs text-ink-4">Start typing to search.</li>
					) : null}
					{visible.map((hit, i) => (
						<li key={hit.path}>
							<button
								type="button"
								onClick={() => {
									setSelected(i);
									handleEnter();
								}}
								onMouseEnter={() => setSelected(i)}
								className={cn(
									"flex w-full items-center gap-2 px-3 py-1.5 text-left text-2xs",
									i === selected ? "bg-accent text-white" : "text-ink-2",
								)}
							>
								{hit.isDir ? (
									<Folder className="h-3.5 w-3.5 shrink-0" />
								) : (
									<File className="h-3.5 w-3.5 shrink-0" />
								)}
								<span className="flex-1 truncate font-mono">
									<Highlight text={hit.path} query={query} active={i === selected} />
								</span>
							</button>
						</li>
					))}
				</ul>
				<div className="flex items-center gap-3 border-t border-line px-3 py-1.5 text-2xs text-ink-4">
					<span><kbd className="font-mono">↑↓</kbd> navigate</span>
					<span><kbd className="font-mono">↵</kbd> open</span>
					<span><kbd className="font-mono">Esc</kbd> close</span>
				</div>
			</div>
		</div>
	);
}

/**
 * Highlight occurrences of `query` (case-insensitive) inside `text` so the
 * user can see why a file matched. The match uses a simple string-scan since
 * `query` is always short (typically 1–20 chars).
 */
function Highlight({ text, query, active }: { text: string; query: string; active: boolean }): React.ReactNode {
	if (!query) return text;
	const lowerText = text.toLowerCase();
	const lowerQ = query.toLowerCase();
	const segments: React.ReactNode[] = [];
	let i = 0;
	let matchIdx = lowerText.indexOf(lowerQ);
	let key = 0;
	while (matchIdx !== -1) {
		if (matchIdx > i) segments.push(text.slice(i, matchIdx));
		segments.push(
			<mark
				key={key++}
				className={cn(
					"rounded-sm px-0.5",
					active ? "bg-white/30 text-white" : "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
				)}
			>
				{text.slice(matchIdx, matchIdx + lowerQ.length)}
			</mark>,
		);
		i = matchIdx + lowerQ.length;
		matchIdx = lowerText.indexOf(lowerQ, i);
	}
	if (i < text.length) segments.push(text.slice(i));
	return segments;
}