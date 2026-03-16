import path from 'node:path';
import { yearFromDate } from '$lib/utils/dates';

const repoRoot = process.cwd();
const workspaceDir = process.env.WORKSPACE_DIR
	? path.resolve(process.env.WORKSPACE_DIR)
	: path.join(repoRoot, 'workspace');

export function getWorkspaceDir(): string {
	return workspaceDir;
}

export function getDbPath(): string {
	return path.join(workspaceDir, '.app', 'app.db');
}

export function getProjectsDir(): string {
	return path.join(workspaceDir, 'projects');
}

export function getDailyDir(): string {
	return path.join(workspaceDir, 'daily');
}

export function getInboxPath(): string {
	return path.join(workspaceDir, 'inbox', 'inbox.md');
}

export function getProjectDir(slug: string): string {
	return path.join(getProjectsDir(), slug);
}

export function getProjectHomePath(slug: string): string {
	return path.join(getProjectDir(slug), 'project.md');
}

export function getProjectNotePath(slug: string, kind: 'note' | 'doc' | 'decision', noteSlug: string): string {
	const folder = kind === 'note' ? 'notes' : kind === 'doc' ? 'docs' : 'decisions';
	return path.join(getProjectDir(slug), folder, `${noteSlug}.md`);
}

export function getMeetingPath(slug: string, meetingDate: string, meetingSlug: string): string {
	return path.join(getProjectDir(slug), 'meetings', yearFromDate(meetingDate), `${meetingDate}--${meetingSlug}.md`);
}

export function getDailyNotePath(noteDate: string): string {
	return path.join(getDailyDir(), yearFromDate(noteDate), `${noteDate}.md`);
}
