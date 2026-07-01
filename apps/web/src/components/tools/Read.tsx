import { Link } from "react-router-dom";
import type { ToolRendererProps } from "./ToolCallCard";
import { ArgRow, extractResultText } from "./shared";
import { CodeBlock, detectLangFromPath } from "@/lib/code";
import { useStore } from "@/lib/store";
import { shortPath } from "@/lib/utils";

export function ReadTool({ args, stream, sessionId }: ToolRendererProps) {
	const cwd = useStore(
		(s) => s.sessionsById[sessionId ?? ""]?.cwd ?? s.defaultCwd,
	);
	const path = String((args.path as string | undefined) ?? "");
	const result = stream?.result ?? stream?.partialResult;
	const text = result ? extractResultText(result) : "";
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
			{text ? <CodeBlock code={text} language={language} /> : null}
		</div>
	);
}
