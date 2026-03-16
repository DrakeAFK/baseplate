import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { updateNote } from '$lib/server/services/workspace';

const schema = z.object({
	title: z.string().trim().min(1).max(180)
});

export const PATCH: RequestHandler = async ({ request, params }) => {
	try {
		const payload = schema.parse(await request.json());
		return json({ note: updateNote(params.id, payload) });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: 400 });
	}
};
