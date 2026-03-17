import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDailyNoteDocumentByDate, touchRecentItem } from '$lib/server/services/workspace';
import { todayDate } from '$lib/utils/dates';

export const load: PageServerLoad = async ({ params }) => {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
		throw error(404, 'Daily note not found');
	}

	try {
		const document = getDailyNoteDocumentByDate(params.date);
		touchRecentItem('note', document.daily.note.id);
		return {
			...document,
			isToday: params.date === todayDate()
		};
	} catch {
		throw error(404, 'Daily note not found');
	}
};
