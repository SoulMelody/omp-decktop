import { describe, expect, test } from "bun:test";

import { MODEL_ROLE_CATALOG } from "./routes-settings";

describe("MODEL_ROLE_CATALOG", () => {
	test("uses SDK role ids for roles whose display names differ", () => {
		expect(MODEL_ROLE_CATALOG).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: "smol", label: "Fast" }),
				expect.objectContaining({ key: "slow", label: "Thinking" }),
				expect.objectContaining({ key: "plan", label: "Architect" }),
				expect.objectContaining({ key: "task", label: "Subtask" }),
			]),
		);
	});

	test("does not expose display names as save keys", () => {
		const keys = MODEL_ROLE_CATALOG.map((role) => role.key);
		expect(keys).not.toContain("fast");
		expect(keys).not.toContain("thinking");
		expect(keys).not.toContain("architect");
		expect(keys).not.toContain("subtask");
	});
});
