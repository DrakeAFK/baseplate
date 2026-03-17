import fs from 'node:fs';
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import { getDb } from '$lib/server/db/connection';
import { buildOutgoingLinks } from '$lib/markdown/extract-links';
import { renderMarkdown } from '$lib/markdown/render';
import { resolveObjectHref } from './links';
import type {
	AppShellData,
	BacklinkItem,
	DailyNoteMeta,
	Meeting,
	MeetingDocument,
	Note,
	NotesIndexItem,
	NoteDocument,
	NoteKind,
	Project,
	ProjectDashboard,
	ProjectKind,
	ProjectStatus,
	SearchObjectType,
	SearchResult,
	Task,
	TaskPriority,
	TaskStatus,
	TaskTreeItem,
	TodayShortcut,
	TodayDashboard
} from '$lib/types/models';
import { formatDate, formatRelative, nowIso, todayDate } from '$lib/utils/dates';
import { createId } from '$lib/utils/ids';
import { toSlug, uniqueSlug } from '$lib/utils/slug';
import { fileExists, readManagedMarkdown, writeManagedMarkdown } from '$lib/server/workspace/files';
import {
	getDailyNotePath,
	getInboxPath,
	getMeetingPath,
	getProjectDir,
	getProjectHomePath,
	getProjectNotePath,
	getProjectsDir,
	getWorkspaceDir
} from '$lib/server/workspace/paths';
import { defaultTemplate } from '$lib/server/workspace/templates';

let bootstrapped = false;
let watcher: FSWatcher | null = null;

type Row = Record<string, string | number | null>;

function stripMarkdown(value: string): string {
	return value.replace(/[#>*_\-\[\]`]/g, ' ').replace(/\s+/g, ' ').trim();
}

function excerptForBody(body: string): string {
	return stripMarkdown(body).slice(0, 200);
}

function projectSlugById(id: string): string | null {
	const row = getDb().prepare('SELECT slug FROM projects WHERE id = ?').get(id) as { slug: string } | undefined;
	return row?.slug ?? null;
}

function projectStatusSortCase(column = 'projects.status'): string {
	return `CASE ${column}
		WHEN 'active' THEN 0
		WHEN 'on_hold' THEN 1
		WHEN 'completed' THEN 2
		WHEN 'archived' THEN 3
		ELSE 4
	END`;
}

function labelFromSnakeCase(value: string): string {
	return value.replaceAll('_', ' ');
}

function nextProjectSortPosition(status: ProjectStatus): number {
	const row = getDb()
		.prepare('SELECT COALESCE(MAX(sort_position), -1) AS max_position FROM projects WHERE status = ?')
		.get(status) as { max_position: number };
	return (row.max_position ?? -1) + 1;
}

function getWorkspaceSnapshot(): AppShellData['snapshot'] {
	const db = getDb();
	return {
		projectCount: Number(
			(
				db.prepare("SELECT COUNT(*) AS count FROM projects WHERE archived_at IS NULL AND status != 'archived'").get() as {
					count: number;
				}
			).count
		),
		openTaskCount: Number(
			(
				db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE archived_at IS NULL AND status NOT IN ('done', 'cancelled')").get() as {
					count: number;
				}
			).count
		),
		noteCount: Number(
			(
				db.prepare("SELECT COUNT(*) AS count FROM notes WHERE archived_at IS NULL AND kind IN ('note', 'doc', 'decision')").get() as {
					count: number;
				}
			).count
		),
		meetingCount: Number(
			(
				db.prepare('SELECT COUNT(*) AS count FROM meetings WHERE archived_at IS NULL').get() as {
					count: number;
				}
			).count
		)
	};
}

export function getProjectStatusCounts(): Record<ProjectStatus, number> {
	const db = getDb();
	const rows = db
		.prepare(
			`SELECT status, COUNT(*) AS count
			 FROM projects
			 GROUP BY status`
		)
		.all() as Array<{ status: ProjectStatus; count: number }>;

	return {
		active: rows.find((row) => row.status === 'active')?.count ?? 0,
		on_hold: rows.find((row) => row.status === 'on_hold')?.count ?? 0,
		completed: rows.find((row) => row.status === 'completed')?.count ?? 0,
		archived: rows.find((row) => row.status === 'archived')?.count ?? 0
	};
}

function ensureWorkspaceScaffold(): void {
	fs.mkdirSync(path.join(getWorkspaceDir(), '.app'), { recursive: true });
	fs.mkdirSync(path.join(getWorkspaceDir(), 'projects'), { recursive: true });
	fs.mkdirSync(path.join(getWorkspaceDir(), 'daily'), { recursive: true });
	fs.mkdirSync(path.join(getWorkspaceDir(), 'inbox'), { recursive: true });
}

function createProjectFolders(slug: string): void {
	for (const folder of ['notes', 'docs', 'decisions', 'meetings']) {
		fs.mkdirSync(path.join(getProjectDir(slug), folder), { recursive: true });
	}
}

function findAvailablePath(filePath: string): string {
	if (!fileExists(filePath)) {
		return filePath;
	}

	const directory = path.dirname(filePath);
	const extension = path.extname(filePath);
	const baseName = path.basename(filePath, extension);
	let counter = 2;

	while (true) {
		const candidate = path.join(directory, `${baseName}-${counter}${extension}`);
		if (!fileExists(candidate)) {
			return candidate;
		}
		counter += 1;
	}
}

function upsertSearchRow(
	objectType: SearchObjectType,
	objectId: string,
	title: string,
	body: string,
	projectTitle: string,
	updatedAt: string,
	projectSlug: string | null
): void {
	const db = getDb();
	db.prepare('DELETE FROM search_fts WHERE object_type = ? AND object_id = ?').run(objectType, objectId);
	db.prepare(
		'INSERT INTO search_fts (object_type, object_id, title, body, project_title, updated_at, project_slug) VALUES (?, ?, ?, ?, ?, ?, ?)'
	).run(objectType, objectId, title, body, projectTitle, updatedAt, projectSlug);
}

function replaceObjectLinks(fromType: 'note' | 'task', fromId: string, content: string): void {
	const db = getDb();
	db.prepare('DELETE FROM object_links WHERE from_type = ? AND from_id = ?').run(fromType, fromId);
	for (const link of buildOutgoingLinks(fromType, fromId, content)) {
		db.prepare(
			'INSERT INTO object_links (id, from_type, from_id, to_type, to_id, label, raw_text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
		).run(link.id, link.from_type, link.from_id, link.to_type, link.to_id, link.label, link.raw_text, link.created_at);
	}
}

function getProjectById(projectId: string): Project | null {
	return (getDb().prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as Project | undefined) ?? null;
}

function getProjectBySlug(slug: string): Project | null {
	return (getDb().prepare('SELECT * FROM projects WHERE slug = ?').get(slug) as Project | undefined) ?? null;
}

function getNoteById(noteId: string): Note | null {
	return (getDb().prepare('SELECT * FROM notes WHERE id = ?').get(noteId) as Note | undefined) ?? null;
}

function getMeetingById(meetingId: string): Meeting | null {
	return (getDb().prepare('SELECT * FROM meetings WHERE id = ?').get(meetingId) as Meeting | undefined) ?? null;
}

export function bootstrapWorkspace(): void {
	if (bootstrapped) return;
	ensureWorkspaceScaffold();
	getDb();
	seedDefaults();
	reindexWorkspace();
	startWatcher();
	bootstrapped = true;
}

function seedDefaults(): void {
	const db = getDb();
	const now = nowIso();
	const quickWork = db.prepare('SELECT * FROM projects WHERE slug = ?').get('quick-work') as Project | undefined;

	if (!quickWork) {
		const project = createProject({
			title: 'Quick Work',
			kind: 'perpetual',
			summary: 'Default perpetual project for one-off work and short tasks.'
		});
		void project;
	}

	const inbox = db.prepare("SELECT * FROM notes WHERE kind = 'inbox'").get() as Note | undefined;
	if (!inbox) {
		db.prepare(
			'INSERT INTO notes (id, project_id, kind, title, file_path, excerpt, created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)'
		).run('nte_inbox', null, 'inbox', 'Inbox', getInboxPath(), '', now, now);
		writeManagedMarkdown(
			getInboxPath(),
			{
				id: 'nte_inbox',
				kind: 'inbox',
				title: 'Inbox',
				created_at: now,
				updated_at: now
			},
			defaultTemplate('inbox', 'Inbox')
		);
	}

	getOrCreateTodayDashboard();
}

function startWatcher(): void {
	if (watcher) return;

	watcher = chokidar.watch(
		[
			path.join(getProjectsDir(), '**/*.md'),
			path.join(getWorkspaceDir(), 'daily/**/*.md'),
			path.join(getWorkspaceDir(), 'inbox/**/*.md')
		],
		{
			ignoreInitial: true,
			ignored: ['**/.app/**', '**/.*.swp', '**/*~']
		}
	);

	watcher.on('change', (filePath) => {
		try {
			reindexFile(filePath);
		} catch (error) {
			console.error('watcher change failed', error);
		}
	});
}

export function listActiveProjects(limit = 8): Project[] {
	return getDb()
		.prepare(
			`SELECT * FROM projects
			 WHERE archived_at IS NULL AND status != 'archived'
			 ORDER BY ${projectStatusSortCase()}, sort_position ASC, updated_at DESC
			 LIMIT ?`
		)
		.all(limit) as Project[];
}

export function listProjects(filters?: { status?: ProjectStatus; q?: string }): Project[] {
	const clauses = ['1=1'];
	const params: Array<string> = [];
	if (filters?.status) {
		clauses.push('status = ?');
		params.push(filters.status);
	}
	if (filters?.q) {
		clauses.push('(title LIKE ? OR summary LIKE ?)');
		params.push(`%${filters.q}%`, `%${filters.q}%`);
	}
	const orderBy = filters?.status
		? 'sort_position ASC, updated_at DESC, title COLLATE NOCASE ASC'
		: `${projectStatusSortCase()}, sort_position ASC, updated_at DESC`;
	return getDb()
		.prepare(`SELECT * FROM projects WHERE ${clauses.join(' AND ')} ORDER BY ${orderBy}`)
		.all(...params) as Project[];
}

export function createProject(input: {
	title: string;
	kind: ProjectKind;
	summary?: string;
}): Project {
	const db = getDb();
	const existing = new Set(
		(db.prepare('SELECT slug FROM projects').all() as Array<{ slug: string }>).map((row) => row.slug)
	);
	const slug = uniqueSlug(input.title, existing);
	const project: Project = {
		id: createId('prj'),
		slug,
		title: input.title,
		kind: input.kind,
		status: 'active',
		summary: input.summary ?? '',
		sort_position: nextProjectSortPosition('active'),
		created_at: nowIso(),
		updated_at: nowIso(),
		archived_at: null
	};

	db.prepare(
		'INSERT INTO projects (id, slug, title, kind, status, summary, sort_position, created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)'
	).run(
		project.id,
		project.slug,
		project.title,
		project.kind,
		project.status,
		project.summary,
		project.sort_position,
		project.created_at,
		project.updated_at
	);

	createProjectFolders(project.slug);

	const homeNote: Note = {
		id: createId('nte'),
		project_id: project.id,
		kind: 'project_home',
		title: project.title,
		file_path: getProjectHomePath(project.slug),
		excerpt: '',
		created_at: project.created_at,
		updated_at: project.updated_at,
		archived_at: null
	};

	db.prepare(
		'INSERT INTO notes (id, project_id, kind, title, file_path, excerpt, created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)'
	).run(
		homeNote.id,
		homeNote.project_id,
		homeNote.kind,
		homeNote.title,
		homeNote.file_path,
		homeNote.excerpt,
		homeNote.created_at,
		homeNote.updated_at
	);

	writeManagedMarkdown(
		homeNote.file_path,
		{
			id: homeNote.id,
			kind: 'project_home',
			project: project.slug,
			title: project.title,
			created_at: homeNote.created_at,
			updated_at: homeNote.updated_at
		},
		defaultTemplate('project_home', project.title)
	);

	reindexFile(homeNote.file_path);
	upsertSearchRow('project', project.id, project.title, project.summary, project.title, project.updated_at, project.slug);
	return project;
}

export function updateProject(id: string, patch: Partial<Pick<Project, 'title' | 'summary' | 'status' | 'kind'>>): Project {
	const existing = getProjectById(id);
	if (!existing) throw new Error('Project not found');
	const db = getDb();
	let slug = existing.slug;
	const nextStatus = patch.status ?? existing.status;

	if (patch.title && patch.title !== existing.title) {
		const allSlugs = new Set(
			(db.prepare('SELECT slug FROM projects WHERE id != ?').all(id) as Array<{ slug: string }>).map((row) => row.slug)
		);
		slug = uniqueSlug(patch.title, allSlugs);
		fs.renameSync(getProjectDir(existing.slug), getProjectDir(slug));
		const notes = db.prepare('SELECT * FROM notes WHERE project_id = ?').all(id) as Note[];
		for (const note of notes) {
			const nextPath =
				note.kind === 'project_home'
					? getProjectHomePath(slug)
					: note.kind === 'meeting'
						? (() => {
								const meeting = db.prepare('SELECT * FROM meetings WHERE note_id = ?').get(note.id) as Meeting;
								return getMeetingPath(slug, meeting.meeting_date, toSlug(meeting.title));
							})()
						: getProjectNotePath(slug, note.kind as 'note' | 'doc' | 'decision', toSlug(patch.title === note.title ? patch.title : note.title));
			if (note.file_path !== nextPath && fileExists(note.file_path)) {
				fs.mkdirSync(path.dirname(nextPath), { recursive: true });
				fs.renameSync(note.file_path, nextPath);
			}
			db.prepare('UPDATE notes SET file_path = ? WHERE id = ?').run(nextPath, note.id);
			if (fileExists(nextPath)) {
				const parsed = readManagedMarkdown(nextPath);
				writeManagedMarkdown(nextPath, { ...parsed.data, project: slug, title: note.kind === 'project_home' ? patch.title ?? existing.title : parsed.data.title, updated_at: nowIso() }, parsed.body);
			}
		}
	}

	const archivedAt =
		patch.status === undefined
			? existing.archived_at
			: patch.status === 'archived'
				? existing.archived_at ?? nowIso()
				: null;
	const sortPosition = nextStatus === existing.status ? existing.sort_position : nextProjectSortPosition(nextStatus);

	const updated: Project = {
		...existing,
		title: patch.title ?? existing.title,
		summary: patch.summary ?? existing.summary,
		status: nextStatus,
		kind: patch.kind ?? existing.kind,
		slug,
		sort_position: sortPosition,
		updated_at: nowIso(),
		archived_at: archivedAt
	};

	db.prepare(
		'UPDATE projects SET slug = ?, title = ?, summary = ?, status = ?, kind = ?, sort_position = ?, updated_at = ?, archived_at = ? WHERE id = ?'
	).run(
		updated.slug,
		updated.title,
		updated.summary,
		updated.status,
		updated.kind,
		updated.sort_position,
		updated.updated_at,
		updated.archived_at,
		updated.id
	);
	upsertSearchRow('project', updated.id, updated.title, updated.summary, updated.title, updated.updated_at, updated.slug);
	return updated;
}

export function reorderProjects(status: ProjectStatus, projectIds: string[]): void {
	const currentIds = listProjects({ status }).map((project) => project.id);
	if (currentIds.length !== projectIds.length) {
		throw new Error('Project order is out of date. Refresh and try again.');
	}

	const allowedIds = new Set(currentIds);
	if (new Set(projectIds).size !== projectIds.length || projectIds.some((projectId) => !allowedIds.has(projectId))) {
		throw new Error('Project order payload is invalid.');
	}

	const db = getDb();
	const applyOrder = db.transaction((ids: string[]) => {
		for (const [index, projectId] of ids.entries()) {
			db.prepare('UPDATE projects SET sort_position = ? WHERE id = ? AND status = ?').run(index, projectId, status);
		}
	});

	applyOrder(projectIds);
}

export function archiveProject(id: string, archived: boolean): void {
	const project = getProjectById(id);
	if (!project) throw new Error('Project not found');
	const nextStatus: ProjectStatus = archived ? 'archived' : project.status === 'archived' ? 'active' : project.status;
	getDb()
		.prepare('UPDATE projects SET status = ?, archived_at = ?, updated_at = ? WHERE id = ?')
		.run(nextStatus, archived ? nowIso() : null, nowIso(), id);
}

export function createNote(input: {
	projectId: string;
	title: string;
	kind: 'note' | 'doc' | 'decision';
}): Note {
	const project = getProjectById(input.projectId);
	if (!project) throw new Error('Project not found');
	const db = getDb();
	const noteId = createId('nte');
	const filePath = findAvailablePath(getProjectNotePath(project.slug, input.kind, toSlug(input.title)));
	const note: Note = {
		id: noteId,
		project_id: project.id,
		kind: input.kind,
		title: input.title,
		file_path: filePath,
		excerpt: '',
		created_at: nowIso(),
		updated_at: nowIso(),
		archived_at: null
	};
	db.prepare(
		'INSERT INTO notes (id, project_id, kind, title, file_path, excerpt, created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)'
	).run(note.id, note.project_id, note.kind, note.title, note.file_path, note.excerpt, note.created_at, note.updated_at);
	writeManagedMarkdown(
		note.file_path,
		{
			id: note.id,
			kind: note.kind,
			project: project.slug,
			title: note.title,
			created_at: note.created_at,
			updated_at: note.updated_at
		},
		defaultTemplate(note.kind, note.title)
	);
	reindexFile(note.file_path);
	return note;
}

export function updateNote(id: string, patch: Partial<Pick<Note, 'title'>>): Note {
	const note = getNoteById(id);
	if (!note) throw new Error('Note not found');
	const db = getDb();
	const projectSlug = note.project_id ? projectSlugById(note.project_id) : null;
	const nextTitle = patch.title ?? note.title;
	let nextPath = note.file_path;
	if (patch.title && projectSlug && ['note', 'doc', 'decision'].includes(note.kind)) {
		nextPath = findAvailablePath(
			getProjectNotePath(projectSlug, note.kind as 'note' | 'doc' | 'decision', toSlug(patch.title))
		);
		if (nextPath !== note.file_path && fileExists(note.file_path)) {
			fs.mkdirSync(path.dirname(nextPath), { recursive: true });
			fs.renameSync(note.file_path, nextPath);
		}
	}
	const updatedAt = nowIso();
	db.prepare('UPDATE notes SET title = ?, file_path = ?, updated_at = ? WHERE id = ?').run(nextTitle, nextPath, updatedAt, id);
	if (fileExists(nextPath)) {
		const parsed = readManagedMarkdown(nextPath);
		writeManagedMarkdown(nextPath, { ...parsed.data, title: nextTitle, updated_at: updatedAt }, parsed.body);
	}
	reindexFile(nextPath);
	return getNoteById(id)!;
}

export function archiveNote(id: string, archived: boolean): void {
	getDb().prepare('UPDATE notes SET archived_at = ?, updated_at = ? WHERE id = ?').run(archived ? nowIso() : null, nowIso(), id);
}

export function saveNoteContent(id: string, body: string): NoteDocument {
	const note = getNoteById(id);
	if (!note) throw new Error('Note not found');
	const parsed = fileExists(note.file_path) ? readManagedMarkdown(note.file_path) : null;
	const updatedAt = nowIso();
	writeManagedMarkdown(
		note.file_path,
		{
			id: note.id,
			kind: note.kind,
			project: note.project_id ? projectSlugById(note.project_id) ?? undefined : undefined,
			title: note.title,
			meeting_date: parsed?.data.meeting_date,
			note_date: parsed?.data.note_date,
			created_at: note.created_at,
			updated_at: updatedAt
		},
		body
	);
	getDb()
		.prepare('UPDATE notes SET excerpt = ?, updated_at = ? WHERE id = ?')
		.run(excerptForBody(body), updatedAt, id);
	reindexFile(note.file_path);
	return getNoteDocument(id);
}

export function createMeeting(input: { projectId: string; title: string; meetingDate: string }): Meeting {
	const project = getProjectById(input.projectId);
	if (!project) throw new Error('Project not found');
	const db = getDb();
	const noteId = createId('nte');
	const meetingId = createId('mtg');
	const filePath = findAvailablePath(getMeetingPath(project.slug, input.meetingDate, toSlug(input.title)));
	const createdAt = nowIso();
	db.prepare(
		'INSERT INTO notes (id, project_id, kind, title, file_path, excerpt, created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)'
	).run(noteId, project.id, 'meeting', input.title, filePath, '', createdAt, createdAt);
	db.prepare(
		'INSERT INTO meetings (id, project_id, note_id, title, meeting_date, created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)'
	).run(meetingId, project.id, noteId, input.title, input.meetingDate, createdAt, createdAt);
	writeManagedMarkdown(
		filePath,
		{
			id: noteId,
			kind: 'meeting',
			project: project.slug,
			title: input.title,
			meeting_date: input.meetingDate,
			created_at: createdAt,
			updated_at: createdAt
		},
		defaultTemplate('meeting', input.title)
	);
	reindexFile(filePath);
	return getMeetingById(meetingId)!;
}

export function updateMeeting(id: string, patch: Partial<Pick<Meeting, 'title' | 'meeting_date'>>): Meeting {
	const meeting = getMeetingById(id);
	if (!meeting) throw new Error('Meeting not found');
	const note = getNoteById(meeting.note_id);
	if (!note) throw new Error('Meeting note missing');
	const projectSlug = projectSlugById(meeting.project_id);
	if (!projectSlug) throw new Error('Project missing');

	const nextTitle = patch.title ?? meeting.title;
	const nextDate = patch.meeting_date ?? meeting.meeting_date;
	const nextPath = findAvailablePath(getMeetingPath(projectSlug, nextDate, toSlug(nextTitle)));
	if (nextPath !== note.file_path && fileExists(note.file_path)) {
		fs.mkdirSync(path.dirname(nextPath), { recursive: true });
		fs.renameSync(note.file_path, nextPath);
	}
	const updatedAt = nowIso();
	getDb()
		.prepare('UPDATE meetings SET title = ?, meeting_date = ?, updated_at = ? WHERE id = ?')
		.run(nextTitle, nextDate, updatedAt, id);
	getDb().prepare('UPDATE notes SET title = ?, file_path = ?, updated_at = ? WHERE id = ?').run(nextTitle, nextPath, updatedAt, note.id);
	if (fileExists(nextPath)) {
		const parsed = readManagedMarkdown(nextPath);
		writeManagedMarkdown(nextPath, { ...parsed.data, title: nextTitle, meeting_date: nextDate, updated_at: updatedAt }, parsed.body);
	}
	reindexFile(nextPath);
	return getMeetingById(id)!;
}

export function archiveMeeting(id: string, archived: boolean): void {
	getDb().prepare('UPDATE meetings SET archived_at = ?, updated_at = ? WHERE id = ?').run(archived ? nowIso() : null, nowIso(), id);
}

export function saveMeetingContent(id: string, body: string): MeetingDocument {
	const meeting = getMeetingById(id);
	if (!meeting) throw new Error('Meeting not found');
	saveNoteContent(meeting.note_id, body);
	return getMeetingDocument(id);
}

export function createTask(input: {
	projectId: string;
	title: string;
	parentTaskId?: string | null;
	description?: string;
	priority?: TaskPriority;
	status?: TaskStatus;
	scheduledFor?: string | null;
	dueAt?: string | null;
	sourceMeetingId?: string | null;
	sourceNoteId?: string | null;
}): Task {
	const db = getDb();
	const existing = db
		.prepare('SELECT COALESCE(MAX(position), -1) AS max_position FROM tasks WHERE project_id = ? AND parent_task_id IS ?')
		.get(input.projectId, input.parentTaskId ?? null) as { max_position: number };
	const status = input.status ?? 'todo';
	const task: Task = {
		id: createId('tsk'),
		project_id: input.projectId,
		parent_task_id: input.parentTaskId ?? null,
		source_meeting_id: input.sourceMeetingId ?? null,
		source_note_id: input.sourceNoteId ?? null,
		title: input.title,
		description_md: input.description ?? '',
		status,
		priority: input.priority ?? 'medium',
		scheduled_for: input.scheduledFor ?? null,
		due_at: input.dueAt ?? null,
		position: (existing.max_position ?? -1) + 1,
		created_at: nowIso(),
		updated_at: nowIso(),
		completed_at: status === 'done' ? nowIso() : null,
		archived_at: null
	};

	db.prepare(
		`INSERT INTO tasks (
			id, project_id, parent_task_id, source_meeting_id, source_note_id, title, description_md, status, priority,
			scheduled_for, due_at, position, created_at, updated_at, completed_at, archived_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
	).run(
		task.id,
		task.project_id,
		task.parent_task_id,
		task.source_meeting_id,
		task.source_note_id,
		task.title,
		task.description_md,
		task.status,
		task.priority,
		task.scheduled_for,
		task.due_at,
		task.position,
		task.created_at,
		task.updated_at,
		task.completed_at
	);
	replaceObjectLinks('task', task.id, task.description_md);
	upsertTaskSearch(task);
	return task;
}

function upsertTaskSearch(task: Task): void {
	const project = getProjectById(task.project_id);
	upsertSearchRow('task', task.id, task.title, task.description_md, project?.title ?? '', task.updated_at, project?.slug ?? null);
}

export function updateTask(id: string, patch: Partial<Omit<Task, 'id' | 'created_at' | 'position' | 'project_id'>>): Task {
	const current = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;
	if (!current) throw new Error('Task not found');
	const status = patch.status ?? current.status;
	const updated: Task = {
		...current,
		...patch,
		status,
		completed_at: status === 'done' ? current.completed_at ?? nowIso() : null,
		updated_at: nowIso()
	};
	getDb()
		.prepare(
			`UPDATE tasks
			 SET parent_task_id = ?, source_meeting_id = ?, source_note_id = ?, title = ?, description_md = ?, status = ?, priority = ?,
			     scheduled_for = ?, due_at = ?, updated_at = ?, completed_at = ?, archived_at = ?
			 WHERE id = ?`
		)
		.run(
			updated.parent_task_id,
			updated.source_meeting_id,
			updated.source_note_id,
			updated.title,
			updated.description_md,
			updated.status,
			updated.priority,
			updated.scheduled_for,
			updated.due_at,
			updated.updated_at,
			updated.completed_at,
			updated.archived_at,
			id
		);
	replaceObjectLinks('task', id, updated.description_md);
	upsertTaskSearch(updated);
	return updated;
}

export function archiveTask(id: string, archived: boolean): void {
	getDb().prepare('UPDATE tasks SET archived_at = ?, updated_at = ? WHERE id = ?').run(archived ? nowIso() : null, nowIso(), id);
}

function buildTaskTree(tasks: Task[]): TaskTreeItem[] {
	const byId = new Map<string, TaskTreeItem>();
	for (const task of tasks) {
		byId.set(task.id, { ...task, children: [] });
	}
	const roots: TaskTreeItem[] = [];
	for (const task of byId.values()) {
		if (task.parent_task_id && byId.has(task.parent_task_id)) {
			byId.get(task.parent_task_id)!.children.push(task);
		} else {
			roots.push(task);
		}
	}
	const sortTree = (items: TaskTreeItem[]) => {
		items.sort((a, b) => a.position - b.position || a.updated_at.localeCompare(b.updated_at));
		for (const item of items) sortTree(item.children);
	};
	sortTree(roots);
	return roots;
}

export function getProjectDashboard(slug: string): ProjectDashboard {
	const project = getProjectBySlug(slug);
	if (!project) throw new Error('Project not found');
	const db = getDb();
	const tasks = db
		.prepare('SELECT * FROM tasks WHERE project_id = ? AND archived_at IS NULL ORDER BY position ASC, updated_at DESC')
		.all(project.id) as Task[];
	const groupedStatuses: Record<TaskStatus, TaskTreeItem[]> = {
		todo: [],
		in_progress: [],
		blocked: [],
		done: [],
		cancelled: []
	};
	for (const status of Object.keys(groupedStatuses) as TaskStatus[]) {
		groupedStatuses[status] = buildTaskTree(tasks.filter((task) => task.status === status));
	}

	const meetings = db
		.prepare(
			`SELECT meetings.*, notes.excerpt,
			        (SELECT COUNT(*) FROM tasks WHERE tasks.source_meeting_id = meetings.id AND tasks.archived_at IS NULL) AS task_count
			 FROM meetings
			 JOIN notes ON notes.id = meetings.note_id
			 WHERE meetings.project_id = ? AND meetings.archived_at IS NULL
			 ORDER BY meetings.meeting_date DESC
			 LIMIT 8`
		)
		.all(project.id) as Array<Meeting & { excerpt: string; task_count: number }>;

	const notes = db
		.prepare(
			"SELECT * FROM notes WHERE project_id = ? AND kind IN ('note', 'doc', 'decision') AND archived_at IS NULL ORDER BY updated_at DESC"
		)
		.all(project.id) as Note[];

	const home = db
		.prepare("SELECT id FROM notes WHERE project_id = ? AND kind = 'project_home' LIMIT 1")
		.get(project.id) as { id: string } | undefined;

	return {
		project,
		homeNote: home ? getNoteDocument(home.id) : null,
		taskGroups: groupedStatuses,
		meetings,
		notesByKind: {
			note: notes.filter((note) => note.kind === 'note'),
			doc: notes.filter((note) => note.kind === 'doc'),
			decision: notes.filter((note) => note.kind === 'decision')
		},
		backlinks: getBacklinks('project', project.id),
		activity: [
			...meetings.map((meeting) => ({
				type: 'meeting' as const,
				id: meeting.id,
				title: meeting.title,
				updatedAt: meeting.updated_at,
				href: `/projects/${project.slug}/meetings/${meeting.id}`
			})),
			...notes.slice(0, 4).map((note) => ({
				type: 'note' as const,
				id: note.id,
				title: note.title,
				updatedAt: note.updated_at,
				href: `/projects/${project.slug}/notes/${note.id}`
			})),
			...tasks.slice(0, 4).map((task) => ({
				type: 'task' as const,
				id: task.id,
				title: task.title,
				updatedAt: task.updated_at,
				href: `/projects/${project.slug}#task-${task.id}`
			}))
		]
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.slice(0, 10)
	};
}

export function getBacklinks(type: SearchObjectType, id: string): BacklinkItem[] {
	const db = getDb();
	const links = db
		.prepare('SELECT * FROM object_links WHERE to_type = ? AND to_id = ? ORDER BY created_at DESC')
		.all(type, id) as Array<{ from_type: 'note' | 'task'; from_id: string }>;
	const backlinks: BacklinkItem[] = [];
	for (const link of links) {
		if (link.from_type === 'task') {
			const row = db
				.prepare(
					`SELECT tasks.id, tasks.title, tasks.description_md, projects.title AS project_title, projects.slug
					 FROM tasks
					 JOIN projects ON projects.id = tasks.project_id
					 WHERE tasks.id = ?`
				)
				.get(link.from_id) as { id: string; title: string; description_md: string; project_title: string; slug: string } | undefined;
			if (row) {
				backlinks.push({
					fromType: 'task',
					fromId: row.id,
					title: row.title,
					projectTitle: row.project_title,
					projectSlug: row.slug,
					snippet: excerptForBody(row.description_md),
					href: `/projects/${row.slug}#task-${row.id}`
				});
			}
			continue;
		}

		const row = db
			.prepare(
				`SELECT notes.id, notes.title, notes.excerpt, notes.kind, projects.title AS project_title, projects.slug
				 FROM notes
				 LEFT JOIN projects ON projects.id = notes.project_id
				 WHERE notes.id = ?`
			)
			.get(link.from_id) as
			| { id: string; title: string; excerpt: string; kind: NoteKind; project_title: string | null; slug: string | null }
			| undefined;
		if (!row) continue;
		backlinks.push({
			fromType: 'note',
			fromId: row.id,
			title: row.title,
			projectTitle: row.project_title,
			projectSlug: row.slug,
			snippet: row.excerpt,
			href: resolveObjectHref('note', row.id)
		});
	}
	return backlinks;
}

export function getNoteDocument(noteId: string): NoteDocument {
	const note = getNoteById(noteId);
	if (!note) throw new Error('Note not found');
	const project = note.project_id ? getProjectById(note.project_id) : null;
	const missing = !fileExists(note.file_path);
	const body = missing ? '' : readManagedMarkdown(note.file_path).body;
	return {
		note,
		project,
		body,
		html: renderMarkdown(body),
		backlinks: getBacklinks('note', note.id),
		missing
	};
}

export function getMeetingDocument(meetingId: string): MeetingDocument {
	const meeting = getMeetingById(meetingId);
	if (!meeting) throw new Error('Meeting not found');
	const note = getNoteById(meeting.note_id);
	const project = getProjectById(meeting.project_id);
	if (!note || !project) throw new Error('Meeting references invalid records');
	const missing = !fileExists(note.file_path);
	const body = missing ? '' : readManagedMarkdown(note.file_path).body;
	return {
		meeting,
		note,
		project,
		body,
		html: renderMarkdown(body),
		backlinks: getBacklinks('meeting', meeting.id),
		relatedTasks: getDb()
			.prepare('SELECT * FROM tasks WHERE source_meeting_id = ? AND archived_at IS NULL ORDER BY updated_at DESC')
			.all(meeting.id) as Task[],
		missing
	};
}

export function getInboxDocument(): NoteDocument {
	const row = getDb().prepare("SELECT id FROM notes WHERE kind = 'inbox' LIMIT 1").get() as { id: string };
	return getNoteDocument(row.id);
}

export function listNotesIndex(): NotesIndexItem[] {
	const rows = getDb()
		.prepare(
			`SELECT notes.*, daily_notes.note_date AS daily_note_date,
			        projects.id AS project__id, projects.slug AS project__slug, projects.title AS project__title,
			        projects.kind AS project__kind, projects.status AS project__status, projects.summary AS project__summary,
			        projects.sort_position AS project__sort_position, projects.created_at AS project__created_at,
			        projects.updated_at AS project__updated_at, projects.archived_at AS project__archived_at
			 FROM notes
			 LEFT JOIN daily_notes ON daily_notes.note_id = notes.id
			 LEFT JOIN projects ON projects.id = notes.project_id
			 WHERE notes.archived_at IS NULL
			 ORDER BY notes.updated_at DESC, notes.created_at DESC`
		)
		.all();

	return rows.map((row) => {
		const typed = row as Row;
		return {
			note: row as Note,
			project: typed.project__id
				? {
						id: String(typed.project__id),
						slug: String(typed.project__slug),
						title: String(typed.project__title),
						kind: typed.project__kind as ProjectKind,
						status: typed.project__status as ProjectStatus,
						summary: String(typed.project__summary),
						sort_position: Number(typed.project__sort_position),
						created_at: String(typed.project__created_at),
						updated_at: String(typed.project__updated_at),
						archived_at: (typed.project__archived_at as string | null) ?? null
					}
				: null,
			dailyNoteDate: (typed.daily_note_date as string | null) ?? null,
			href: resolveObjectHref('note', String(typed.id))
		};
	});
}

function buildTodayShortcuts(snapshot: AppShellData['snapshot']): TodayShortcut[] {
	return [
		{
			id: 'projects',
			title: 'Projects',
			href: '/projects',
			description: `${snapshot.projectCount} projects and ${snapshot.openTaskCount} open tasks live in the project dashboards.`
		},
		{
			id: 'inbox',
			title: 'Inbox',
			href: '/inbox',
			description: 'Capture raw thinking first, then promote it into a project, meeting, or note once it deserves structure.'
		},
		{
			id: 'search',
			title: 'Search',
			href: '/search',
			description: `Search across ${snapshot.noteCount} notes and ${snapshot.meetingCount} meetings when you know the context is already somewhere in the workspace.`
		}
	];
}

export function getOrCreateTodayDashboard(): TodayDashboard {
	const noteDate = todayDate();
	const dailyMeta = getOrCreateDailyNoteMeta(noteDate);

	return {
		daily: getNoteDocument(dailyMeta.note_id),
		dailyMeta,
		shortcuts: buildTodayShortcuts(getWorkspaceSnapshot())
	};
}

function getDailyNoteMetaByDate(noteDate: string): DailyNoteMeta | null {
	return (getDb().prepare('SELECT * FROM daily_notes WHERE note_date = ?').get(noteDate) as DailyNoteMeta | undefined) ?? null;
}

function getOrCreateDailyNoteMeta(noteDate: string): DailyNoteMeta {
	const existing = getDailyNoteMetaByDate(noteDate);
	if (existing) return existing;

	const db = getDb();
	const noteId = createId('nte');
	const dailyId = createId('dly');
	const createdAt = nowIso();
	const filePath = getDailyNotePath(noteDate);
	db.prepare(
		'INSERT INTO notes (id, project_id, kind, title, file_path, excerpt, created_at, updated_at, archived_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, NULL)'
	).run(noteId, 'daily', noteDate, filePath, '', createdAt, createdAt);
	db.prepare('INSERT INTO daily_notes (id, note_id, note_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
		dailyId,
		noteId,
		noteDate,
		createdAt,
		createdAt
	);
	writeManagedMarkdown(
		filePath,
		{
			id: noteId,
			kind: 'daily',
			title: noteDate,
			note_date: noteDate,
			created_at: createdAt,
			updated_at: createdAt
		},
		defaultTemplate('daily', noteDate)
	);
	reindexFile(filePath);
	return { id: dailyId, note_id: noteId, note_date: noteDate, created_at: createdAt, updated_at: createdAt };
}

export function getDailyNoteDocumentByDate(noteDate: string): { daily: NoteDocument; dailyMeta: DailyNoteMeta } {
	const dailyMeta = getDailyNoteMetaByDate(noteDate);
	if (!dailyMeta) throw new Error('Daily note not found');
	return {
		daily: getNoteDocument(dailyMeta.note_id),
		dailyMeta
	};
}

export function searchWorkspace(query: string, filters?: { type?: SearchObjectType | 'all'; projectId?: string }): SearchResult[] {
	if (!query.trim()) return [];
	const db = getDb();
	const rows = db
		.prepare(
			`SELECT *
			 FROM search_fts
			 WHERE search_fts MATCH ?
			 ORDER BY rank, updated_at DESC
			 LIMIT 30`
		)
		.all(`${query.replace(/"/g, '""')}*`) as Omit<SearchResult, 'href'>[];
	return rows
		.filter((row) => {
			if (filters?.type && filters.type !== 'all' && row.object_type !== filters.type) return false;
			if (filters?.projectId) {
				const project = row.project_slug ? getProjectBySlug(row.project_slug) : null;
				if (project?.id !== filters.projectId) return false;
			}
			return true;
		})
		.map((row) => ({
			...row,
			href: resolveObjectHref(row.object_type, row.object_id)
		}));
}

function upsertRecentItem(objectType: SearchObjectType, objectId: string): void {
	getDb()
		.prepare(
			'INSERT INTO recent_items (object_type, object_id, last_opened_at) VALUES (?, ?, ?) ON CONFLICT(object_type, object_id) DO UPDATE SET last_opened_at = excluded.last_opened_at'
		)
		.run(objectType, objectId, nowIso());
}

export function touchRecentItem(objectType: SearchObjectType, objectId: string): void {
	upsertRecentItem(objectType, objectId);
}

function getShellPulseCollections(snapshot: AppShellData['snapshot']): AppShellData['pulseCollections'] {
	const db = getDb();
	const projectCounts = getProjectStatusCounts();
	const taskCountRows = db
		.prepare(
			`SELECT status, COUNT(*) AS count
			 FROM tasks
			 WHERE archived_at IS NULL AND status IN ('todo', 'in_progress', 'blocked')
			 GROUP BY status`
		)
		.all() as Array<{ status: TaskStatus; count: number }>;
	const taskCounts = {
		todo: taskCountRows.find((row) => row.status === 'todo')?.count ?? 0,
		in_progress: taskCountRows.find((row) => row.status === 'in_progress')?.count ?? 0,
		blocked: taskCountRows.find((row) => row.status === 'blocked')?.count ?? 0
	};

	const projects = db
		.prepare(
			`SELECT id, slug, title, kind, status, summary, updated_at
			 FROM projects
			 WHERE archived_at IS NULL AND status IN ('active', 'on_hold')
			 ORDER BY ${projectStatusSortCase()}, sort_position ASC, updated_at DESC`
		)
		.all() as Array<Pick<Project, 'id' | 'slug' | 'title' | 'kind' | 'status' | 'summary' | 'updated_at'>>;

	const tasks = db
		.prepare(
			`SELECT tasks.id, tasks.title, tasks.status, tasks.priority, tasks.scheduled_for, tasks.due_at, tasks.updated_at,
			        projects.slug AS project_slug, projects.title AS project_title
			 FROM tasks
			 JOIN projects ON projects.id = tasks.project_id
			 WHERE tasks.archived_at IS NULL AND tasks.status IN ('todo', 'in_progress', 'blocked')
			 ORDER BY
			 	CASE tasks.status
			 		WHEN 'in_progress' THEN 0
			 		WHEN 'blocked' THEN 1
			 		WHEN 'todo' THEN 2
			 		ELSE 3
			 	END,
			 	CASE WHEN tasks.due_at IS NULL THEN 1 ELSE 0 END,
			 	tasks.due_at ASC,
			 	tasks.updated_at DESC`
		)
		.all() as Array<{
			id: string;
			title: string;
			status: TaskStatus;
			priority: TaskPriority;
			scheduled_for: string | null;
			due_at: string | null;
			updated_at: string;
			project_slug: string;
			project_title: string;
		}>;

	return [
		{
			key: 'projects',
			label: 'Projects',
			description: 'Only active and on-hold projects live here so the pulse stays about current work.',
			count: projectCounts.active,
			countLabel: 'active',
			summary: `${projectCounts.on_hold} on hold`,
			columns: ['Project', 'Summary', 'State'],
			emptyMessage: 'Projects appear here once you start creating durable work.',
			rows: projects.map((project) => ({
				id: project.id,
				href: `/projects/${project.slug}`,
				primary: project.title,
				secondary: project.summary || `${labelFromSnakeCase(project.kind)} project`,
				tertiary: `${labelFromSnakeCase(project.status)} · ${formatRelative(project.updated_at)}`
			}))
		},
		{
			key: 'tasks',
			label: 'Open tasks',
			description: 'Only todo, in-progress, and blocked tasks show up here.',
			count: snapshot.openTaskCount,
			countLabel: 'open',
			summary: `${taskCounts.todo} todo · ${taskCounts.in_progress} in progress · ${taskCounts.blocked} blocked`,
			columns: ['Task', 'Project', 'State'],
			emptyMessage: 'Open tasks show up here as soon as they exist.',
			rows: tasks.map((task) => ({
				id: task.id,
				href: `/projects/${task.project_slug}#task-${task.id}`,
				primary: task.title,
				secondary: task.project_title,
				tertiary: `${labelFromSnakeCase(task.status)} · ${
					task.due_at
						? `due ${formatDate(task.due_at)}`
						: task.scheduled_for
							? `scheduled ${formatDate(task.scheduled_for)}`
							: `${labelFromSnakeCase(task.priority)} priority`
				}`
			}))
		}
	];
}

export function getShellData(): AppShellData {
	const db = getDb();
	const snapshot = getWorkspaceSnapshot();
	const recent = db
		.prepare(
			`SELECT recent_items.*, search_fts.title, search_fts.project_slug
			 FROM recent_items
			 LEFT JOIN search_fts ON search_fts.object_type = recent_items.object_type AND search_fts.object_id = recent_items.object_id
			 ORDER BY last_opened_at DESC
			 LIMIT 8`
		)
		.all()
		.map((row) => {
			const typed = row as Row;
			return {
				object_type: typed.object_type as SearchObjectType,
				object_id: String(typed.object_id),
				title: String(typed.title ?? `${typed.object_type} ${typed.object_id}`),
				href: resolveObjectHref(typed.object_type as SearchObjectType, String(typed.object_id)),
				last_opened_at: String(typed.last_opened_at)
			};
		});

	return {
		workspaceDir: getWorkspaceDir(),
		activeProjects: listActiveProjects(),
		allProjects: listActiveProjects(50),
		snapshot,
		pulseCollections: getShellPulseCollections(snapshot),
		recentItems: recent,
		commandPaletteItems: [
			{ id: 'go-today', group: 'Navigate', label: 'Go to Today', href: '/today', action: null },
			{ id: 'go-projects', group: 'Navigate', label: 'Go to Projects', href: '/projects', action: null },
			{ id: 'go-notes', group: 'Navigate', label: 'Go to Notes', href: '/notes', action: null },
			{ id: 'go-search', group: 'Navigate', label: 'Go to Search', href: '/search', action: null },
			{ id: 'go-inbox', group: 'Navigate', label: 'Go to Inbox', href: '/inbox', action: null },
			{ id: 'create-project', group: 'Create', label: 'Create Project', href: null, action: 'openCreateProject' },
			{ id: 'create-task', group: 'Create', label: 'Create Task', href: null, action: 'openCreateTask' },
			{ id: 'create-meeting', group: 'Create', label: 'Create Meeting', href: null, action: 'openCreateMeeting' },
			{ id: 'create-note', group: 'Create', label: 'Create Note', href: null, action: 'openCreateNote' },
			...recent.map((item) => ({
				id: `recent-${item.object_type}-${item.object_id}`,
				group: 'Recent',
				label: item.title,
				href: item.href,
				action: null
			}))
		]
	};
}

export function reindexFile(filePath: string): void {
	const db = getDb();
	const note = db.prepare('SELECT * FROM notes WHERE file_path = ?').get(filePath) as Note | undefined;
	if (!note || !fileExists(filePath)) return;
	const parsed = readManagedMarkdown(filePath);
	const body = parsed.body;
	const excerpt = excerptForBody(body);
	db.prepare('UPDATE notes SET title = ?, excerpt = ?, updated_at = ? WHERE id = ?').run(
		parsed.data.title || note.title,
		excerpt,
		parsed.data.updated_at || nowIso(),
		note.id
	);
	replaceObjectLinks('note', note.id, body);

	if (note.kind === 'meeting') {
		const meeting = db.prepare('SELECT * FROM meetings WHERE note_id = ?').get(note.id) as Meeting | undefined;
		if (meeting) {
			db.prepare('UPDATE meetings SET title = ?, meeting_date = ?, updated_at = ? WHERE id = ?').run(
				parsed.data.title || meeting.title,
				parsed.data.meeting_date || meeting.meeting_date,
				parsed.data.updated_at || nowIso(),
				meeting.id
			);
			const project = getProjectById(meeting.project_id);
			upsertSearchRow(
				'meeting',
				meeting.id,
				parsed.data.title || meeting.title,
				body,
				project?.title ?? '',
				parsed.data.updated_at || meeting.updated_at,
				project?.slug ?? null
			);
		}
	} else if (note.kind !== 'daily' && note.kind !== 'inbox') {
		const project = note.project_id ? getProjectById(note.project_id) : null;
		upsertSearchRow(
			'note',
			note.id,
			parsed.data.title || note.title,
			body,
			project?.title ?? '',
			parsed.data.updated_at || note.updated_at,
			project?.slug ?? null
		);
	}

	if (note.kind === 'daily') {
		upsertSearchRow('note', note.id, parsed.data.title || note.title, body, '', parsed.data.updated_at || note.updated_at, null);
	}
	if (note.kind === 'inbox') {
		upsertSearchRow('note', note.id, parsed.data.title || note.title, body, '', parsed.data.updated_at || note.updated_at, null);
	}
}

export function reindexWorkspace(): void {
	const db = getDb();
	db.prepare('DELETE FROM object_links').run();
	db.prepare('DELETE FROM search_fts').run();
	for (const project of db.prepare('SELECT * FROM projects').all() as Project[]) {
		upsertSearchRow('project', project.id, project.title, project.summary, project.title, project.updated_at, project.slug);
	}
	for (const task of db.prepare('SELECT * FROM tasks').all() as Task[]) {
		replaceObjectLinks('task', task.id, task.description_md);
		upsertTaskSearch(task);
	}
	for (const note of db.prepare('SELECT * FROM notes').all() as Note[]) {
		if (fileExists(note.file_path)) {
			reindexFile(note.file_path);
		}
	}
}

export function extractTasksFromMeetingMarkdown(meetingId: string): Task[] {
	const meeting = getMeetingDocument(meetingId);
	const created: Task[] = [];
	for (const line of meeting.body.split('\n')) {
		const match = line.match(/^\s*-\s+\[\s?\]\s+(.+)$/);
		if (!match) continue;
		const title = match[1].trim();
		const exists = getDb()
			.prepare('SELECT id FROM tasks WHERE source_meeting_id = ? AND title = ?')
			.get(meetingId, title) as { id: string } | undefined;
		if (exists) continue;
		created.push(
			createTask({
				projectId: meeting.project.id,
				title,
				sourceMeetingId: meetingId
			})
		);
	}
	return created;
}
