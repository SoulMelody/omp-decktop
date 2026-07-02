import { describe, expect, test } from "bun:test";
import type { SkillSummary, SlashCommand } from "@omp-deck/protocol";

import {
	buildGroupedSlashCompletions,
	getSlashCompletionQuery,
	pickSlashCompletionInsertion,
} from "./composer-slash-completion";

const commands: SlashCommand[] = [
	{ name: "plan", scope: "deck", description: "toggle plan mode" },
	{ name: "task", scope: "deck", description: "manage tasks" },
];

function skill(name: string, description: string): SkillSummary {
	return {
		id: `id-${name}`,
		name,
		dirName: name,
		provider: "native",
		providerLabel: "OMP",
		level: "user",
		skillPath: `/skills/${name}/SKILL.md`,
		frontmatter: { name, description },
		enabled: true,
	};
}

describe("composer slash completion", () => {
	test("/skill keeps slash completion open for skill-name filtering", () => {
		expect(getSlashCompletionQuery("/skill brain")).toEqual({ mode: "skill", query: "brain" });
	});

	test("groups slash command and skill candidates", () => {
		const groups = buildGroupedSlashCompletions(commands, [
			skill("brainstorming", "Explore intent before coding"),
			skill("diagnose", "Debug hard failures"),
		], "");

		expect(groups.map((g) => g.kind)).toEqual(["commands", "skills"]);
		expect(groups[0]?.items.map((item) => item.label)).toEqual(["/plan", "/task"]);
		expect(groups[1]?.items.map((item) => item.label)).toEqual(["/skill brainstorming", "/skill diagnose"]);
	});

	test("/skill filters only skill candidates with prefix before substring", () => {
		const groups = buildGroupedSlashCompletions(commands, [
			skill("test-driven-development", "Write tests first"),
			skill("frontend-design", "Design React screens"),
			skill("diagnose", "Debug test failures"),
		], "de", "skill");

		expect(groups.map((g) => g.kind)).toEqual(["skills"]);
		expect(groups[0]?.items.map((item) => item.value)).toEqual([
			"test-driven-development",
			"frontend-design",
		]);
	});

	test("picking a skill inserts /skill <name> with trailing space", () => {
		const groups = buildGroupedSlashCompletions(commands, [skill("brainstorming", "Explore intent")], "brain", "skill");
		const picked = groups[0]?.items[0];

		expect(picked).toBeDefined();
		expect(pickSlashCompletionInsertion(picked!)).toBe("/skill brainstorming ");
	});
});
