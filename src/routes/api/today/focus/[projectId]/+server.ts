import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setProjectFocus } from '$lib/server/services/workspace';

export const DELETE: RequestHandler = async ({ params }) => {
	setProjectFocus(params.projectId, false);
	return json({ ok: true });
};
