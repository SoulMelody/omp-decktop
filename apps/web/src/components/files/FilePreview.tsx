import { useEffect, useState } from "react";
import type { FileTab } from "@/views/FilesView";
import type { FsReadResponse } from "@/lib/types";
import { api } from "@/lib/api";
import { CodeViewer } from "./renderers/CodeViewer";
import { ImageViewer } from "./renderers/ImageViewer";
import { DiffViewer } from "./renderers/DiffViewer";
import { MarkdownViewer } from "./renderers/MarkdownViewer";
import { Editor } from "./Editor";
import { Loader2, Pencil, Eye } from "lucide-react";

const CODE_EXTS: Record<string, true> = {
	ts: true, tsx: true, js: true, jsx: true, mjs: true, cjs: true, py: true, rs: true, go: true, java: true,
	c: true, cpp: true, h: true, hpp: true, css: true, scss: true, less: true, html: true, htm: true,
	json: true, jsonc: true, yaml: true, yml: true, sql: true, sh: true, bash: true,
	ps1: true, toml: true, xml: true, ini: true, cfg: true, env: true, gitignore: true,
	dockerignore: true, editorconfig: true, Makefile: true, Dockerfile: true,
	txt: true, log: true, csv: true, tsv: true,
};

const IMAGE_EXTS: Record<string, true> = { png: true, jpg: true, jpeg: true, gif: true, webp: true, bmp: true, ico: true, avif: true, svg: true };
const DIFF_EXTS: Record<string, true> = { diff: true, patch: true };
const MARKDOWN_EXTS: Record<string, true> = { md: true, mdx: true };
/** Maximum file size that can be opened in the editor; larger falls back to viewer. */
const MAX_EDITOR_BYTES = 1_000_000;

function getExt(filename: string): string {
	const dot = filename.lastIndexOf(".");
	if (dot === -1) return "";
	return filename.slice(dot + 1).toLowerCase();
}

/** True when the file is a text file we can edit (size + ext cap). */
function isEditable(ext: string, size: number): boolean {
	if (!(CODE_EXTS[ext] || MARKDOWN_EXTS[ext] || ext === "")) return false;
	return size > 0 && size <= MAX_EDITOR_BYTES;
}

interface Props {
	tab: FileTab | null;
}

export function FilePreview({ tab }: Props) {
	const [data, setData] = useState<FsReadResponse | null>(null);
	const [loading, setLoading] = useState(false);
	const [editing, setEditing] = useState(false);
	const [editorData, setEditorData] = useState<{ content: string; sha256: string; mime: string } | null>(null);

	useEffect(() => {
		if (!tab) {
			setData(null);
			setEditorData(null);
			setEditing(false);
			return;
		}
		setLoading(true);
		setEditing(false);
		api.readFile(tab.cwd, tab.filePath).then((res) => {
			setData(res);
			setLoading(false);
		});
	}, [tab?.id]);

	if (!tab) {
		return (
			<div className="flex flex-1 items-center justify-center text-ink-3 text-xs">
				Select a file from the tree to preview.
			</div>
		);
	}

	if (loading) {
		return (
			<div className="flex flex-1 items-center justify-center gap-2 text-ink-3 text-xs">
				<Loader2 className="h-4 w-4 animate-spin" /> Loading...
			</div>
		);
	}

	if (!data || !data.ok) {
		return (
			<div className="flex flex-1 items-center justify-center text-ink-3 text-xs">
				{data?.error ?? "Failed to load file."}
			</div>
		);
	}

	const ext = getExt(tab.label);

	if (IMAGE_EXTS[ext]) {
		return <ImageViewer content={data.content} mime={data.mime} fileName={tab.label} />;
	}
	if (DIFF_EXTS[ext]) {
		return <DiffViewer content={data.content} fileName={tab.label} />;
	}

	// Editable text files: read via the dedicated editor endpoint (gives us sha256
	// for stale detection) and let the user toggle edit mode.
	if (isEditable(ext, data.size)) {
		// Lazy-load editor state when the user clicks Edit the first time.
		async function enableEdit(): Promise<void> {
			const res = await api.openEditor(tab!.cwd, tab!.filePath);
			if (res.ok) {
				setEditorData({ content: res.content, sha256: res.sha256, mime: res.mime });
				setEditing(true);
			}
		}
		if (editing && editorData) {
			return (
				<Editor
					cwd={tab.cwd}
					filePath={tab.filePath}
					initialContent={editorData.content}
					initialSha256={editorData.sha256}
					mime={editorData.mime}
				/>
			);
		}
		return (
			<div className="flex flex-1 flex-col min-h-0">
				<div className="flex items-center gap-2 border-b border-line bg-paper px-3 py-1 text-2xs text-ink-3">
					<button
						type="button"
						className="flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-2xs font-medium text-white hover:opacity-90"
						onClick={() => void enableEdit()}
					>
						<Pencil className="h-3 w-3" /> Edit
					</button>
					<button
						type="button"
						className="flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-2xs text-ink-2 hover:bg-paper-2"
						onClick={() => setEditing(false)}
					>
						<Eye className="h-3 w-3" /> Preview
					</button>
					<span className="ml-2 tabular-nums">{(data.size ?? 0).toLocaleString()} bytes</span>
				</div>
				{MARKDOWN_EXTS[ext] ? (
					<MarkdownViewer content={data.content} fileName={tab.label} />
				) : (
					<CodeViewer content={data.content} fileName={tab.label} />
				)}
			</div>
		);
	}

	if (MARKDOWN_EXTS[ext]) {
		return <MarkdownViewer content={data.content} fileName={tab.label} />;
	}
	if (CODE_EXTS[ext] || ext === "") {
		return <CodeViewer content={data.content} fileName={tab.label} />;
	}

	return (
		<div className="flex flex-1 items-center justify-center text-ink-3 text-xs flex-col gap-1">
			<p>Preview not supported for .{ext} files</p>
			<p className="text-2xs text-ink-4">
				{tab.filePath} · {data.size.toLocaleString()} bytes
			</p>
		</div>
	);
}