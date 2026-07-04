import { describe, expect, test } from "bun:test";

import { useStore } from "./store";

describe("pinned todos panel store state", () => {

	test("starts with the pinned todos panel closed", () => {
		expect(useStore.getState().todoPanelOpen).toBe(false);
	});

	test("toggleTodoPanel flips the pinned todos panel open and closed", () => {
		useStore.setState({ todoPanelOpen: false });
		useStore.getState().toggleTodoPanel();
		expect(useStore.getState().todoPanelOpen).toBe(true);

		useStore.getState().toggleTodoPanel();
		expect(useStore.getState().todoPanelOpen).toBe(false);
	});
});
