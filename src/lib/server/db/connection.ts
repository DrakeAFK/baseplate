import Database from 'better-sqlite3';
import { getDbPath, getWorkspaceDir } from '$lib/server/workspace/paths';
import { migrate } from './migrate';
import fs from 'node:fs';
import path from 'node:path';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
	if (db) {
		return db;
	}

	fs.mkdirSync(getWorkspaceDir(), { recursive: true });
	fs.mkdirSync(path.dirname(getDbPath()), { recursive: true });
	db = new Database(getDbPath());
	db.pragma('journal_mode = WAL');
	db.pragma('foreign_keys = ON');
	db.pragma('synchronous = NORMAL');
	db.pragma('temp_store = MEMORY');
	migrate(db);
	return db;
}
