import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { createTask } from '$lib/server/services/workspace';

const schema = z.object({
	projectId: z.string().min(1),
	title: z.string().trim().min(1).max(240),
	parentTaskId: z.string().optional().nullable(),
	description: z.string().optional(),
	priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
	status: z.enum(['todo', 'in_progress', 'blocked', 'done', 'cancelled']).optional(),
	scheduledFor: z.string().optional().nullable(),
	dueAt: z.string().optional().nullable(),
	sourceMeetingId: z.string().optional().nullable(),
	sourceNoteId: z.string().optional().nullable()
});

export const POST: RequestHandler = async ({ request }) => {
	try {
		const payload = schema.parse(await request.json());
		return json({ task: createTask(payload) });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: 400 });
	}
};
