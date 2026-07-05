import { describe, expect, mock, test } from "bun:test";

const refresh = mock(async (_mode?: string) => undefined);
const refreshInBackground = mock((_mode?: string) => undefined);
const discoverAuthStorage = mock(async () => ({ kind: "auth" }));
const loadCliExtensionProviders = mock(async () => undefined);
const registryInstances: FakeModelRegistry[] = [];

class FakeModelRegistry {
	authStorage: unknown;

	constructor(authStorage: unknown) {
		this.authStorage = authStorage;
		registryInstances.push(this);
	}

	refresh = refresh;
	refreshInBackground = refreshInBackground;
}

mock.module("@oh-my-pi/pi-coding-agent", () => ({
	ModelRegistry: FakeModelRegistry,
	discoverAuthStorage,
	loadCliExtensionProviders,
	settings: { kind: "settings" },
}));

describe("getDeckModelRegistry", () => {
	test("initializes the shared registry without guessing an extension cwd", async () => {
		const { getDeckModelRegistry } = await import("./auth-singleton.ts");

		const registry = await getDeckModelRegistry();
		const created = registryInstances[0];
		if (!created) throw new Error("expected registry to be constructed");

		expect(registry).toBe(created as unknown as typeof registry);
		expect(refresh).toHaveBeenCalledWith("offline");
		expect(loadCliExtensionProviders).not.toHaveBeenCalled();
		expect(refreshInBackground).toHaveBeenCalledWith("online");
	});

	test("refreshes extension providers for an explicit workspace cwd", async () => {
		const { refreshDeckExtensionProviders } = await import("./auth-singleton.ts");

		await refreshDeckExtensionProviders("C:/projects/current");
		const created = registryInstances[0];
		if (!created) throw new Error("expected registry to be constructed");

		expect(loadCliExtensionProviders).toHaveBeenCalledWith(created, { kind: "settings" }, "C:/projects/current");
	});
});
