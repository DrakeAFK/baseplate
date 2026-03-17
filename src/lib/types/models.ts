export type ProjectKind = 'standard' | 'perpetual';
export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived';
export type NoteKind = 'project_home' | 'note' | 'doc' | 'decision' | 'meeting' | 'daily' | 'inbox';
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type SearchObjectType = 'project' | 'task' | 'note' | 'meeting';
export type LinkableObjectType = SearchObjectType;

export interface Project {
	id: string;
	slug: string;
	title: string;
	kind: ProjectKind;
	status: ProjectStatus;
	summary: string;
	sort_position: number;
	created_at: string;
	updated_at: string;
	archived_at: string | null;
}

export interface Note {
	id: string;
	project_id: string | null;
	kind: NoteKind;
	title: string;
	file_path: string;
	excerpt: string;
	created_at: string;
	updated_at: string;
	archived_at: string | null;
}

export interface Meeting {
	id: string;
	project_id: string;
	note_id: string;
	title: string;
	meeting_date: string;
	created_at: string;
	updated_at: string;
	archived_at: string | null;
}

export interface DailyNoteMeta {
	id: string;
	note_id: string;
	note_date: string;
	created_at: string;
	updated_at: string;
}

export interface Task {
	id: string;
	project_id: string;
	parent_task_id: string | null;
	source_meeting_id: string | null;
	source_note_id: string | null;
	title: string;
	description_md: string;
	status: TaskStatus;
	priority: TaskPriority;
	scheduled_for: string | null;
	due_at: string | null;
	position: number;
	created_at: string;
	updated_at: string;
	completed_at: string | null;
	archived_at: string | null;
}

export interface TaskTreeItem extends Task {
	children: TaskTreeItem[];
	project?: Project;
}

export interface ObjectLink {
	id: string;
	from_type: 'note' | 'task';
	from_id: string;
	to_type: LinkableObjectType;
	to_id: string;
	label: string;
	raw_text: string;
	created_at: string;
}

export interface SearchResult {
	object_type: SearchObjectType;
	object_id: string;
	title: string;
	body: string;
	project_title: string;
	updated_at: string;
	project_slug: string | null;
	href: string | null;
}

export interface BacklinkItem {
	fromType: 'note' | 'task';
	fromId: string;
	title: string;
	projectTitle: string | null;
	projectSlug: string | null;
	snippet: string;
	href: string | null;
}

export interface NoteDocument {
	note: Note;
	project: Project | null;
	body: string;
	html: string;
	backlinks: BacklinkItem[];
	missing: boolean;
}

export interface MeetingDocument {
	meeting: Meeting;
	note: Note;
	project: Project;
	body: string;
	html: string;
	backlinks: BacklinkItem[];
	relatedTasks: Task[];
	missing: boolean;
}

export interface ProjectDashboard {
	project: Project;
	homeNote: NoteDocument | null;
	taskGroups: Record<TaskStatus, TaskTreeItem[]>;
	meetings: Array<Meeting & { excerpt: string; task_count: number }>;
	notesByKind: Record<'note' | 'doc' | 'decision', Note[]>;
	backlinks: BacklinkItem[];
	activity: Array<{
		type: 'note' | 'meeting' | 'task';
		id: string;
		title: string;
		updatedAt: string;
		href: string | null;
	}>;
}

export interface TodayShortcut {
	id: string;
	title: string;
	description: string;
	href: string;
}

export interface TodayDashboard {
	daily: NoteDocument;
	dailyMeta: DailyNoteMeta;
	shortcuts: TodayShortcut[];
}

export interface NotesIndexItem {
	note: Note;
	project: Project | null;
	dailyNoteDate: string | null;
	href: string | null;
}

export type WorkspacePulseKey = 'projects' | 'tasks';

export interface WorkspacePulseRow {
	id: string;
	href: string | null;
	primary: string;
	secondary: string;
	tertiary: string;
}

export interface WorkspacePulseCollection {
	key: WorkspacePulseKey;
	label: string;
	description: string;
	count: number;
	countLabel: string;
	summary: string;
	columns: [string, string, string];
	emptyMessage: string;
	rows: WorkspacePulseRow[];
}

export interface AppShellData {
	workspaceDir: string;
	activeProjects: Project[];
	allProjects: Project[];
	snapshot: {
		projectCount: number;
		openTaskCount: number;
		noteCount: number;
		meetingCount: number;
	};
	pulseCollections: WorkspacePulseCollection[];
	recentItems: Array<{
		object_type: SearchObjectType;
		object_id: string;
		title: string;
		href: string | null;
		last_opened_at: string;
	}>;
	commandPaletteItems: Array<{
		id: string;
		group: string;
		label: string;
		href: string | null;
		action: string | null;
		payload?: Record<string, string>;
	}>;
}
