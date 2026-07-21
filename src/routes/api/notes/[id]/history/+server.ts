import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { listDocumentHistory, restoreDocumentHistory } from '$lib/server/services/workspace';

export const GET: RequestHandler = async ({ params }) => json({ history: listDocumentHistory(params.id) });

const schema = z.object({ timestamp: z.number().int().positive() });
export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const { timestamp } = schema.parse(await request.json());
		return json({ document: restoreDocumentHistory(params.id, timestamp) });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'Unable to restore snapshot' }, { status: 400 });
	}
};
