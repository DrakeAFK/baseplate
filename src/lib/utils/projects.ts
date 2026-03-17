import type { Project } from '$lib/types/models';

export type ProjectSortMode = 'manual' | 'updated' | 'title';

function compareTitle(a: Project, b: Project): number {
	return a.title.localeCompare(b.title, 'en-US', { sensitivity: 'base' });
}

export function sortProjects(projects: Project[], mode: ProjectSortMode): Project[] {
	if (mode === 'manual') {
		return [...projects];
	}

	if (mode === 'updated') {
		return [...projects].sort((a, b) => b.updated_at.localeCompare(a.updated_at) || compareTitle(a, b));
	}

	return [...projects].sort((a, b) => compareTitle(a, b) || b.updated_at.localeCompare(a.updated_at));
}

export function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
	if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
		return [...items];
	}

	const next = [...items];
	const [item] = next.splice(fromIndex, 1);
	next.splice(toIndex, 0, item);
	return next;
}
