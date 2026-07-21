import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import type { NoteKind, ProjectKind, ProjectStatus, TaskPriority, TaskStatus } from '$lib/types/models';

export interface ManagedFrontmatter {
	id: string;
	kind: NoteKind | 'task';
	title: string;
	project?: string;
	project_id?: string;
	project_kind?: ProjectKind;
	project_status?: ProjectStatus;
	project_summary?: string;
	repo_path?: string;
	sort_position?: number;
	meeting_id?: string;
	meeting_date?: string;
	daily_id?: string;
	note_date?: string;
	parent_task_id?: string | null;
	source_meeting_id?: string | null;
	source_note_id?: string | null;
	status?: TaskStatus;
	priority?: TaskPriority;
	scheduled_for?: string | null;
	due_at?: string | null;
	position?: number;
	completed_at?: string | null;
	archived_at?: string | null;
	created_at: string;
	updated_at: string;
}

export function ensureDir(filePath: string): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function writeManagedMarkdown(filePath: string, frontmatter: ManagedFrontmatter, body: string): void {
	ensureDir(filePath);
	const sanitizedFrontmatter = Object.fromEntries(
		Object.entries(frontmatter).filter(([, value]) => value !== undefined)
	);
	const content = matter.stringify(body.trimEnd() ? `${body.trimEnd()}\n` : '', sanitizedFrontmatter);
	if (fs.existsSync(filePath)) {
		const previous = fs.readFileSync(filePath, 'utf8');
		if (previous === content) return;
		const workspaceDir = process.env.WORKSPACE_DIR ? path.resolve(process.env.WORKSPACE_DIR) : path.join(process.cwd(), 'workspace');
		const historyDir = path.join(workspaceDir, '.app', 'history', frontmatter.id);
		fs.mkdirSync(historyDir, { recursive: true });
		const latest = fs.readdirSync(historyDir).sort().at(-1);
		const latestTime = latest ? Number(latest.split('.')[0]) : 0;
		if (Date.now() - latestTime >= 60_000) {
			fs.writeFileSync(path.join(historyDir, `${Date.now()}.md`), previous, 'utf8');
			const snapshots = fs.readdirSync(historyDir).sort();
			for (const snapshot of snapshots.slice(0, -40)) fs.unlinkSync(path.join(historyDir, snapshot));
		}
	}
	const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
	fs.writeFileSync(tempPath, content, 'utf8');
	fs.renameSync(tempPath, filePath);
}

export function readManagedMarkdown(filePath: string): { data: ManagedFrontmatter; body: string } {
	const raw = fs.readFileSync(filePath, 'utf8');
	const parsed = matter(raw);
	return {
		data: parsed.data as ManagedFrontmatter,
		body: parsed.content
	};
}

export function fileExists(filePath: string): boolean {
	return fs.existsSync(filePath);
}
