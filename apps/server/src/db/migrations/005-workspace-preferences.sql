CREATE TABLE IF NOT EXISTS workspace_preferences (
	cwd TEXT PRIMARY KEY,
	provider TEXT NOT NULL,
	model_id TEXT NOT NULL,
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_workspace_prefs_updated ON workspace_preferences(updated_at DESC);
