import type { PageServerLoad } from './$types';
import { getOrCreateTodayDashboard } from '$lib/server/services/workspace';

export const load: PageServerLoad = async () => {
	return getOrCreateTodayDashboard();
};
