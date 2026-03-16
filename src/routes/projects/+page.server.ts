import type { PageServerLoad } from './$types';
import { listProjects } from '$lib/server/services/workspace';

export const load: PageServerLoad = async ({ url }) => {
	const status = url.searchParams.get('status') ?? undefined;
	const q = url.searchParams.get('q') ?? undefined;
	return {
		projects: listProjects({
			status: (status as 'active' | 'on_hold' | 'completed' | 'archived' | undefined) ?? 'active',
			q
		}),
		status: status ?? 'active',
		q: q ?? ''
	};
};
