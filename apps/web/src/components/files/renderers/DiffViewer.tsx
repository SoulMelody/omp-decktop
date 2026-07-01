interface Props {
	content: string;
	fileName: string;
}

export function DiffViewer({ content, fileName }: Props) {
	const lines = content.split(/\r?\n/);
	return (
		<div className="flex flex-1 flex-col min-h-0">
			<div className="flex items-center gap-2 px-3 py-1.5 border-b border-line bg-paper text-2xs text-ink-2 font-mono">
				{fileName}
			</div>
			<div className="flex-1 overflow-y-auto font-mono text-2xs leading-relaxed">
				{lines.map((line, i) => {
					let bg = "";
					let fg = "text-ink-3";
					if (line.startsWith("+") && !line.startsWith("+++")) {
						bg = "bg-emerald-900/20";
						fg = "text-emerald-400";
					} else if (line.startsWith("-") && !line.startsWith("---")) {
						bg = "bg-red-900/20";
						fg = "text-red-400";
					} else if (line.startsWith("@@")) {
						bg = "bg-blue-900/20";
						fg = "text-blue-300";
					}
					return (
						<div key={i} className={`px-3 py-px ${bg}`}>
							<span className={fg}>{line || "\u00A0"}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}
