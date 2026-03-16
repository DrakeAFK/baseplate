import type { PageServerLoad } from './$types';
import { getInboxDocument } from '$lib/server/services/workspace';

export const load: PageServerLoad = async () => {
	return getInboxDocument();
};
