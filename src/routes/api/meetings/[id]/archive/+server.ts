import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { archiveMeeting } from '$lib/server/services/workspace';

export const POST: RequestHandler = async ({ params }) => {
	archiveMeeting(params.id, true);
	return json({ ok: true });
};
