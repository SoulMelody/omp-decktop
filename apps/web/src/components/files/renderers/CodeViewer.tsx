import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import ts from "react-syntax-highlighter/dist/esm/languages/hljs/typescript";
import js from "react-syntax-highlighter/dist/esm/languages/hljs/javascript";
import py from "react-syntax-highlighter/dist/esm/languages/hljs/python";
import rust from "react-syntax-highlighter/dist/esm/languages/hljs/rust";
import go from "react-syntax-highlighter/dist/esm/languages/hljs/go";
import java from "react-syntax-highlighter/dist/esm/languages/hljs/java";
import cpp from "react-syntax-highlighter/dist/esm/languages/hljs/cpp";
import css from "react-syntax-highlighter/dist/esm/languages/hljs/css";
import json from "react-syntax-highlighter/dist/esm/languages/hljs/json";
import yaml from "react-syntax-highlighter/dist/esm/languages/hljs/yaml";
import xml from "react-syntax-highlighter/dist/esm/languages/hljs/xml";
import bash from "react-syntax-highlighter/dist/esm/languages/hljs/bash";
import sql from "react-syntax-highlighter/dist/esm/languages/hljs/sql";
import markdown from "react-syntax-highlighter/dist/esm/languages/hljs/markdown";
import { github } from "react-syntax-highlighter/dist/esm/styles/hljs";

SyntaxHighlighter.registerLanguage("typescript", ts);
SyntaxHighlighter.registerLanguage("tsx", ts);
SyntaxHighlighter.registerLanguage("javascript", js);
SyntaxHighlighter.registerLanguage("jsx", js);
SyntaxHighlighter.registerLanguage("python", py);
SyntaxHighlighter.registerLanguage("rust", rust);
SyntaxHighlighter.registerLanguage("go", go);
SyntaxHighlighter.registerLanguage("java", java);
SyntaxHighlighter.registerLanguage("cpp", cpp);
SyntaxHighlighter.registerLanguage("c", cpp);
SyntaxHighlighter.registerLanguage("css", css);
SyntaxHighlighter.registerLanguage("scss", css);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("yaml", yaml);
SyntaxHighlighter.registerLanguage("xml", xml);
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("shell", bash);
SyntaxHighlighter.registerLanguage("sql", sql);
SyntaxHighlighter.registerLanguage("markdown", markdown);

interface Props {
	content: string;
	fileName: string;
}

function detectLang(fileName: string): string {
	const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
	const m: Record<string, string> = {
		ts: "typescript",
		tsx: "tsx",
		js: "javascript",
		jsx: "jsx",
		mjs: "javascript",
		cjs: "javascript",
		py: "python",
		rs: "rust",
		go: "go",
		java: "java",
		c: "c",
		cpp: "cpp",
		h: "cpp",
		hpp: "cpp",
		css: "css",
		scss: "scss",
		less: "css",
		json: "json",
		jsonc: "json",
		yaml: "yaml",
		yml: "yaml",
		xml: "xml",
		html: "xml",
		htm: "xml",
		svg: "xml",
		sh: "bash",
		bash: "bash",
		ps1: "bash",
		sql: "sql",
		md: "markdown",
		mdx: "markdown",
	};
	return m[ext] ?? "plaintext";
}

export function CodeViewer({ content, fileName }: Props) {
	const lang = detectLang(fileName);
	const lineCount = content.split(/\r?\n/).length;

	return (
		<div className="flex flex-1 flex-col min-h-0">
			<div className="flex items-center justify-between px-3 py-1.5 border-b border-line bg-paper text-2xs text-ink-3">
				<span className="font-mono">{fileName}</span>
				<span className="tabular-nums">{lineCount} lines</span>
			</div>
			<div className="flex-1 overflow-auto">
				<SyntaxHighlighter
					language={lang}
					style={github}
					showLineNumbers
					wrapLines
					lineNumberStyle={{
						minWidth: "2.5em",
						color: "var(--ink-4)",
						userSelect: "none",
					}}
					customStyle={{
						margin: 0,
						padding: 0,
						background: "transparent",
						fontSize: "0.688rem",
						lineHeight: "1.5",
					}}
					codeTagProps={{ style: { fontFamily: "var(--font-mono)" } }}
				>
					{content}
				</SyntaxHighlighter>
			</div>
		</div>
	);
}
