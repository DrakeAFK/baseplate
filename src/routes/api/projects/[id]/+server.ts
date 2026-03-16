import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { updateProject } from '$lib/server/services/workspace';

const schema = z.object({
	title: z.string().trim().min(1).max(140).optional(),
	summary: z.string().max(500).optional(),
	status: z.enum(['active', 'on_hold', 'completed', 'archived']).optional(),
	kind: z.enum(['standard', 'perpetual']).optional()
});

export const PATCH: RequestHandler = async ({ request, params }) => {
	try {
		const payload = schema.parse(await request.json());
		return json({ project: updateProject(params.id, payload) });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: 400 });
	}
};
