import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { createProject } from '$lib/server/services/workspace';

const schema = z.object({
	title: z.string().trim().min(1).max(140),
	kind: z.enum(['standard', 'perpetual']).default('standard'),
	summary: z.string().max(500).optional().default('')
});

export const POST: RequestHandler = async ({ request }) => {
	try {
		const payload = schema.parse(await request.json());
		return json({ project: createProject(payload) });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: 400 });
	}
};
