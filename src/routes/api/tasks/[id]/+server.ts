import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { updateTask } from '$lib/server/services/workspace';

const schema = z.object({
	parent_task_id: z.string().optional().nullable(),
	source_meeting_id: z.string().optional().nullable(),
	source_note_id: z.string().optional().nullable(),
	title: z.string().trim().min(1).max(240).optional(),
	description_md: z.string().optional(),
	status: z.enum(['todo', 'in_progress', 'blocked', 'done', 'cancelled']).optional(),
	priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
	scheduled_for: z.string().optional().nullable(),
	due_at: z.string().optional().nullable()
});

export const PATCH: RequestHandler = async ({ request, params }) => {
	try {
		const payload = schema.parse(await request.json());
		return json({ task: updateTask(params.id, payload) });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: 400 });
	}
};
