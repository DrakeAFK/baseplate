import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { extractTasksFromMeetingMarkdown } from '$lib/server/services/workspace';

const schema = z.object({
	meetingId: z.string().min(1)
});

export const POST: RequestHandler = async ({ request }) => {
	const payload = schema.parse(await request.json());
	return json({ tasks: extractTasksFromMeetingMarkdown(payload.meetingId) });
};
