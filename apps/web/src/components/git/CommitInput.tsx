import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Standalone textarea intended for use as a low-level input primitive when
 * the full `CommitSection` is overkill (e.g. an inline commit dialog). Mirrors
 * the openchamber commit-input field shape so behavior stays consistent.
 */

interface Props {
	value: string;
	onChange(next: string): void;
	placeholder?: string;
	maxRows?: number;
	disabled?: boolean;
	autoFocus?: boolean;
}

export function CommitInput({ value, onChange, placeholder = "Commit message", maxRows = 8, disabled, autoFocus }: Props) {
	const ref = useRef<HTMLTextAreaElement>(null);
	const [, force] = useState(0);

	// Auto-grow up to maxRows.
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		el.style.height = "auto";
		const lineHeight = 18;
		const next = Math.min(maxRows, Math.max(1, el.value.split("\n").length));
		el.style.height = `${next * lineHeight + 12}px`;
		force((n) => n + 1);
	}, [value, maxRows]);

	useEffect(() => {
		if (autoFocus) ref.current?.focus();
	}, [autoFocus]);

	return (
		<textarea
			ref={ref}
			value={value}
			onChange={(e) => onChange(e.target.value)}
			placeholder={placeholder}
			spellCheck={false}
			rows={3}
			disabled={disabled}
			className={cn(
				"block w-full resize-y rounded-md border border-line bg-paper px-2 py-1.5 font-mono text-2xs text-ink outline-none",
				"focus:border-accent disabled:opacity-50",
			)}
		/>
	);
}