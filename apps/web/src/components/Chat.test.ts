import { describe, expect, test } from "bun:test";

import {
	getScrollToBottomTarget,
	isScrollToBottomAffordanceVisible,
	shouldRenderPinnedTodosPanel,
} from "./Chat";
import type { TodoPhase } from "@/lib/types";

describe("chat scroll-to-bottom affordance", () => {
	test("hides while the viewport is at or within 100px of the bottom", () => {
		for (const fromBottom of [-1, 0, 1, 99, 100]) {
			expect(isScrollToBottomAffordanceVisible(fromBottom)).toBe(false);
		}
	});

	test("shows once the viewport is more than 100px from the bottom", () => {
		expect(isScrollToBottomAffordanceVisible(101)).toBe(true);
		expect(isScrollToBottomAffordanceVisible(250)).toBe(true);
	});

	test("jumping to bottom targets the full scroll height and restores sticky scrolling", () => {
		expect(getScrollToBottomTarget({ scrollHeight: 2400 })).toEqual({
			scrollTop: 2400,
			sticky: true,
		});
	});
});

describe("pinned todos panel render decision", () => {
	const phases: TodoPhase[] = [
		{ name: "Implement", tasks: [{ content: "wire panel", status: "in_progress" }] },
	];

	test("closed toggle hides the panel even when the active session has todo phases", () => {
		expect(shouldRenderPinnedTodosPanel({ todoPanelOpen: false, todoPhases: phases })).toBe(false);
	});

	test("open toggle hides the panel when the active session has no todo phases", () => {
		expect(shouldRenderPinnedTodosPanel({ todoPanelOpen: true, todoPhases: [] })).toBe(false);
	});

	test("open toggle shows the panel when the active session has todo phases", () => {
		expect(shouldRenderPinnedTodosPanel({ todoPanelOpen: true, todoPhases: phases })).toBe(true);
	});
});
