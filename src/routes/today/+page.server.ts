import type { PageServerLoad } from './$types';
import { getOrCreateTodayDashboard, touchRecentItem } from '$lib/server/services/workspace';

export const load: PageServerLoad = async () => {
	const dashboard = getOrCreateTodayDashboard();
	touchRecentItem('note', dashboard.daily.note.id);
	return dashboard;
};
