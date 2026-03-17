import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { reorderProjects } from '$lib/server/services/workspace';

const schema = z.object({
	status: z.enum(['active', 'on_hold', 'completed', 'archived']),
	projectIds: z.array(z.string().min(1))
});

export const POST: RequestHandler = async ({ request }) => {
	try {
		const payload = schema.parse(await request.json());
		reorderProjects(payload.status, payload.projectIds);
		return json({ ok: true });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: 400 });
	}
};
