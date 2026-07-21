import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getNoteDocument, listDocumentHistory, touchRecentItem } from '$lib/server/services/workspace';

export const load: PageServerLoad = async ({ params }) => {
	try {
		const document = getNoteDocument(params.noteId);
		touchRecentItem('note', document.note.id);
		return { ...document, history: listDocumentHistory(document.note.id) };
	} catch {
		throw error(404, 'Note not found');
	}
};
