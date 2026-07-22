import { describe, expect, test } from "bun:test";

import { resolveSelectedProviderId } from "./use-provider-workspace";

describe("provider workspace refresh selection", () => {
	test("keeps a selected provider that still exists", () => {
		expect(resolveSelectedProviderId("beta", [{ id: "alpha" }, { id: "beta" }])).toBe("beta");
	});

	test("falls back after the selected provider is deleted", () => {
		expect(resolveSelectedProviderId("deleted", [{ id: "alpha" }, { id: "beta" }])).toBe("alpha");
	});

	test("returns undefined when deletion leaves no providers", () => {
		expect(resolveSelectedProviderId("deleted", [])).toBeUndefined();
	});
});
