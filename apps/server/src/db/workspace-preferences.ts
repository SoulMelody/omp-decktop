import type { ModelRef, WorkspacePreference } from "@omp-deck/protocol";

import { getDb } from "./index.ts";

interface WorkspacePreferenceRow {
	cwd: string;
	provider: string;
	model_id: string;
	updated_at: string;
}

function rowToPreference(row: WorkspacePreferenceRow): WorkspacePreference {
	return {
		cwd: row.cwd,
		model: { provider: row.provider, id: row.model_id },
	};
}

export function getWorkspacePreference(cwd: string): WorkspacePreference | undefined {
	const row = getDb()
		.query<WorkspacePreferenceRow, [string]>(
			`SELECT cwd, provider, model_id, updated_at
			 FROM workspace_preferences
			 WHERE cwd = ?`,
		)
		.get(cwd) as WorkspacePreferenceRow | null;
	return row ? rowToPreference(row) : undefined;
}

export function setWorkspacePreference(cwd: string, model: ModelRef | null): WorkspacePreference {
	const db = getDb();
	if (model === null) {
		db.prepare<unknown, [string]>("DELETE FROM workspace_preferences WHERE cwd = ?").run(cwd);
		return { cwd, model: null };
	}
	db.prepare<unknown, [string, string, string]>(
		`INSERT INTO workspace_preferences (cwd, provider, model_id, updated_at)
		 VALUES (?, ?, ?, datetime('now'))
		 ON CONFLICT(cwd) DO UPDATE SET
			provider = excluded.provider,
			model_id = excluded.model_id,
			updated_at = datetime('now')`,
	).run(cwd, model.provider, model.id);
	return { cwd, model: { provider: model.provider, id: model.id } };
}

export function listWorkspacePreferences(): WorkspacePreference[] {
	const rows = getDb()
		.query<WorkspacePreferenceRow, []>(
			`SELECT cwd, provider, model_id, updated_at
			 FROM workspace_preferences
			 ORDER BY updated_at DESC, cwd ASC`,
		)
		.all() as WorkspacePreferenceRow[];
	return rows.map(rowToPreference);
}
