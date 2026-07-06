import { describe, expect, test } from "bun:test";

import { getSelectDialogSubmitState } from "./ExtUiDialog";

describe("select dialog submit state", () => {
	test("multi-select submits every selected option as values", () => {
		expect(
			getSelectDialogSubmitState({
				isMulti: true,
				selectedValues: ["Fast", "Safe"],
				customSelected: false,
				customValue: "",
			}),
		).toEqual({ disabled: false, response: { values: ["Fast", "Safe"] } });
	});

	test("multi-select includes a trimmed custom option", () => {
		expect(
			getSelectDialogSubmitState({
				isMulti: true,
				selectedValues: ["Fast"],
				customSelected: true,
				customValue: "  Custom path  ",
			}),
		).toEqual({ disabled: false, response: { values: ["Fast", "Custom path"] } });
	});

	test("multi-select blocks empty submissions", () => {
		expect(
			getSelectDialogSubmitState({
				isMulti: true,
				selectedValues: [],
				customSelected: false,
				customValue: "",
			}),
		).toEqual({ disabled: true });
	});

	test("single-select keeps the legacy value response", () => {
		expect(
			getSelectDialogSubmitState({
				isMulti: false,
				singleSelection: "Fast",
				selectedValues: [],
				customSelected: false,
				customValue: "",
			}),
		).toEqual({ disabled: false, response: { value: "Fast" } });
	});
});
