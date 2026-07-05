import { describe, expect, test } from "bun:test";

import { selectCurrentWorkspaceCwd, useStore } from "./store";

describe("current workspace selection", () => {
	test("uses the sidebar-selected workspace as the launch cwd", () => {
		useStore.setState({ defaultCwd: "C:/server-start", selectedWorkspaceCwd: undefined });

		useStore.getState().setSelectedWorkspaceCwd("C:/projects/current");

		expect(selectCurrentWorkspaceCwd(useStore.getState())).toBe("C:/projects/current");
	});

	test("falls back to the server default when all workspaces are selected", () => {
		useStore.setState({ defaultCwd: "C:/server-start", selectedWorkspaceCwd: "C:/projects/current" });

		useStore.getState().setSelectedWorkspaceCwd("");

		expect(selectCurrentWorkspaceCwd(useStore.getState())).toBe("C:/server-start");
	});
});
