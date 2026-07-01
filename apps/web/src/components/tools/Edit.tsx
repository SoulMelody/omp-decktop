import { Link } from "react-router-dom";
import type { ToolRendererProps } from "./ToolCallCard";
import { ArgRow, Pre, extractResultText, splitPathRange } from "./shared";
import { useStore } from "@/lib/store";
import { shortPath } from "@/lib/utils";
import { CopyButton } from "@/lib/CopyButton";

export function EditTool({ args, stream, sessionId }: ToolRendererProps) {
	const cwd = useStore(
		(s) => s.sessionsById[sessionId ?? ""]?.cwd ?? s.defaultCwd,
	);
	const rawPath = String((args.path as string | undefined) ?? "");
	const { file } = splitPathRange(rawPath);
	const patch = String((args.patch ?? args.input ?? args.edits ?? "") as string);
	const result = stream?.result ?? stream?.partialResult;
	const text = result ? extractResultText(result) : "";

	return (
		<div className="space-y-1.5">
			<ArgRow
				k="path"
				v={
					<Link
						to={`/files?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(file)}`}
						className="font-mono text-2xs text-ink-3 underline decoration-dotted underline-offset-2 hover:text-accent hover:decoration-solid"
					>
						{shortPath(rawPath, 72)}
					</Link>
				}
			/>
			{patch ? <HashlinePatch patch={patch} /> : null}
			{text ? (
				<details open>
					<summary className="cursor-pointer font-mono text-2xs uppercase tracking-meta text-ink-3 hover:text-ink">
						result
					</summary>
					<div className="mt-1">
						<Pre>{text}</Pre>
					</div>
				</details>
			) : null}
		</div>
	);
}

function HashlinePatch({ patch }: { patch: string }) {
	const lines = patch.split(/\r?\n/);
	return (
		<div className="group relative">
			<pre className="max-h-72 overflow-auto border-y border-line bg-paper-code px-4 py-3 font-mono text-2xs leading-relaxed">
				{lines.map((line, i) => (
					<div key={i} className={classifyLine(line)}>
						{line || "\u00A0"}
					</div>
				))}
			</pre>
			<CopyButton text={patch} />
		</div>
	);
}

function classifyLine(line: string): string {
	if (line.startsWith("@@ ")) return "text-accent font-medium";
	if (line.startsWith("+ ")) return "text-success";
	if (line.startsWith("- ")) return "text-danger";
	if (line.startsWith("= ")) return "text-warn";
	if (line.startsWith("< ")) return "text-thinking";
	if (line.startsWith("~")) return "text-ink";
	return "text-ink-3";
}
