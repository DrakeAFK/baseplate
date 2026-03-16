import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getProjectDashboard } from '$lib/server/services/workspace';

export const load: PageServerLoad = async ({ params }) => {
	try {
		return getProjectDashboard(params.slug);
	} catch {
		throw error(404, 'Project not found');
	}
};
