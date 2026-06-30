import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { THEMES, useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function AppearanceSection() {
	const theme = useTheme();
	return (
		<div className="mx-auto max-w-5xl space-y-4">
			<div>
				<h1 className="text-xl font-semibold tracking-tight">Appearance</h1>
				<p className="mt-1 max-w-3xl text-sm text-ink-3">
					Themes swap the entire palette and font stack at runtime. Your choice is stored in this
					browser; clearing it falls back to the system color preference.
				</p>
			</div>

			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				{THEMES.map((def) => (
					<ThemeCard
						key={def.id}
						definition={def}
						isActive={theme.active === def.id}
						isPinned={theme.stored === def.id}
						onPick={() => theme.set(def.id)}
					/>
				))}
			</div>

			<div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-paper-2 px-3 py-2 text-sm">
				<div className="min-w-0">
					<div className="meta">System preference</div>
					<div className="mt-0.5 text-xs text-ink-3">
						{theme.usingSystem
							? `Following the OS: ${theme.systemPreferred}.`
							: `Pinned to ${theme.stored}. The OS currently prefers ${theme.systemPreferred}.`}
					</div>
				</div>
				<Button
					variant="outline"
					size="sm"
					disabled={theme.usingSystem}
					onClick={() => theme.clear()}
				>
					Match system
				</Button>
			</div>

			<div className="overflow-hidden rounded-md border border-line bg-paper">
				<div className="border-b border-line bg-paper-2 px-3 py-2">
					<div className="meta">Font preview</div>
					<div className="mt-0.5 text-xs text-ink-3">Driven by the active theme. v1 ships one font set.</div>
				</div>
				<div className="space-y-3 p-4">
					<div>
						<div className="meta mb-1">Sans</div>
						<div className="font-sans text-base text-ink">
							The agent finished compaction and routed the next prompt back to the original session.
						</div>
					</div>
					<div>
						<div className="meta mb-1">Mono</div>
						<div className="rounded-md border border-line bg-paper-code px-3 py-2 font-mono text-xs text-ink-2">
							{"const status = await bridgesApi.start(\"telegram\");"}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function ThemeCard({
	definition,
	isActive,
	isPinned,
	onPick,
}: {
	definition: (typeof THEMES)[number];
	isActive: boolean;
	isPinned: boolean;
	onPick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onPick}
			data-theme-preview={definition.id}
			aria-pressed={isActive}
			className={cn(
				"group flex flex-col gap-3 rounded-md border bg-paper p-3 text-left transition-colors",
				isActive ? "border-accent ring-1 ring-accent/40" : "border-line hover:border-ink/30",
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<div>
					<div className="text-sm font-semibold text-ink">{definition.label}</div>
					<div className="mt-0.5 text-xs text-ink-3">{definition.description}</div>
				</div>
				<div className="flex shrink-0 flex-col items-end gap-1">
					{isActive ? <Badge tone="accent">active</Badge> : null}
					{!isActive && isPinned ? <Badge tone="muted">pinned</Badge> : null}
				</div>
			</div>
			<ThemeSwatchStrip definition={definition} />
		</button>
	);
}

function ThemeSwatchStrip({ definition }: { definition: (typeof THEMES)[number] }) {
	// Render swatches inside an isolated `data-theme="..."` wrapper so each card
	// shows its OWN palette regardless of which theme the rest of the UI uses.
	return (
		<div
			data-theme={definition.id}
			className="grid grid-cols-4 gap-1.5 rounded-md border border-line/60 bg-paper p-1.5"
		>
			{definition.swatchTokens.map((s) => (
				<div key={s.token} className="flex flex-col items-stretch gap-1">
					<div
						className="h-8 w-full rounded"
						style={{ backgroundColor: `rgb(var(--${s.token}))` }}
					/>
					<div className="text-center font-mono text-2xs uppercase tracking-meta text-ink-3">
						{s.label}
					</div>
				</div>
			))}
		</div>
	);
}
