import type { SkillSummary, SlashCommand } from "@omp-deck/protocol";

export type SlashCompletionMode = "all" | "skill";
export type SlashCompletionKind = "command" | "skill";
export type SlashCompletionGroupKind = "commands" | "skills";

export interface SlashCompletionQuery {
	mode: SlashCompletionMode;
	query: string;
}

export interface SlashCompletionItem {
	kind: SlashCompletionKind;
	label: string;
	value: string;
	description?: string;
	meta?: string;
	command?: SlashCommand;
	skill?: SkillSummary;
}

export interface SlashCompletionGroup {
	kind: SlashCompletionGroupKind;
	label: string;
	items: SlashCompletionItem[];
}

export function getSlashCompletionQuery(draft: string): SlashCompletionQuery | null {
	if (!draft.startsWith("/")) return null;
	const afterSlash = draft.slice(1);
	const commandMatch = afterSlash.match(/^skill(?:\s+([^\n]*))?$/);
	if (commandMatch) return { mode: "skill", query: commandMatch[1] ?? "" };
	if (/\s/.test(afterSlash)) return null;
	return { mode: "all", query: afterSlash };
}

export function buildGroupedSlashCompletions(
	commands: SlashCommand[],
	skills: SkillSummary[],
	query: string,
	mode: SlashCompletionMode = "all",
): SlashCompletionGroup[] {
	const groups: SlashCompletionGroup[] = [];
	if (mode === "all") {
		const items = rankByQuery(
			commands.map((command): SlashCompletionItem => ({
				kind: "command",
				label: `/${command.name}`,
				value: command.name,
				description: command.description,
				meta: command.scope,
				command,
			})),
			query,
		);
		if (items.length > 0) groups.push({ kind: "commands", label: "Commands", items });
	}

	const skillItems = rankByQuery(
		skills
			.filter((skill) => skill.enabled)
			.map((skill): SlashCompletionItem => ({
				kind: "skill",
				label: `/skill ${skill.name}`,
				value: skill.name,
				description: skill.frontmatter.description,
				meta: `${skill.providerLabel} · ${skill.level}`,
				skill,
			})),
		query,
	);
	if (skillItems.length > 0) groups.push({ kind: "skills", label: "Skills", items: skillItems });

	return groups;
}

export function pickSlashCompletionInsertion(item: SlashCompletionItem): string {
	return item.kind === "skill" ? `/skill ${item.value} ` : `/${item.value} `;
}

function rankByQuery<T extends { value: string }>(items: T[], query: string): T[] {
	const q = query.trim().toLowerCase();
	if (q === "") return items;
	const prefix: T[] = [];
	const substr: T[] = [];
	for (const item of items) {
		const value = item.value.toLowerCase();
		if (value.startsWith(q)) prefix.push(item);
		else if (value.includes(q)) substr.push(item);
	}
	return [...prefix, ...substr];
}
