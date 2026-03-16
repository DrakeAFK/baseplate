import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { setProjectFocus } from '$lib/server/services/workspace';

const schema = z.object({
	projectId: z.string().min(1)
});

export const POST: RequestHandler = async ({ request }) => {
	const payload = schema.parse(await request.json());
	setProjectFocus(payload.projectId, true);
	return json({ ok: true });
};
