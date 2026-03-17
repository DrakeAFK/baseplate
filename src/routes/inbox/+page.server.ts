import type { PageServerLoad } from './$types';
import { getInboxDocument, touchRecentItem } from '$lib/server/services/workspace';

export const load: PageServerLoad = async () => {
	const document = getInboxDocument();
	touchRecentItem('note', document.note.id);
	return document;
};
