import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import chokidar, { type FSWatcher } from 'chokidar';
import { getDb } from '$lib/server/db/connection';
import { buildOutgoingLinks } from '$lib/markdown/extract-links';
import { extractCarryoverItems, extractOpenChecklistItems, mergeDailyCarryover } from '$lib/markdown/carryover';
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
	ProjectWithCounts,
	RepositoryStatus,
	SearchObjectType,
	SearchResult,
	Task,
	TaskPriority,
	TaskStatus,
	TaskTreeItem,
	TodayShortcut,
	TodayTask,
	TodayDashboard,
	WorkbenchDashboard
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
	getTaskPath,
	getWorkspaceDir
} from '$lib/server/workspace/paths';
import { defaultTemplate } from '$lib/server/workspace/templates';

let bootstrapped = false;
let watcher: FSWatcher | null = null;
const repositoryStatusCache = new Map<string, { at: number; status: RepositoryStatus }>();

type Row = Record<string, string | number | null>;

export class WorkspaceConflictError extends Error {
	document: NoteDocument;
	constructor(document: NoteDocument) {
		super('This file changed on disk while you were editing.');
		this.name = 'WorkspaceConflictError';
		this.document = document;
	}
}

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
	for (const folder of ['notes', 'docs', 'decisions', 'meetings', 'tasks']) {
		fs.mkdirSync(path.join(getProjectDir(slug), folder), { recursive: true });
	}
}

function writeProjectManifest(project: Project): void {
	const homeNote = getDb()
		.prepare("SELECT * FROM notes WHERE project_id = ? AND kind = 'project_home' LIMIT 1")
		.get(project.id) as Note | undefined;
	if (!homeNote) return;
	const body = fileExists(homeNote.file_path)
		? readManagedMarkdown(homeNote.file_path).body
		: defaultTemplate('project_home', project.title);
	writeManagedMarkdown(
		homeNote.file_path,
		{
			id: homeNote.id,
			kind: 'project_home',
			title: project.title,
			project: project.slug,
			project_id: project.id,
			project_kind: project.kind,
			project_status: project.status,
			project_summary: project.summary,
			repo_path: project.repo_path ?? '',
			sort_position: project.sort_position,
			archived_at: project.archived_at,
			created_at: project.created_at,
			updated_at: project.updated_at
		},
		body
	);
}

function getRepositoryStatus(project: Project): RepositoryStatus | null {
	const repoPath = project.repo_path?.trim();
	if (!repoPath) return null;
	const cached = repositoryStatusCache.get(repoPath);
	if (cached && Date.now() - cached.at < 10_000) return cached.status;
	const base: RepositoryStatus = {
		path: repoPath,
		available: fs.existsSync(repoPath),
		isGitRepository: false,
		branch: '',
		dirtyCount: 0,
		ahead: 0,
		behind: 0,
		lastCommit: '',
		error: null
	};
	if (!base.available) {
		const status = { ...base, error: 'Path does not exist' };
		repositoryStatusCache.set(repoPath, { at: Date.now(), status });
		return status;
	}
	try {
		const runGit = (args: string[]) =>
			execFileSync('git', ['-C', repoPath, ...args], { encoding: 'utf8', timeout: 1500 }).trim();
		base.isGitRepository = runGit(['rev-parse', '--is-inside-work-tree']) === 'true';
		base.branch = runGit(['branch', '--show-current']) || 'detached';
		base.dirtyCount = runGit(['status', '--porcelain']).split('\n').filter(Boolean).length;
		base.lastCommit = runGit(['log', '-1', '--pretty=%h · %s · %cr']);
		try {
			const [behind = '0', ahead = '0'] = runGit(['rev-list', '--left-right', '--count', '@{upstream}...HEAD']).split(/\s+/);
			base.ahead = Number(ahead) || 0;
			base.behind = Number(behind) || 0;
		} catch {
			// A local-only branch without an upstream is healthy and common.
		}
		repositoryStatusCache.set(repoPath, { at: Date.now(), status: base });
		return base;
	} catch (error) {
		const status = { ...base, error: error instanceof Error ? error.message.split('\n')[0] : 'Unable to inspect repository' };
		repositoryStatusCache.set(repoPath, { at: Date.now(), status });
		return status;
	}
}

function writeTaskFile(task: Task): void {
	const project = getProjectById(task.project_id);
	if (!project) return;
	writeManagedMarkdown(
		getTaskPath(project.slug, task.id),
		{
			id: task.id,
			kind: 'task',
			title: task.title,
			project: project.slug,
			project_id: project.id,
			parent_task_id: task.parent_task_id,
			source_meeting_id: task.source_meeting_id,
			source_note_id: task.source_note_id,
			status: task.status,
			priority: task.priority,
			scheduled_for: task.scheduled_for,
			due_at: task.due_at,
			position: task.position,
			completed_at: task.completed_at,
			archived_at: task.archived_at,
			created_at: task.created_at,
			updated_at: task.updated_at
		},
		task.description_md
	);
}

function syncTaskToSourceMarkdown(task: Task): void {
	if (!task.source_meeting_id) return;
	const meeting = getMeetingById(task.source_meeting_id);
	if (!meeting) return;
	const note = getNoteById(meeting.note_id);
	if (!note || !fileExists(note.file_path)) return;
	const parsed = readManagedMarkdown(note.file_path);
	const marker = task.status === 'done' ? 'x' : ' ';
	const linkPattern = new RegExp(`^(\\s*[-*+]\\s+\\[)[ xX](\\]\\s+)\\[\\[task\\/${task.id}(?:\\|[^\\]]*)?\\]\\]`, 'm');
	if (!linkPattern.test(parsed.body)) return;
	const nextBody = parsed.body.replace(linkPattern, `$1${marker}$2[[task/${task.id}|${task.title}]]`);
	if (nextBody !== parsed.body) saveNoteContent(note.id, nextBody, { force: true });
}

function samePath(left: string, right: string | null | undefined): boolean {
	return right ? path.resolve(left) === path.resolve(right) : false;
}

function findAvailablePath(filePath: string, currentPath?: string): string {
	if (!fileExists(filePath) || samePath(filePath, currentPath)) {
		return filePath;
	}

	const directory = path.dirname(filePath);
	const extension = path.extname(filePath);
	const baseName = path.basename(filePath, extension);
	let counter = 2;

	while (true) {
		const candidate = path.join(directory, `${baseName}-${counter}${extension}`);
		if (!fileExists(candidate) || samePath(candidate, currentPath)) {
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
	hydrateWorkspaceFromFiles();
	seedDefaults();
	persistCanonicalState();
	reindexWorkspace();
	startWatcher();
	bootstrapped = true;
}

function listWorkspaceMarkdownFiles(directory = getWorkspaceDir()): string[] {
	if (!fs.existsSync(directory)) return [];
	const files: string[] = [];
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		if (entry.name === '.app' || entry.name.startsWith('.')) continue;
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) files.push(...listWorkspaceMarkdownFiles(entryPath));
		else if (entry.isFile() && entry.name.endsWith('.md')) files.push(entryPath);
	}
	return files;
}

function hydrateWorkspaceFromFiles(): void {
	const db = getDb();
	const files = listWorkspaceMarkdownFiles();

	// Project manifests establish the ownership graph before notes and tasks are loaded.
	for (const filePath of files.filter((candidate) => path.basename(candidate) === 'project.md')) {
		try {
			const parsed = readManagedMarkdown(filePath);
			if (parsed.data.kind !== 'project_home') continue;
			const slug = path.basename(path.dirname(filePath));
			const existing = db.prepare('SELECT * FROM projects WHERE slug = ? OR id = ? LIMIT 1').get(slug, parsed.data.project_id ?? '') as Project | undefined;
			const projectId = parsed.data.project_id ?? existing?.id ?? createId('prj');
			const createdAt = parsed.data.created_at || nowIso();
			db.prepare(
				`INSERT INTO projects (id, slug, title, kind, status, summary, repo_path, sort_position, created_at, updated_at, archived_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, title = excluded.title,
				 kind = excluded.kind, status = excluded.status, summary = excluded.summary,
				 repo_path = excluded.repo_path, sort_position = excluded.sort_position, updated_at = excluded.updated_at`
			).run(
				projectId,
				slug,
				parsed.data.title || existing?.title || slug,
				parsed.data.project_kind ?? existing?.kind ?? 'standard',
				parsed.data.project_status ?? existing?.status ?? 'active',
				parsed.data.project_summary ?? existing?.summary ?? '',
				parsed.data.repo_path ?? existing?.repo_path ?? '',
				parsed.data.sort_position ?? existing?.sort_position ?? nextProjectSortPosition('active'),
				createdAt,
				parsed.data.updated_at || createdAt,
				parsed.data.archived_at ?? existing?.archived_at ?? (parsed.data.project_status === 'archived' ? parsed.data.updated_at || createdAt : null)
			);
			db.prepare(
				`INSERT INTO notes (id, project_id, kind, title, file_path, excerpt, created_at, updated_at, archived_at)
				 VALUES (?, ?, 'project_home', ?, ?, ?, ?, ?, ?)
				 ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, title = excluded.title,
				 file_path = excluded.file_path, excerpt = excluded.excerpt, updated_at = excluded.updated_at`
			).run(parsed.data.id, projectId, parsed.data.title || slug, filePath, excerptForBody(parsed.body), createdAt, parsed.data.updated_at || createdAt, null);
		} catch (error) {
			console.error('project manifest hydrate failed', filePath, error);
		}
	}

	for (const filePath of files.filter((candidate) => path.basename(candidate) !== 'project.md')) {
		try {
			const parsed = readManagedMarkdown(filePath);
			const data = parsed.data;
			if (data.kind === 'task') {
				const project = (data.project_id ? getProjectById(data.project_id) : null) ?? (data.project ? getProjectBySlug(data.project) : null);
				if (!project) continue;
				db.prepare(
					`INSERT INTO tasks (id, project_id, parent_task_id, source_meeting_id, source_note_id, title, description_md,
					 status, priority, scheduled_for, due_at, position, created_at, updated_at, completed_at, archived_at)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
					 ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, parent_task_id = excluded.parent_task_id,
					 source_meeting_id = excluded.source_meeting_id, source_note_id = excluded.source_note_id,
					 title = excluded.title, description_md = excluded.description_md, status = excluded.status,
					 priority = excluded.priority, scheduled_for = excluded.scheduled_for, due_at = excluded.due_at,
					 position = excluded.position, updated_at = excluded.updated_at, completed_at = excluded.completed_at,
					 archived_at = excluded.archived_at`
				).run(data.id, project.id, data.parent_task_id ?? null, data.source_meeting_id ?? null, data.source_note_id ?? null,
					data.title, parsed.body, data.status ?? 'todo', data.priority ?? 'medium', data.scheduled_for ?? null,
					data.due_at ?? null, data.position ?? 0, data.created_at || nowIso(), data.updated_at || nowIso(),
					data.completed_at ?? null, data.archived_at ?? null);
				continue;
			}

			const project = data.project ? getProjectBySlug(data.project) : null;
			const createdAt = data.created_at || nowIso();
			db.prepare(
				`INSERT INTO notes (id, project_id, kind, title, file_path, excerpt, created_at, updated_at, archived_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, kind = excluded.kind, title = excluded.title,
				 file_path = excluded.file_path, excerpt = excluded.excerpt, updated_at = excluded.updated_at`
			).run(data.id, project?.id ?? null, data.kind, data.title, filePath, excerptForBody(parsed.body), createdAt, data.updated_at || createdAt, data.archived_at ?? null);

			if (data.kind === 'meeting' && project) {
				const meetingId = data.meeting_id ?? (db.prepare('SELECT id FROM meetings WHERE note_id = ?').get(data.id) as { id: string } | undefined)?.id ?? createId('mtg');
				db.prepare(
					`INSERT INTO meetings (id, project_id, note_id, title, meeting_date, created_at, updated_at, archived_at)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id,
					 note_id = excluded.note_id, title = excluded.title, meeting_date = excluded.meeting_date, updated_at = excluded.updated_at`
				).run(meetingId, project.id, data.id, data.title, data.meeting_date ?? todayDate(), createdAt, data.updated_at || createdAt, data.archived_at ?? null);
			}
			if (data.kind === 'daily' && data.note_date) {
				const dailyId = data.daily_id ?? (db.prepare('SELECT id FROM daily_notes WHERE note_id = ?').get(data.id) as { id: string } | undefined)?.id ?? createId('dly');
				db.prepare(
					`INSERT INTO daily_notes (id, note_id, note_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
					 ON CONFLICT(id) DO UPDATE SET note_id = excluded.note_id, note_date = excluded.note_date, updated_at = excluded.updated_at`
				).run(dailyId, data.id, data.note_date, createdAt, data.updated_at || createdAt);
			}
		} catch (error) {
			console.error('workspace file hydrate failed', filePath, error);
		}
	}
}

function persistCanonicalState(): void {
	const db = getDb();
	for (const project of db.prepare('SELECT * FROM projects').all() as Project[]) writeProjectManifest(project);
	for (const task of db.prepare('SELECT * FROM tasks').all() as Task[]) writeTaskFile(task);
	for (const note of db.prepare("SELECT * FROM notes WHERE kind IN ('meeting', 'daily')").all() as Note[]) {
		if (!fileExists(note.file_path)) continue;
		const parsed = readManagedMarkdown(note.file_path);
		const meeting = note.kind === 'meeting' ? db.prepare('SELECT id FROM meetings WHERE note_id = ?').get(note.id) as { id: string } | undefined : undefined;
		const daily = note.kind === 'daily' ? db.prepare('SELECT id FROM daily_notes WHERE note_id = ?').get(note.id) as { id: string } | undefined : undefined;
		writeManagedMarkdown(note.file_path, { ...parsed.data, meeting_id: meeting?.id, daily_id: daily?.id }, parsed.body);
	}
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

	const handleUpsert = (filePath: string) => {
		try {
			hydrateWorkspaceFromFiles();
			reindexFile(filePath);
		} catch (error) {
			console.error('watcher change failed', error);
		}
	};
	watcher.on('change', handleUpsert);
	watcher.on('add', handleUpsert);
	watcher.on('unlink', (filePath) => {
		const taskId = path.basename(filePath, '.md');
		if (taskId.startsWith('tsk_')) {
			getDb().prepare('UPDATE tasks SET archived_at = ?, updated_at = ? WHERE id = ?').run(nowIso(), nowIso(), taskId);
			getDb().prepare("DELETE FROM search_fts WHERE object_type = 'task' AND object_id = ?").run(taskId);
			return;
		}
		const note = getDb().prepare('SELECT * FROM notes WHERE file_path = ?').get(filePath) as Note | undefined;
		if (note) {
			getDb().prepare('UPDATE notes SET archived_at = ?, updated_at = ? WHERE id = ?').run(nowIso(), nowIso(), note.id);
			getDb().prepare("DELETE FROM search_fts WHERE object_type = 'note' AND object_id = ?").run(note.id);
		}
	});
}

export function listActiveProjects(limit = 24): ProjectWithCounts[] {
	return getDb()
		.prepare(
			`SELECT projects.*,
			        (SELECT COUNT(*) FROM tasks WHERE project_id = projects.id AND archived_at IS NULL AND status NOT IN ('done', 'cancelled')) AS openTaskCount,
			        (SELECT COUNT(*) FROM tasks WHERE project_id = projects.id AND archived_at IS NULL AND status = 'in_progress') AS inProgressTaskCount,
			        (SELECT COUNT(*) FROM tasks WHERE project_id = projects.id AND archived_at IS NULL AND status = 'blocked') AS blockedTaskCount,
			        (SELECT COUNT(*) FROM notes WHERE project_id = projects.id AND archived_at IS NULL AND kind IN ('note', 'doc', 'decision')) AS noteCount,
			        (SELECT COUNT(*) FROM meetings WHERE project_id = projects.id AND archived_at IS NULL) AS meetingCount
			 FROM projects
			 WHERE archived_at IS NULL AND status IN ('active', 'on_hold')
			 ORDER BY ${projectStatusSortCase()}, sort_position ASC, updated_at DESC
			 LIMIT ?`
		)
		.all(limit) as ProjectWithCounts[];
}

export function listProjects(filters?: { status?: ProjectStatus; q?: string }): ProjectWithCounts[] {
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
		.prepare(
			`SELECT projects.*,
			        (SELECT COUNT(*) FROM tasks WHERE project_id = projects.id AND archived_at IS NULL AND status NOT IN ('done', 'cancelled')) AS openTaskCount,
			        (SELECT COUNT(*) FROM tasks WHERE project_id = projects.id AND archived_at IS NULL AND status = 'in_progress') AS inProgressTaskCount,
			        (SELECT COUNT(*) FROM tasks WHERE project_id = projects.id AND archived_at IS NULL AND status = 'blocked') AS blockedTaskCount,
			        (SELECT COUNT(*) FROM notes WHERE project_id = projects.id AND archived_at IS NULL AND kind IN ('note', 'doc', 'decision')) AS noteCount,
			        (SELECT COUNT(*) FROM meetings WHERE project_id = projects.id AND archived_at IS NULL) AS meetingCount
			 FROM projects
			 WHERE ${clauses.join(' AND ')}
			 ORDER BY ${orderBy}`
		)
		.all(...params) as ProjectWithCounts[];
}

export function createProject(input: {
	title: string;
	kind: ProjectKind;
	summary?: string;
	repoPath?: string;
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
		repo_path: input.repoPath?.trim() ?? '',
		sort_position: nextProjectSortPosition('active'),
		created_at: nowIso(),
		updated_at: nowIso(),
		archived_at: null
	};

	db.prepare(
		'INSERT INTO projects (id, slug, title, kind, status, summary, repo_path, sort_position, created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)'
	).run(
		project.id,
		project.slug,
		project.title,
		project.kind,
		project.status,
		project.summary,
		project.repo_path,
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

	writeProjectManifest(project);

	reindexFile(homeNote.file_path);
	upsertSearchRow('project', project.id, project.title, project.summary, project.title, project.updated_at, project.slug);
	return project;
}

export function updateProject(id: string, patch: Partial<Pick<Project, 'title' | 'summary' | 'status' | 'kind' | 'repo_path'>>): Project {
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
			const nextPath = path.join(getProjectDir(slug), path.relative(getProjectDir(existing.slug), note.file_path));
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
		repo_path: patch.repo_path ?? existing.repo_path,
		status: nextStatus,
		kind: patch.kind ?? existing.kind,
		slug,
		sort_position: sortPosition,
		updated_at: nowIso(),
		archived_at: archivedAt
	};

	db.prepare(
		'UPDATE projects SET slug = ?, title = ?, summary = ?, repo_path = ?, status = ?, kind = ?, sort_position = ?, updated_at = ?, archived_at = ? WHERE id = ?'
	).run(
		updated.slug,
		updated.title,
		updated.summary,
		updated.repo_path,
		updated.status,
		updated.kind,
		updated.sort_position,
		updated.updated_at,
		updated.archived_at,
		updated.id
	);
	writeProjectManifest(updated);
	if (updated.archived_at) db.prepare("DELETE FROM search_fts WHERE object_type = 'project' AND object_id = ?").run(updated.id);
	else upsertSearchRow('project', updated.id, updated.title, updated.summary, updated.title, updated.updated_at, updated.slug);
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
	for (const projectId of projectIds) {
		const project = getProjectById(projectId);
		if (project) writeProjectManifest(project);
	}
}

export function archiveProject(id: string, archived: boolean): void {
	const project = getProjectById(id);
	if (!project) throw new Error('Project not found');
	const nextStatus: ProjectStatus = archived ? 'archived' : project.status === 'archived' ? 'active' : project.status;
	getDb()
		.prepare('UPDATE projects SET status = ?, archived_at = ?, updated_at = ? WHERE id = ?')
		.run(nextStatus, archived ? nowIso() : null, nowIso(), id);
	const updated = getProjectById(id);
	if (updated) {
		writeProjectManifest(updated);
		if (archived) getDb().prepare("DELETE FROM search_fts WHERE object_type = 'project' AND object_id = ?").run(id);
		else upsertSearchRow('project', updated.id, updated.title, updated.summary, updated.title, updated.updated_at, updated.slug);
	}
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
			getProjectNotePath(projectSlug, note.kind as 'note' | 'doc' | 'decision', toSlug(patch.title)),
			note.file_path
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
	const archivedAt = archived ? nowIso() : null;
	getDb().prepare('UPDATE notes SET archived_at = ?, updated_at = ? WHERE id = ?').run(archivedAt, nowIso(), id);
	const note = getNoteById(id);
	if (note && fileExists(note.file_path)) {
		const parsed = readManagedMarkdown(note.file_path);
		writeManagedMarkdown(note.file_path, { ...parsed.data, archived_at: archivedAt, updated_at: note.updated_at }, parsed.body);
	}
	if (archived) getDb().prepare("DELETE FROM search_fts WHERE object_type = 'note' AND object_id = ?").run(id);
	else if (note) reindexFile(note.file_path);
}

export function saveNoteContent(id: string, body: string, options?: { baseBody?: string; force?: boolean }): NoteDocument {
	const note = getNoteById(id);
	if (!note) throw new Error('Note not found');
	const parsed = fileExists(note.file_path) ? readManagedMarkdown(note.file_path) : null;
	if (!options?.force && options?.baseBody !== undefined && parsed && parsed.body !== options.baseBody) {
		throw new WorkspaceConflictError(getNoteDocument(id));
	}
	const updatedAt = nowIso();
	writeManagedMarkdown(
		note.file_path,
		{
			...(parsed?.data ?? {}),
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
			meeting_id: meetingId,
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
	const nextPath = findAvailablePath(getMeetingPath(projectSlug, nextDate, toSlug(nextTitle)), note.file_path);
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
	const meeting = getMeetingById(id);
	if (!meeting) throw new Error('Meeting not found');
	const archivedAt = archived ? nowIso() : null;
	getDb().prepare('UPDATE meetings SET archived_at = ?, updated_at = ? WHERE id = ?').run(archivedAt, nowIso(), id);
	getDb().prepare('UPDATE notes SET archived_at = ?, updated_at = ? WHERE id = ?').run(archivedAt, nowIso(), meeting.note_id);
	const note = getNoteById(meeting.note_id);
	if (note && fileExists(note.file_path)) {
		const parsed = readManagedMarkdown(note.file_path);
		writeManagedMarkdown(note.file_path, { ...parsed.data, archived_at: archivedAt, updated_at: note.updated_at }, parsed.body);
	}
	if (archived) {
		getDb().prepare("DELETE FROM search_fts WHERE object_type = 'meeting' AND object_id = ?").run(id);
		getDb().prepare("DELETE FROM search_fts WHERE object_type = 'note' AND object_id = ?").run(meeting.note_id);
	} else if (note) reindexFile(note.file_path);
}

export function saveMeetingContent(id: string, body: string, options?: { baseBody?: string; force?: boolean }): MeetingDocument {
	const meeting = getMeetingById(id);
	if (!meeting) throw new Error('Meeting not found');
	saveNoteContent(meeting.note_id, body, options);
	extractTasksFromMeetingMarkdown(id);
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
	if (!getProjectById(input.projectId)) throw new Error('Project not found');
	if (input.parentTaskId) {
		const parent = db.prepare('SELECT * FROM tasks WHERE id = ?').get(input.parentTaskId) as Task | undefined;
		if (!parent || parent.project_id !== input.projectId) throw new Error('Parent task must belong to the same project');
	}
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
	writeTaskFile(task);
	return task;
}

function upsertTaskSearch(task: Task): void {
	const project = getProjectById(task.project_id);
	upsertSearchRow('task', task.id, task.title, task.description_md, project?.title ?? '', task.updated_at, project?.slug ?? null);
}

export function updateTask(id: string, patch: Partial<Omit<Task, 'id' | 'created_at' | 'position' | 'project_id'>>): Task {
	const current = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;
	if (!current) throw new Error('Task not found');
	if (patch.parent_task_id) {
		let parent = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(patch.parent_task_id) as Task | undefined;
		if (!parent || parent.project_id !== current.project_id) throw new Error('Parent task must belong to the same project');
		while (parent) {
			if (parent.id === id) throw new Error('A task cannot be nested beneath itself');
			parent = parent.parent_task_id ? getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(parent.parent_task_id) as Task | undefined : undefined;
		}
	}
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
	writeTaskFile(updated);
	syncTaskToSourceMarkdown(updated);
	return updated;
}

export function archiveTask(id: string, archived: boolean): void {
	getDb().prepare('UPDATE tasks SET archived_at = ?, updated_at = ? WHERE id = ?').run(archived ? nowIso() : null, nowIso(), id);
	const task = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;
	if (task) {
		writeTaskFile(task);
		if (archived) getDb().prepare("DELETE FROM search_fts WHERE object_type = 'task' AND object_id = ?").run(id);
		else upsertTaskSearch(task);
	}
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
		repository: getRepositoryStatus(project),
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

export function listDocumentHistory(noteId: string): Array<{ timestamp: number; createdAt: string; size: number }> {
	if (!getNoteById(noteId)) throw new Error('Note not found');
	const historyDir = path.join(getWorkspaceDir(), '.app', 'history', noteId);
	if (!fs.existsSync(historyDir)) return [];
	return fs.readdirSync(historyDir)
		.filter((name) => /^\d+\.md$/.test(name))
		.map((name) => {
			const timestamp = Number(name.slice(0, -3));
			return { timestamp, createdAt: new Date(timestamp).toISOString(), size: fs.statSync(path.join(historyDir, name)).size };
		})
		.sort((a, b) => b.timestamp - a.timestamp)
		.slice(0, 40);
}

export function restoreDocumentHistory(noteId: string, timestamp: number): NoteDocument {
	const snapshotPath = path.join(getWorkspaceDir(), '.app', 'history', noteId, `${timestamp}.md`);
	if (!Number.isSafeInteger(timestamp) || !fileExists(snapshotPath)) throw new Error('History snapshot not found');
	return saveNoteContent(noteId, readManagedMarkdown(snapshotPath).body, { force: true });
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

export function captureInboxItem(text: string): NoteDocument {
	const inbox = getInboxDocument();
	const cleanText = text.replace(/\s+/g, ' ').trim();
	if (!cleanText) return inbox;
	const separator = inbox.body.trimEnd() ? '\n' : '';
	return saveNoteContent(inbox.note.id, `${inbox.body.trimEnd()}${separator}- [ ] ${cleanText}\n`);
}

function getInboxTriageItems(): WorkbenchDashboard['inboxItems'] {
	const inbox = getInboxDocument();
	return inbox.body.split('\n').flatMap((line, lineIndex) => {
		const match = line.match(/^\s*[-*+]\s+\[\s\]\s+(.+?)\s*$/i);
		return match ? [{ lineIndex, text: match[1].trim() }] : [];
	});
}

export function triageInboxItem(input: {
	lineIndex: number;
	text: string;
	action: 'task' | 'note' | 'discard';
	projectId?: string;
}): { href: string | null } {
	const inbox = getInboxDocument();
	const lines = inbox.body.split('\n');
	const line = lines[input.lineIndex] ?? '';
	const match = line.match(/^\s*[-*+]\s+\[\s\]\s+(.+?)\s*$/i);
	if (!match || match[1].trim() !== input.text.trim()) throw new Error('Inbox changed. Refresh and try again.');
	let href: string | null = null;
	if (input.action !== 'discard') {
		if (!input.projectId) throw new Error('Choose a project');
		const project = getProjectById(input.projectId);
		if (!project) throw new Error('Project not found');
		if (input.action === 'task') {
			const task = createTask({ projectId: project.id, title: input.text.trim(), sourceNoteId: inbox.note.id });
			href = `/projects/${project.slug}#task-${task.id}`;
		} else {
			const note = createNote({ projectId: project.id, title: input.text.trim().slice(0, 180), kind: 'note' });
			saveNoteContent(note.id, `# ${note.title}\n\n${input.text.trim()}\n`);
			href = `/projects/${project.slug}/notes/${note.id}`;
		}
	}
	lines.splice(input.lineIndex, 1);
	saveNoteContent(inbox.note.id, `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`);
	return { href };
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

export function getTodayTasks(): TodayTask[] {
	const today = todayDate();
	const db = getDb();
	const rows = db
		.prepare(
			`SELECT tasks.*, projects.title AS project_title, projects.slug AS project_slug
			 FROM tasks
			 JOIN projects ON projects.id = tasks.project_id
			 WHERE tasks.archived_at IS NULL
			   AND tasks.status NOT IN ('done', 'cancelled')
			   AND (tasks.scheduled_for <= ? OR tasks.due_at <= ? OR tasks.status IN ('in_progress', 'blocked'))
			 ORDER BY
				CASE WHEN tasks.due_at < ? OR tasks.scheduled_for < ? THEN 0 ELSE 1 END,
			 	CASE tasks.status
			 		WHEN 'in_progress' THEN 0
			 		WHEN 'blocked' THEN 1
			 		WHEN 'todo' THEN 2
			 		ELSE 3
			 	END,
			 	CASE tasks.priority
			 		WHEN 'urgent' THEN 0
			 		WHEN 'high' THEN 1
			 		WHEN 'medium' THEN 2
			 		WHEN 'low' THEN 3
			 		ELSE 4
			 	END`
		)
		.all(today, today, today, today) as Array<Task & { project_title: string; project_slug: string }>;
	return rows.map((row) => ({
		...row,
		projectTitle: row.project_title,
		projectSlug: row.project_slug
	}));
}

export function getWorkbenchDashboard(): WorkbenchDashboard {
	const today = todayDate();
	const rows = getDb()
		.prepare(
			`SELECT tasks.*, projects.title AS project_title, projects.slug AS project_slug
			 FROM tasks JOIN projects ON projects.id = tasks.project_id
			 WHERE tasks.archived_at IS NULL AND tasks.status NOT IN ('done', 'cancelled')
			   AND projects.archived_at IS NULL AND projects.status IN ('active', 'on_hold')
			 ORDER BY
			   CASE WHEN tasks.due_at < ? OR tasks.scheduled_for < ? THEN 0 ELSE 1 END,
			   CASE tasks.status WHEN 'in_progress' THEN 0 WHEN 'blocked' THEN 1 ELSE 2 END,
			   CASE tasks.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
			   CASE WHEN tasks.due_at IS NULL THEN 1 ELSE 0 END, tasks.due_at ASC, tasks.position ASC`
		)
		.all(today, today) as Array<Task & { project_title: string; project_slug: string }>;
	const tasks = rows.map((row) => ({ ...row, projectTitle: row.project_title, projectSlug: row.project_slug }));
	const projects = listActiveProjects(100);
	return {
		tasks,
		inboxItems: getInboxTriageItems(),
		projects,
		repositories: projects.flatMap((project) => {
			const status = getRepositoryStatus(project);
			return status ? [{ project, status }] : [];
		}).slice(0, 8),
		counts: {
			open: tasks.length,
			inProgress: tasks.filter((task) => task.status === 'in_progress').length,
			blocked: tasks.filter((task) => task.status === 'blocked').length,
			overdue: tasks.filter((task) => Boolean((task.due_at && task.due_at < today) || (task.scheduled_for && task.scheduled_for < today))).length,
			unscheduled: tasks.filter((task) => !task.due_at && !task.scheduled_for).length
		}
	};
}

function getPreviousDailyNote(current: string): { date: string; noteId: string } | null {
	const prev = getDb()
		.prepare('SELECT note_date, note_id FROM daily_notes WHERE note_date < ? ORDER BY note_date DESC LIMIT 1')
		.get(current) as { note_date: string; note_id: string } | undefined;

	if (!prev) return null;
	return { date: prev.note_date, noteId: prev.note_id };
}

export function getYesterdayDailyNote(): { date: string; noteId: string } | null {
	return getPreviousDailyNote(todayDate());
}

function getCarryoverSummary(noteDate: string, body: string): TodayDashboard['carryover'] {
	const previous = getPreviousDailyNote(noteDate);
	if (!previous) return null;
	const previousNote = getNoteById(previous.noteId);
	const previousBody = previousNote && fileExists(previousNote.file_path) ? readManagedMarkdown(previousNote.file_path).body : '';
	return {
		sourceDate: previous.date,
		sourceNoteId: previous.noteId,
		availableCount: extractOpenChecklistItems(previousBody).length,
		importedCount: extractCarryoverItems(body).length
	};
}

export function getOrCreateTodayDashboard(): TodayDashboard {
	const noteDate = todayDate();
	const dailyMeta = getOrCreateDailyNoteMeta(noteDate);
	const daily = getNoteDocument(dailyMeta.note_id);

	return {
		daily,
		dailyMeta,
		shortcuts: buildTodayShortcuts(getWorkspaceSnapshot()),
		todayTasks: getTodayTasks(),
		yesterdayNote: getYesterdayDailyNote(),
		carryover: getCarryoverSummary(noteDate, daily.body),
		activeProjects: listActiveProjects(100).filter((project) => project.status === 'active').slice(0, 8)
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
	const previous = getPreviousDailyNote(noteDate);
	let initialBody = defaultTemplate('daily', noteDate);
	if (previous) {
		const previousNote = getNoteById(previous.noteId);
		if (previousNote && fileExists(previousNote.file_path)) {
			initialBody = mergeDailyCarryover(
				initialBody,
				extractOpenChecklistItems(readManagedMarkdown(previousNote.file_path).body),
				previous
			);
		}
	}
	writeManagedMarkdown(
		filePath,
		{
			id: noteId,
			kind: 'daily',
			daily_id: dailyId,
			title: noteDate,
			note_date: noteDate,
			created_at: createdAt,
			updated_at: createdAt
		},
		initialBody
	);
	reindexFile(filePath);
	return { id: dailyId, note_id: noteId, note_date: noteDate, created_at: createdAt, updated_at: createdAt };
}

export function carryOverDailyItems(noteId: string): NoteDocument {
	const note = getNoteById(noteId);
	if (!note || note.kind !== 'daily') throw new Error('Daily note not found');
	const meta = getDb().prepare('SELECT * FROM daily_notes WHERE note_id = ?').get(noteId) as DailyNoteMeta | undefined;
	if (!meta) throw new Error('Daily note metadata not found');
	const previous = getPreviousDailyNote(meta.note_date);
	if (!previous) return getNoteDocument(noteId);
	const previousNote = getNoteById(previous.noteId);
	if (!previousNote || !fileExists(previousNote.file_path)) return getNoteDocument(noteId);
	const current = getNoteDocument(noteId);
	const merged = mergeDailyCarryover(
		current.body,
		extractOpenChecklistItems(readManagedMarkdown(previousNote.file_path).body),
		previous
	);
	return merged === current.body ? current : saveNoteContent(noteId, merged);
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
	const ftsQuery = buildFtsQuery(query);
	if (!ftsQuery) return [];
	let rows: Omit<SearchResult, 'href'>[];
	try {
		const clauses = ['search_fts MATCH ?'];
		const params: string[] = [ftsQuery];
		if (filters?.type && filters.type !== 'all') {
			clauses.push('object_type = ?');
			params.push(filters.type);
		}
		if (filters?.projectId) {
			const project = getProjectById(filters.projectId);
			if (!project) return [];
			clauses.push('project_slug = ?');
			params.push(project.slug);
		}
		rows = db
			.prepare(
				`SELECT *
				 FROM search_fts
				 WHERE ${clauses.join(' AND ')}
				 ORDER BY rank, updated_at DESC
				 LIMIT 30`
			)
			.all(...params) as Omit<SearchResult, 'href'>[];
	} catch {
		return [];
	}
	return rows.map((row) => ({
			...row,
			href: resolveObjectHref(row.object_type, row.object_id)
		}));
}

function buildFtsQuery(query: string): string {
	return (query.match(/[A-Za-z0-9_]+/g) ?? [])
		.map((term) => `"${term.replaceAll('"', '""')}"*`)
		.join(' ');
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
				tertiary: `${labelFromSnakeCase(project.status)} / ${formatRelative(project.updated_at)}`
			}))
		},
		{
			key: 'tasks',
			label: 'Open tasks',
			description: 'Only todo, in-progress, and blocked tasks show up here.',
			count: snapshot.openTaskCount,
			countLabel: 'open',
			summary: `${taskCounts.todo} todo / ${taskCounts.in_progress} in progress / ${taskCounts.blocked} blocked`,
			columns: ['Task', 'Project', 'State'],
			emptyMessage: 'Open tasks show up here as soon as they exist.',
			rows: tasks.map((task) => ({
				id: task.id,
				href: `/projects/${task.project_slug}#task-${task.id}`,
				primary: task.title,
				secondary: task.project_title,
				tertiary: `${labelFromSnakeCase(task.status)} / ${
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
		activeProjects: listActiveProjects(100),
		allProjects: listProjects(),
		snapshot,
		pulseCollections: [],
		recentItems: recent,
		commandPaletteItems: [
			{ id: 'go-today', group: 'Navigate', label: 'Go to Today', href: '/today', action: null },
			{ id: 'go-work', group: 'Navigate', label: 'Go to Workbench', href: '/work', action: null },
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

export function getWorkspaceHealth(): {
	databaseStatus: string;
	missingFiles: number;
	canonicalTaskFiles: number;
	historySnapshots: number;
} {
	const db = getDb();
	const integrity = (db.pragma('integrity_check', { simple: true }) as string) || 'unknown';
	const notes = db.prepare('SELECT file_path FROM notes WHERE archived_at IS NULL').all() as Array<{ file_path: string }>;
	const missingFiles = notes.filter((note) => !fileExists(note.file_path)).length;
	const canonicalTaskFiles = listWorkspaceMarkdownFiles().filter((filePath) => path.basename(path.dirname(filePath)) === 'tasks').length;
	const historyRoot = path.join(getWorkspaceDir(), '.app', 'history');
	const historySnapshots = fs.existsSync(historyRoot)
		? fs.readdirSync(historyRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())
			.reduce((sum, entry) => sum + fs.readdirSync(path.join(historyRoot, entry.name)).length, 0)
		: 0;
	return {
		databaseStatus: integrity === 'ok' && missingFiles === 0 ? 'Healthy · filesystem and index agree' : `Attention required · ${integrity}`,
		missingFiles,
		canonicalTaskFiles,
		historySnapshots
	};
}

export function listArchivedItems(): Array<{ id: string; type: 'task' | 'note' | 'meeting'; title: string; context: string; restoreUrl: string }> {
	const db = getDb();
	const tasks = db.prepare(
		`SELECT tasks.id, tasks.title, projects.title AS context FROM tasks JOIN projects ON projects.id = tasks.project_id
		 WHERE tasks.archived_at IS NOT NULL ORDER BY tasks.archived_at DESC LIMIT 30`
	).all() as Array<{ id: string; title: string; context: string }>;
	const meetings = db.prepare(
		`SELECT meetings.id, meetings.title, projects.title AS context FROM meetings JOIN projects ON projects.id = meetings.project_id
		 WHERE meetings.archived_at IS NOT NULL ORDER BY meetings.archived_at DESC LIMIT 30`
	).all() as Array<{ id: string; title: string; context: string }>;
	const notes = db.prepare(
		`SELECT notes.id, notes.title, COALESCE(projects.title, 'Workspace') AS context FROM notes LEFT JOIN projects ON projects.id = notes.project_id
		 WHERE notes.archived_at IS NOT NULL AND notes.kind != 'meeting' ORDER BY notes.archived_at DESC LIMIT 30`
	).all() as Array<{ id: string; title: string; context: string }>;
	return [
		...tasks.map((item) => ({ ...item, type: 'task' as const, restoreUrl: `/api/tasks/${item.id}/restore` })),
		...meetings.map((item) => ({ ...item, type: 'meeting' as const, restoreUrl: `/api/meetings/${item.id}/restore` })),
		...notes.map((item) => ({ ...item, type: 'note' as const, restoreUrl: `/api/notes/${item.id}/restore` }))
	].slice(0, 50);
}

export function rebuildWorkspaceFromFiles(): void {
	hydrateWorkspaceFromFiles();
	persistCanonicalState();
	reindexWorkspace();
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
	for (const project of db.prepare('SELECT * FROM projects WHERE archived_at IS NULL').all() as Project[]) {
		upsertSearchRow('project', project.id, project.title, project.summary, project.title, project.updated_at, project.slug);
	}
	for (const task of db.prepare('SELECT * FROM tasks WHERE archived_at IS NULL').all() as Task[]) {
		replaceObjectLinks('task', task.id, task.description_md);
		upsertTaskSearch(task);
	}
	for (const note of db.prepare('SELECT * FROM notes WHERE archived_at IS NULL').all() as Note[]) {
		if (fileExists(note.file_path)) {
			reindexFile(note.file_path);
		}
	}
}

export function extractTasksFromMeetingMarkdown(meetingId: string): Task[] {
	const meeting = getMeetingDocument(meetingId);
	const created: Task[] = [];
	const lines = meeting.body.split('\n');
	let changed = false;
	for (const [index, line] of lines.entries()) {
		const match = line.match(/^(\s*[-*+]\s+\[)([ xX])(\]\s+)(.+)$/);
		if (!match) continue;
		const linked = match[4].match(/^\[\[task\/(tsk_[a-f0-9]{24})(?:\|([^\]]+))?\]\]$/);
		if (linked) {
			const task = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(linked[1]) as Task | undefined;
			if (task) {
				const status = match[2].toLowerCase() === 'x' ? 'done' : task.status === 'done' ? 'todo' : task.status;
				const title = linked[2]?.trim() || task.title;
				if (status !== task.status || title !== task.title) updateTask(task.id, { status, title });
			}
			continue;
		}
		if (match[2].toLowerCase() === 'x') continue;
		const title = match[4].trim();
		const exists = getDb()
			.prepare('SELECT id FROM tasks WHERE source_meeting_id = ? AND title = ?')
			.get(meetingId, title) as { id: string } | undefined;
		if (exists) {
			lines[index] = `${match[1]} ${match[3]}[[task/${exists.id}|${title}]]`;
			changed = true;
			continue;
		}
		const task = createTask({
				projectId: meeting.project.id,
				title,
				sourceMeetingId: meetingId
			});
		created.push(task);
		lines[index] = `${match[1]} ${match[3]}[[task/${task.id}|${title}]]`;
		changed = true;
	}
	if (changed) saveNoteContent(meeting.note.id, `${lines.join('\n').trimEnd()}\n`, { force: true });
	return created;
}
