import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { reindexWorkspace } from '$lib/server/services/workspace';

export const POST: RequestHandler = async () => {
	reindexWorkspace();
	return json({ ok: true });
};
