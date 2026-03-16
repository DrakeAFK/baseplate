import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getMeetingDocument } from '$lib/server/services/workspace';

export const load: PageServerLoad = async ({ params }) => {
	try {
		return getMeetingDocument(params.meetingId);
	} catch {
		throw error(404, 'Meeting not found');
	}
};
