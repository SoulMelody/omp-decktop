import { describe, expect, test } from "bun:test";

import { formatModelRoleValue, parseModelRoleValue } from "./ModelRolesSection";

describe("model role value helpers", () => {
	test("parses unset stored values as empty model and level", () => {
		expect(parseModelRoleValue(null)).toEqual({ modelId: "", thinkingLevel: "" });
		expect(parseModelRoleValue("")).toEqual({ modelId: "", thinkingLevel: "" });
	});

	test("parses a plain model id without a thinking level", () => {
		expect(parseModelRoleValue("anthropic/claude-sonnet-4")).toEqual({
			modelId: "anthropic/claude-sonnet-4",
			thinkingLevel: "",
		});
	});

	test("parses a legal thinking suffix from the last colon", () => {
		expect(parseModelRoleValue("anthropic/claude-sonnet-4:high")).toEqual({
			modelId: "anthropic/claude-sonnet-4",
			thinkingLevel: "high",
		});
	});

	test("accepts every supported thinking suffix", () => {
		for (const level of ["minimal", "low", "medium", "high", "xhigh"]) {
			expect(parseModelRoleValue(`anthropic/claude-sonnet-4:${level}`)).toEqual({
				modelId: "anthropic/claude-sonnet-4",
				thinkingLevel: level,
			});
		}
	});

	test("keeps an illegal suffix in the model id", () => {
		expect(parseModelRoleValue("anthropic/claude-sonnet-4:turbo")).toEqual({
			modelId: "anthropic/claude-sonnet-4:turbo",
			thinkingLevel: "",
		});
	});

	test("uses only the last colon when parsing a legal thinking suffix", () => {
		expect(parseModelRoleValue("gateway:team:anthropic/claude-sonnet-4:xhigh")).toEqual({
			modelId: "gateway:team:anthropic/claude-sonnet-4",
			thinkingLevel: "xhigh",
		});
	});

	test("formats null and blank model ids as unset", () => {
		expect(formatModelRoleValue(null, "high")).toBeNull();
		expect(formatModelRoleValue("", "high")).toBeNull();
	});

	test("formats a model id without a thinking level as the plain id", () => {
		expect(formatModelRoleValue("anthropic/claude-sonnet-4", "")).toBe("anthropic/claude-sonnet-4");
	});

	test("formats a model id with a nonblank thinking level as a suffixed id", () => {
		expect(formatModelRoleValue("anthropic/claude-sonnet-4", "medium")).toBe(
			"anthropic/claude-sonnet-4:medium",
		);
	});
});
