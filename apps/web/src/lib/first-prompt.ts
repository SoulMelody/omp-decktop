export function buildFirstPrompt(opts: { draft: string; autoStartCommand?: string | null }): string {
	if (!opts.autoStartCommand) return opts.draft;
	if (opts.draft.length === 0) return opts.autoStartCommand;
	return `${opts.autoStartCommand}\n\n${opts.draft}`;
}
