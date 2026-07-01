import { Link } from "react-router-dom";
import type { ToolRendererProps } from "./ToolCallCard";
import { ResultImages, extractResultText } from "./shared";
import { CodeBlock, MaybeJsonBlock } from "@/lib/code";
import { useStore } from "@/lib/store";

function pathPattern(v: unknown): string | null {
	if (typeof v !== "string") return null;
	// Match absolute or relative paths with known code extensions
	if (/^(\/|[A-Z]:\\|\.\.?[\\/])/.test(v) && /\.[a-z]{1,8}$/i.test(v)) {
		return v;
	}
	return null;
}

export function GenericTool({ args, stream, sessionId }: ToolRendererProps) {
	const cwd = useStore(
		(s) => s.sessionsById[sessionId ?? ""]?.cwd ?? s.defaultCwd,
	);
	const result = stream?.result;
	const partial = stream?.partialResult;
	const text = result ? extractResultText(result) : partial ? extractResultText(partial) : "";

	// Check for path-like args and render links for them
	const pathArgs: Array<{ key: string; path: string }> = [];
	for (const [k, v] of Object.entries(args)) {
		const p = pathPattern(v);
		if (p) pathArgs.push({ key: k, path: p });
	}

	return (
		<div className="space-y-1.5">
			{pathArgs.length > 0 && (
				<div className="space-y-0.5">
					{pathArgs.map(({ key, path }) => (
						<div key={key} className="flex items-center gap-1.5 text-2xs">
							<span className="font-mono uppercase tracking-meta text-ink-3">{key}</span>
							<Link
								to={`/files?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(path)}`}
								className="font-mono text-ink-3 underline decoration-dotted underline-offset-2 hover:text-accent hover:decoration-solid"
							>
								{path}
							</Link>
						</div>
					))}
				</div>
			)}
			<details>
				<summary className="cursor-pointer font-mono text-2xs uppercase tracking-meta text-ink-3 hover:text-ink">
					args
				</summary>
				<div className="mt-1">
					<CodeBlock code={JSON.stringify(args, null, 2)} language="json" className="max-h-48" />
				</div>
			</details>
			<ResultImages result={result ?? partial} />
			{text ? (
				<details open={!result}>
					<summary className="cursor-pointer font-mono text-2xs uppercase tracking-meta text-ink-3 hover:text-ink">
						{result ? "result" : "partial"}
					</summary>
					<div className="mt-1">
						<MaybeJsonBlock text={text} className="max-h-64" />
					</div>
				</details>
			) : null}
		</div>
	);
}
