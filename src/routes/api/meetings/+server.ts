import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { createMeeting } from '$lib/server/services/workspace';

const schema = z.object({
	projectId: z.string().min(1),
	title: z.string().trim().min(1).max(180),
	meetingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

export const POST: RequestHandler = async ({ request }) => {
	try {
		const payload = schema.parse(await request.json());
		return json({ meeting: createMeeting(payload) });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: 400 });
	}
};
