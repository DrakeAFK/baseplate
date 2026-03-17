import type { PageServerLoad } from './$types';
import { listNotesIndex, listProjects } from '$lib/server/services/workspace';

export const load: PageServerLoad = async () => {
	return {
		notes: listNotesIndex(),
		projects: listProjects()
	};
};
