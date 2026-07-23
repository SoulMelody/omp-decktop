/**
 * Tests for the pure helpers used by the file-context menu + tree.
 * These don't require a DOM, so they run without @testing-library.
 */

import { describe, expect, test } from "bun:test";
import type { FsEntryMeta } from "@omp-deck/protocol";

/**
 * Replicates the filter logic inside `FileContextMenu` so we can test it
 * without mounting React. Returns the list of action labels that would
 * appear for the given entry.
 */
function menuLabelsFor(entry: FsEntryMeta): string[] {
	const items: Array<{ label: string; dirOnly?: boolean; fileOnly?: boolean }> = [
		{ label: "New File", dirOnly: true },
		{ label: "New Folder", dirOnly: true },
		{ label: "Rename" },
		{ label: "Delete" },
		{ label: "Copy Path" },
		{ label: "Reveal in Shell" },
	];
	return items
		.filter((item) => {
			if (item.dirOnly && !entry.isDir) return false;
			if (item.fileOnly && entry.isDir) return false;
			return true;
		})
		.map((item) => item.label);
}

describe("FileContextMenu action filtering", () => {
	const fileEntry: FsEntryMeta = {
		name: "index.ts", path: "src/index.ts",
		isDir: false, isFile: true, isSymlink: false,
	};
	const dirEntry: FsEntryMeta = {
		name: "src", path: "src",
		isDir: true, isFile: false, isSymlink: false,
	};

	test("directory shows create-file, create-folder + rename/delete/copy/reveal", () => {
		expect(menuLabelsFor(dirEntry)).toEqual([
			"New File", "New Folder", "Rename", "Delete", "Copy Path", "Reveal in Shell",
		]);
	});

	test("file hides New File / New Folder but shows the rest", () => {
		expect(menuLabelsFor(fileEntry)).toEqual([
			"Rename", "Delete", "Copy Path", "Reveal in Shell",
		]);
	});
});