import type Database from 'better-sqlite3';

export function migrate(db: Database.Database): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS projects (
			id TEXT PRIMARY KEY,
			slug TEXT NOT NULL UNIQUE,
			title TEXT NOT NULL,
			kind TEXT NOT NULL CHECK (kind IN ('standard', 'perpetual')),
			status TEXT NOT NULL CHECK (status IN ('active', 'on_hold', 'completed', 'archived')),
			summary TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			archived_at TEXT
		);

		CREATE TABLE IF NOT EXISTS notes (
			id TEXT PRIMARY KEY,
			project_id TEXT,
			kind TEXT NOT NULL CHECK (kind IN ('project_home', 'note', 'doc', 'decision', 'meeting', 'daily', 'inbox')),
			title TEXT NOT NULL,
			file_path TEXT NOT NULL UNIQUE,
			excerpt TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			archived_at TEXT,
			FOREIGN KEY (project_id) REFERENCES projects(id)
		);

		CREATE TABLE IF NOT EXISTS meetings (
			id TEXT PRIMARY KEY,
			project_id TEXT NOT NULL,
			note_id TEXT NOT NULL UNIQUE,
			title TEXT NOT NULL,
			meeting_date TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			archived_at TEXT,
			FOREIGN KEY (project_id) REFERENCES projects(id),
			FOREIGN KEY (note_id) REFERENCES notes(id)
		);

		CREATE TABLE IF NOT EXISTS daily_notes (
			id TEXT PRIMARY KEY,
			note_id TEXT NOT NULL UNIQUE,
			note_date TEXT NOT NULL UNIQUE,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			FOREIGN KEY (note_id) REFERENCES notes(id)
		);

		CREATE TABLE IF NOT EXISTS daily_focus (
			daily_note_id TEXT NOT NULL,
			project_id TEXT NOT NULL,
			position INTEGER NOT NULL DEFAULT 0,
			PRIMARY KEY (daily_note_id, project_id),
			FOREIGN KEY (daily_note_id) REFERENCES daily_notes(id),
			FOREIGN KEY (project_id) REFERENCES projects(id)
		);

		CREATE TABLE IF NOT EXISTS tasks (
			id TEXT PRIMARY KEY,
			project_id TEXT NOT NULL,
			parent_task_id TEXT,
			source_meeting_id TEXT,
			source_note_id TEXT,
			title TEXT NOT NULL,
			description_md TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL CHECK (status IN ('todo', 'in_progress', 'blocked', 'done', 'cancelled')),
			priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
			scheduled_for TEXT,
			due_at TEXT,
			position INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			completed_at TEXT,
			archived_at TEXT,
			FOREIGN KEY (project_id) REFERENCES projects(id),
			FOREIGN KEY (parent_task_id) REFERENCES tasks(id),
			FOREIGN KEY (source_meeting_id) REFERENCES meetings(id),
			FOREIGN KEY (source_note_id) REFERENCES notes(id)
		);

		CREATE TABLE IF NOT EXISTS object_links (
			id TEXT PRIMARY KEY,
			from_type TEXT NOT NULL CHECK (from_type IN ('note', 'task')),
			from_id TEXT NOT NULL,
			to_type TEXT NOT NULL CHECK (to_type IN ('project', 'note', 'meeting', 'task')),
			to_id TEXT NOT NULL,
			label TEXT NOT NULL DEFAULT '',
			raw_text TEXT NOT NULL,
			created_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS recent_items (
			object_type TEXT NOT NULL,
			object_id TEXT NOT NULL,
			last_opened_at TEXT NOT NULL,
			PRIMARY KEY (object_type, object_id)
		);

		CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
			object_type,
			object_id,
			title,
			body,
			project_title,
			updated_at,
			project_slug
		);

		CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
		CREATE INDEX IF NOT EXISTS idx_projects_kind ON projects(kind);
		CREATE INDEX IF NOT EXISTS idx_notes_project_id ON notes(project_id);
		CREATE INDEX IF NOT EXISTS idx_notes_kind ON notes(kind);
		CREATE INDEX IF NOT EXISTS idx_meetings_project_id ON meetings(project_id);
		CREATE INDEX IF NOT EXISTS idx_meetings_meeting_date ON meetings(meeting_date);
		CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
		CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id);
		CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
		CREATE INDEX IF NOT EXISTS idx_object_links_to ON object_links(to_type, to_id);
		CREATE INDEX IF NOT EXISTS idx_object_links_from ON object_links(from_type, from_id);
	`);
}
