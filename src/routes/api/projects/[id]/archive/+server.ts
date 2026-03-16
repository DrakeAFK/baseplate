import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { archiveProject } from '$lib/server/services/workspace';

export const POST: RequestHandler = async ({ params }) => {
	archiveProject(params.id, true);
	return json({ ok: true });
};
