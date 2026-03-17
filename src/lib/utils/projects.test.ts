import { describe, expect, it } from 'vitest';
import { moveItem, sortProjects } from './projects';
import type { Project } from '$lib/types/models';

const projects: Project[] = [
	{
		id: 'prj_a',
		slug: 'zeta',
		title: 'Zeta',
		kind: 'standard',
		status: 'active',
		summary: '',
		sort_position: 0,
		created_at: '2026-03-10T10:00:00.000Z',
		updated_at: '2026-03-10T10:00:00.000Z',
		archived_at: null
	},
	{
		id: 'prj_b',
		slug: 'alpha',
		title: 'Alpha',
		kind: 'standard',
		status: 'active',
		summary: '',
		sort_position: 1,
		created_at: '2026-03-11T10:00:00.000Z',
		updated_at: '2026-03-12T10:00:00.000Z',
		archived_at: null
	},
	{
		id: 'prj_c',
		slug: 'gamma',
		title: 'Gamma',
		kind: 'perpetual',
		status: 'active',
		summary: '',
		sort_position: 2,
		created_at: '2026-03-12T10:00:00.000Z',
		updated_at: '2026-03-11T10:00:00.000Z',
		archived_at: null
	}
];

describe('project ordering helpers', () => {
	it('keeps manual order intact', () => {
		expect(sortProjects(projects, 'manual').map((project) => project.id)).toEqual(['prj_a', 'prj_b', 'prj_c']);
	});

	it('sorts by most recently updated', () => {
		expect(sortProjects(projects, 'updated').map((project) => project.id)).toEqual(['prj_b', 'prj_c', 'prj_a']);
	});

	it('sorts by title alphabetically', () => {
		expect(sortProjects(projects, 'title').map((project) => project.id)).toEqual(['prj_b', 'prj_c', 'prj_a']);
	});

	it('moves one item without mutating the original array', () => {
		const moved = moveItem(projects, 2, 0);
		expect(moved.map((project) => project.id)).toEqual(['prj_c', 'prj_a', 'prj_b']);
		expect(projects.map((project) => project.id)).toEqual(['prj_a', 'prj_b', 'prj_c']);
	});
});
