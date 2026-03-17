import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getMeetingDocument, touchRecentItem } from '$lib/server/services/workspace';

export const load: PageServerLoad = async ({ params }) => {
	try {
		const document = getMeetingDocument(params.meetingId);
		touchRecentItem('meeting', document.meeting.id);
		return document;
	} catch {
		throw error(404, 'Meeting not found');
	}
};
