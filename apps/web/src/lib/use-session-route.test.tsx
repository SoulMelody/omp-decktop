import { describe, expect, test } from "bun:test";

import { nextPathForActive, resolveRouteTarget } from "./use-session-route";

describe("resolveRouteTarget", () => {
	test("prefers the route session id over the active session id", () => {
		expect(resolveRouteTarget("route-session", "active-session")).toBe("route-session");
	});

	test("falls back to the active session id when the route has no session id", () => {
		expect(resolveRouteTarget(undefined, "active-session")).toBe("active-session");
	});

	test("returns undefined when neither source exists", () => {
		expect(resolveRouteTarget(undefined, undefined)).toBeUndefined();
	});
});

describe("nextPathForActive", () => {
	test("returns the deep-link path for an active session", () => {
		expect(nextPathForActive("session-123")).toBe("/c/session-123");
	});

	test("returns the chat root when there is no active session", () => {
		expect(nextPathForActive(undefined)).toBe("/");
	});
});
