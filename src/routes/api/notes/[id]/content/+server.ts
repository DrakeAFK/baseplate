import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { saveNoteContent, WorkspaceConflictError } from '$lib/server/services/workspace';

const schema = z.object({
	body: z.string(),
	baseBody: z.string().optional(),
	force: z.boolean().optional()
});

export const PUT: RequestHandler = async ({ request, params }) => {
	try {
		const payload = schema.parse(await request.json());
		return json({ document: saveNoteContent(params.id, payload.body, payload) });
	} catch (error) {
		if (error instanceof WorkspaceConflictError) {
			return json({ error: error.message, document: error.document }, { status: 409 });
		}
		return json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: 400 });
	}
};
