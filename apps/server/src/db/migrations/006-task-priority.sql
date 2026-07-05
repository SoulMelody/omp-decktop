ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'P5'
	CHECK (priority IN ('P0', 'P1', 'P2', 'P3', 'P4', 'P5'));

UPDATE tasks
SET priority = 'P0', title = REPLACE(title, '[P0] ', '')
WHERE title LIKE '[P0] %';

UPDATE tasks
SET priority = 'P1', title = REPLACE(title, '[P1] ', '')
WHERE title LIKE '[P1] %';

UPDATE tasks
SET priority = 'P2', title = REPLACE(title, '[P2] ', '')
WHERE title LIKE '[P2] %';

UPDATE tasks
SET priority = 'P3', title = REPLACE(title, '[P3] ', '')
WHERE title LIKE '[P3] %';

CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(state_id, priority);
