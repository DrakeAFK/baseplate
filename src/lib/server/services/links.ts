import type { NoteKind, SearchObjectType } from '$lib/types/models';
import { getDb } from '$lib/server/db/connection';

function getTitleForObject(type: SearchObjectType, id: string): string | null {
	const table = type === 'project' ? 'projects' : type === 'task' ? 'tasks' : type === 'meeting' ? 'meetings' : 'notes';
	const row = getDb().prepare(`SELECT title FROM ${table} WHERE id = ?`).get(id) as { title: string } | undefined;
	return row?.title ?? null;
}

export function resolveObjectHref(type: SearchObjectType, id: string): string | null {
	if (type === 'project') {
		const project = getDb().prepare('SELECT slug FROM projects WHERE id = ?').get(id) as { slug: string } | undefined;
		return project ? `/projects/${project.slug}` : null;
	}

	if (type === 'task') {
		const row = getDb()
			.prepare(
				`SELECT tasks.id, projects.slug
				 FROM tasks
				 JOIN projects ON projects.id = tasks.project_id
				 WHERE tasks.id = ?`
			)
			.get(id) as { id: string; slug: string } | undefined;
		return row ? `/projects/${row.slug}?task=${row.id}` : null;
	}

	if (type === 'meeting') {
		const row = getDb()
			.prepare(
				`SELECT meetings.id, projects.slug
				 FROM meetings
				 JOIN projects ON projects.id = meetings.project_id
				 WHERE meetings.id = ?`
			)
			.get(id) as { id: string; slug: string } | undefined;
		return row ? `/projects/${row.slug}/meetings/${row.id}` : null;
	}

	const row = getDb()
		.prepare(
			`SELECT notes.id, notes.kind, projects.slug
			 FROM notes
			 LEFT JOIN projects ON projects.id = notes.project_id
			 WHERE notes.id = ?`
		)
		.get(id) as { id: string; kind: NoteKind; slug: string | null } | undefined;
	if (!row) return null;
	if (row.kind === 'daily') return '/today';
	if (row.kind === 'inbox') return '/inbox';
	if (!row.slug) return null;
	if (row.kind === 'meeting') {
		const meeting = getDb().prepare('SELECT id FROM meetings WHERE note_id = ?').get(id) as { id: string } | undefined;
		return meeting ? `/projects/${row.slug}/meetings/${meeting.id}` : null;
	}
	return `/projects/${row.slug}/notes/${row.id}`;
}

export function resolveObjectLabel(type: SearchObjectType, id: string, alias?: string | null): string {
	return alias || getTitleForObject(type, id) || `${type}/${id}`;
}
