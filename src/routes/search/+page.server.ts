import type { PageServerLoad } from './$types';
import { listActiveProjects } from '$lib/server/services/workspace';

export const load: PageServerLoad = async () => {
	return {
		projects: listActiveProjects(50)
	};
};
