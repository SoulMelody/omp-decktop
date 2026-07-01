import { useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
	content: string;
	mime: string;
	fileName: string;
}

export function ImageViewer({ content, mime, fileName }: Props) {
	const [fit, setFit] = useState(true);
	const src = `data:${mime};base64,${content}`;

	return (
		<div className="flex flex-1 flex-col items-center justify-center bg-paper-3 p-4 min-h-0">
			<div className="mb-2 flex items-center gap-2 text-2xs text-ink-3">
				<span className="font-mono">{fileName}</span>
				<button
					type="button"
					onClick={() => setFit(!fit)}
					className="rounded p-1 hover:bg-paper-2"
					title={fit ? "Actual size" : "Fit to window"}
				>
					{fit ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
				</button>
			</div>
			<img
				src={src}
				alt={fileName}
				className={cn("max-h-full rounded", fit ? "object-scale-down max-w-full" : "")}
			/>
		</div>
	);
}
