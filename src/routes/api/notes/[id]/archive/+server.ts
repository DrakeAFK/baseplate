import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { archiveNote } from '$lib/server/services/workspace';

export const POST: RequestHandler = async ({ params }) => {
	archiveNote(params.id, true);
	return json({ ok: true });
};
