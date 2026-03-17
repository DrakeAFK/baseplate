import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getProjectDashboard, touchRecentItem } from '$lib/server/services/workspace';

export const load: PageServerLoad = async ({ params }) => {
	try {
		const dashboard = getProjectDashboard(params.slug);
		touchRecentItem('project', dashboard.project.id);
		return dashboard;
	} catch {
		throw error(404, 'Project not found');
	}
};
