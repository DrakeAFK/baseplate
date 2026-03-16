import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { saveMeetingContent } from '$lib/server/services/workspace';

const schema = z.object({
	body: z.string()
});

export const PUT: RequestHandler = async ({ request, params }) => {
	try {
		const payload = schema.parse(await request.json());
		return json({ document: saveMeetingContent(params.id, payload.body) });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: 400 });
	}
};
