import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rebuildWorkspaceFromFiles } from '$lib/server/services/workspace';

export const POST: RequestHandler = async () => {
	rebuildWorkspaceFromFiles();
	return json({ ok: true });
};
