import { Link } from "react-router-dom";
import type { ToolRendererProps } from "./ToolCallCard";
import { ArgRow, extractResultText, SectionLabel } from "./shared";
import { CodeBlock, detectLangFromPath } from "@/lib/code";
import { useStore } from "@/lib/store";
import { formatBytes, shortPath } from "@/lib/utils";

export function WriteTool({ args, stream, sessionId }: ToolRendererProps) {
	const cwd = useStore(
		(s) => s.sessionsById[sessionId ?? ""]?.cwd ?? s.defaultCwd,
	);
	const path = String((args.path as string | undefined) ?? "");
	const content = String((args.content as string | undefined) ?? "");
	const bytes = new Blob([content]).size;
	const result = stream?.result;
	const resultText = result ? extractResultText(result) : "";
	const lineCount = content.split(/\r?\n/).length;
	const language = detectLangFromPath(path);

	return (
		<div className="space-y-1.5">
			<ArgRow
				k="path"
				v={
					<Link
						to={`/files?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(path)}`}
						className="font-mono text-2xs text-ink-3 underline decoration-dotted underline-offset-2 hover:text-accent hover:decoration-solid"
					>
						{shortPath(path, 72)}
					</Link>
				}
			/>
			<ArgRow k="size" v={`${formatBytes(bytes)} · ${lineCount} line${lineCount === 1 ? "" : "s"}`} />
			{content ? (
				<details>
					<summary className="cursor-pointer font-mono text-2xs uppercase tracking-meta text-ink-3 hover:text-ink">
						body
					</summary>
					<div className="mt-1">
						<CodeBlock code={content} language={language} />
					</div>
				</details>
			) : null}
			{resultText ? <div className="font-mono text-2xs text-ink-3">{resultText}</div> : null}
		</div>
	);
}
