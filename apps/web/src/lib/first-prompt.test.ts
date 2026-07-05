import { describe, expect, test } from "bun:test";

import { buildFirstPrompt } from "./first-prompt";

describe("buildFirstPrompt", () => {
	test("returns the draft unchanged when there is no auto-start command", () => {
		expect(buildFirstPrompt({ draft: "Continue the refactor", autoStartCommand: undefined })).toBe(
			"Continue the refactor",
		);
	});

	test("prepends the auto-start command and a blank line before the draft", () => {
		expect(buildFirstPrompt({ draft: "Audit the failing tests", autoStartCommand: "/start" })).toBe(
			"/start\n\nAudit the failing tests",
		);
	});

	test("returns only the auto-start command when the draft is empty", () => {
		expect(buildFirstPrompt({ draft: "", autoStartCommand: "/start --focus tasks" })).toBe(
			"/start --focus tasks",
		);
	});

	test("null auto-start suppresses the command and sends only the draft", () => {
		expect(buildFirstPrompt({ draft: "Open from task body", autoStartCommand: null })).toBe(
			"Open from task body",
		);
	});
});
