/**
 * Unit tests for workspace model preferences. Each test boots a fresh on-disk
 * SQLite database so migrations and persistence run end-to-end.
 */
import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { ModelRef } from "@omp-deck/protocol";

import { closeDb, openDb } from "./index.ts";
import {
	getWorkspacePreference,
	listWorkspacePreferences,
	setWorkspacePreference,
} from "./workspace-preferences.ts";

let dbDir: string | null = null;

afterEach(() => {
	closeDb();
	if (dbDir) {
		try {
			fs.rmSync(dbDir, { recursive: true, force: true });
		} catch {
			// Windows SQLite handles can lag past close(); leaking a temp dir is
			// fine, failing the suite is not.
		}
		dbDir = null;
	}
});

function bootDb(): void {
	dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-deck-workspace-preferences-db-"));
	openDb({ path: path.join(dbDir, "deck.db") });
}

function model(provider: string, id: string): ModelRef {
	return { provider, id };
}

describe("workspace preferences", () => {
	test("setWorkspacePreference stores and getWorkspacePreference returns the model for a cwd", () => {
		bootDb();
		const cwd = path.join(dbDir!, "project-a");
		const ref = model("openai", "gpt-5.1-codex");

		expect(setWorkspacePreference(cwd, ref)).toEqual({ cwd, model: ref });
		expect(getWorkspacePreference(cwd)).toEqual({ cwd, model: ref });
	});

	test("setWorkspacePreference with null clears the stored model", () => {
		bootDb();
		const cwd = path.join(dbDir!, "project-a");
		setWorkspacePreference(cwd, model("anthropic", "claude-sonnet-5"));

		expect(setWorkspacePreference(cwd, null)).toEqual({ cwd, model: null });

		expect(getWorkspacePreference(cwd)).toBeUndefined();
		expect(listWorkspacePreferences()).toEqual([]);
	});

	test("listWorkspacePreferences orders preferences by most recently updated workspace", async () => {
		bootDb();
		const older = path.join(dbDir!, "older-project");
		const newer = path.join(dbDir!, "newer-project");
		setWorkspacePreference(older, model("openai", "gpt-5.1-codex"));
		await new Promise((resolve) => setTimeout(resolve, 10));
		setWorkspacePreference(newer, model("anthropic", "claude-sonnet-5"));

		expect(listWorkspacePreferences().map((p) => p.cwd)).toEqual([newer, older]);
	});

	test("setWorkspacePreference upserts a cwd without creating duplicate rows", async () => {
		bootDb();
		const cwd = path.join(dbDir!, "project-a");
		setWorkspacePreference(cwd, model("openai", "gpt-5.1-codex"));
		await new Promise((resolve) => setTimeout(resolve, 10));

		const replacement = model("anthropic", "claude-sonnet-5");
		expect(setWorkspacePreference(cwd, replacement)).toEqual({ cwd, model: replacement });

		expect(getWorkspacePreference(cwd)).toEqual({ cwd, model: replacement });
		expect(listWorkspacePreferences()).toEqual([{ cwd, model: replacement }]);
	});
});
