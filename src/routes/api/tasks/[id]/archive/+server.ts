import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { archiveTask } from '$lib/server/services/workspace';

export const POST: RequestHandler = async ({ params }) => {
	archiveTask(params.id, true);
	return json({ ok: true });
};
