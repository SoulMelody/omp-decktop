import { useEffect, useState } from "react";
import type { FileTab } from "@/views/FilesView";
import type { FsReadResponse } from "@/lib/types";
import { api } from "@/lib/api";
import { CodeViewer } from "./renderers/CodeViewer";
import { ImageViewer } from "./renderers/ImageViewer";
import { DiffViewer } from "./renderers/DiffViewer";
import { Loader2 } from "lucide-react";

const CODE_EXTS = new Set([
	"ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "rs", "go", "java",
	"c", "cpp", "h", "hpp", "css", "scss", "less", "html", "htm",
	"json", "jsonc", "yaml", "yml", "md", "mdx", "sql", "sh", "bash",
	"ps1", "toml", "xml", "ini", "cfg", "env", "gitignore",
	"dockerignore", "editorconfig", "Makefile", "Dockerfile",
	"txt", "log", "csv", "tsv",
]);

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "avif", "svg"]);
const DIFF_EXTS = new Set(["diff", "patch"]);

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

	if (IMAGE_EXTS.has(ext))
		return <ImageViewer content={data.content} mime={data.mime} fileName={tab.label} />;
	if (DIFF_EXTS.has(ext))
		return <DiffViewer content={data.content} fileName={tab.label} />;
	if (CODE_EXTS.has(ext) || ext === "")
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
