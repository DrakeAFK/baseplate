import type { PageServerLoad } from './$types';
import { getWorkbenchDashboard } from '$lib/server/services/workspace';

export const load: PageServerLoad = async () => getWorkbenchDashboard();
