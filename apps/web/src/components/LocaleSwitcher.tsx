/**
 * Compact locale switcher for the top bar. Clicking opens a popover
 * listing supported languages by their native labels. Selection
 * persists to localStorage and switches i18next immediately.
 */

import { useEffect, useRef, useState } from "react";
import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale, SUPPORTED_LOCALES, type SupportedLocale } from "@/i18n/useLocale";

export function LocaleSwitcher(): JSX.Element {
	const { locale, setLocale } = useLocale();
	const [open, setOpen] = useState(false);
	const popoverRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		function onDocClick(e: MouseEvent): void {
			if (!popoverRef.current) return;
			if (!popoverRef.current.contains(e.target as Node)) setOpen(false);
		}
		document.addEventListener("mousedown", onDocClick);
		return () => document.removeEventListener("mousedown", onDocClick);
	}, [open]);

	useEffect(() => {
		if (!open) return;
		function onEsc(e: KeyboardEvent): void {
			if (e.key === "Escape") setOpen(false);
		}
		document.addEventListener("keydown", onEsc);
		return () => document.removeEventListener("keydown", onEsc);
	}, [open]);

	const currentLabel =
		SUPPORTED_LOCALES.find((l) => l.code === locale)?.nativeLabel ?? locale;

	return (
		<div className="relative" ref={popoverRef}>
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className={cn(
					"btn-ghost flex h-7 items-center gap-1.5 rounded px-1.5 text-2xs font-mono",
					"hover:bg-paper-3 transition-colors",
					open && "bg-paper-3",
				)}
				title="Switch language"
			>
				<Languages className="h-3.5 w-3.5 text-ink-3" />
				<span className="text-ink-2">{currentLabel}</span>
			</button>

			{open ? (
				<div className="absolute right-0 top-full z-30 mt-1 w-48 rounded-md border border-line bg-paper-2 p-1 shadow-[0_8px_24px_-8px_rgba(26,24,20,0.25)]">
					{SUPPORTED_LOCALES.map((loc) => {
						const active = loc.code === locale;
						return (
							<button
								key={loc.code}
								type="button"
								onClick={() => {
									setLocale(loc.code as SupportedLocale);
									setOpen(false);
								}}
								className={cn(
									"flex w-full items-center justify-between rounded px-2 py-1.5 text-xs",
									"transition-colors hover:bg-paper-3",
									active && "bg-paper-3 font-medium text-ink",
									!active && "text-ink-2",
								)}
							>
								<span>{loc.nativeLabel}</span>
								<span className="text-2xs text-ink-4">{loc.label}</span>
							</button>
						);
					})}
				</div>
			) : null}
		</div>
	);
}
