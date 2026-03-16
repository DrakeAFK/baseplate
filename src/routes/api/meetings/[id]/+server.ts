import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { updateMeeting } from '$lib/server/services/workspace';

const schema = z.object({
	title: z.string().trim().min(1).max(180).optional(),
	meeting_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

export const PATCH: RequestHandler = async ({ request, params }) => {
	try {
		const payload = schema.parse(await request.json());
		return json({ meeting: updateMeeting(params.id, payload) });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: 400 });
	}
};
