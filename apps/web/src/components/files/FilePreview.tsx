import { useEffect, useState } from "react";
import type { FileTab } from "@/views/FilesView";
import type { FsReadResponse } from "@/lib/types";
import { api } from "@/lib/api";
import { CodeViewer } from "./renderers/CodeViewer";
import { ImageViewer } from "./renderers/ImageViewer";
import { DiffViewer } from "./renderers/DiffViewer";
import { MarkdownViewer } from "./renderers/MarkdownViewer";
import { Loader2 } from "lucide-react";

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

function getExt(filename: string): string {
	const dot = filename.lastIndexOf(".");
	if (dot === -1) return "";
	return filename.slice(dot + 1).toLowerCase();
}

interface Props {
	tab: FileTab | null;
}

export function FilePreview({ tab }: Props) {
	const [data, setData] = useState<FsReadResponse | null>(null);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!tab) {
			setData(null);
			return;
		}
		setLoading(true);
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

	if (IMAGE_EXTS[ext])
		return <ImageViewer content={data.content} mime={data.mime} fileName={tab.label} />;
	if (DIFF_EXTS[ext])
		return <DiffViewer content={data.content} fileName={tab.label} />;
	if (MARKDOWN_EXTS[ext])
		return <MarkdownViewer content={data.content} fileName={tab.label} />;
	if (CODE_EXTS[ext] || ext === "")
		return <CodeViewer content={data.content} fileName={tab.label} />;

	return (
		<div className="flex flex-1 items-center justify-center text-ink-3 text-xs flex-col gap-1">
			<p>Preview not supported for .{ext} files</p>
			<p className="text-2xs text-ink-4">
				{tab.filePath} · {data.size.toLocaleString()} bytes
			</p>
		</div>
	);
}
