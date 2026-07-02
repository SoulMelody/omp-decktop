import MarkdownPreview from "@uiw/react-markdown-preview";
import "@uiw/react-markdown-preview/markdown.css";

import { useTheme } from "@/lib/theme";

interface Props {
	content: string;
	fileName: string;
}

export function MarkdownViewer({ content, fileName }: Props) {
	const theme = useTheme();
	const previewColorMode = theme.active === "paper" ? "light" : "dark";

	return (
		<div className="flex flex-1 flex-col min-h-0">
			<div className="flex items-center justify-between px-3 py-1.5 border-b border-line bg-paper text-2xs text-ink-3">
				<span className="font-mono">{fileName}</span>
				<span>Markdown preview</span>
			</div>
			<div className="flex-1 overflow-auto px-5 py-4">
				<MarkdownPreview
					source={content}
					wrapperElement={{ "data-color-mode": previewColorMode }}
					className="skill-md-preview bg-transparent"
				/>
			</div>
		</div>
	);
}
