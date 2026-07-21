import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { captureInboxItem, triageInboxItem } from '$lib/server/services/workspace';

const captureSchema = z.object({ text: z.string().trim().min(1).max(1000) });
const triageSchema = z.object({
	lineIndex: z.number().int().nonnegative(),
	text: z.string().min(1),
	action: z.enum(['task', 'note', 'discard']),
	projectId: z.string().optional()
});

export const POST: RequestHandler = async ({ request }) => {
	try {
		const payload = await request.json();
		if (payload.action) return json(triageInboxItem(triageSchema.parse(payload)));
		return json({ document: captureInboxItem(captureSchema.parse(payload).text) });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'Unable to update inbox' }, { status: 400 });
	}
};
