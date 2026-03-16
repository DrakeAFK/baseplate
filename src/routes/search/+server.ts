import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchWorkspace } from '$lib/server/services/workspace';

export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const type = (url.searchParams.get('type') ?? 'all') as 'all' | 'project' | 'task' | 'note' | 'meeting';
	const projectId = url.searchParams.get('projectId') ?? undefined;
	return json({ results: searchWorkspace(q, { type, projectId }) });
};
