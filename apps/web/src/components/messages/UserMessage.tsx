import type { UserMsg } from "@/lib/types";
import { Markdown } from "@/lib/markdown";
import { formatClockTime } from "@/lib/utils";

export function UserMessage({ msg }: { msg: UserMsg }) {
	const time = formatClockTime(msg.timestamp);

	return (
		<div className="border-l-2 border-accent/40 bg-accent-soft/20 rounded-r-lg py-2 pl-4 pr-1 space-y-1.5">
			<div className="flex items-center gap-2">
				<span className="meta">you</span>
				{msg.synthetic ? <span className="meta text-thinking">· synthetic</span> : null}
				{time ? <span className="meta text-ink-4 ml-auto">{time}</span> : null}
			</div>
			{msg.images && msg.images.length > 0 ? (
				<div className="flex flex-wrap gap-1.5">
					{msg.images.map((img, i) => (
						<img
							key={i}
							src={`data:${img.mimeType};base64,${img.data}`}
							alt={`pasted ${i + 1}`}
							className="h-28 w-28 rounded border border-line object-cover"
						/>
					))}
				</div>
			) : null}
			{msg.text ? <Markdown>{msg.text}</Markdown> : null}
		</div>
	);
}
