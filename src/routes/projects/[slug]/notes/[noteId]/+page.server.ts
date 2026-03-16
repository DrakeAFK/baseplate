import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getNoteDocument } from '$lib/server/services/workspace';

export const load: PageServerLoad = async ({ params }) => {
	try {
		return getNoteDocument(params.noteId);
	} catch {
		throw error(404, 'Note not found');
	}
};
