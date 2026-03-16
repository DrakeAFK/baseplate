import type { PageServerLoad } from './$types';
import { getShellData } from '$lib/server/services/workspace';

export const load: PageServerLoad = async () => {
	const shell = getShellData();
	return {
		workspaceDir: shell.workspaceDir,
		databaseStatus: 'healthy',
		appInfo: 'Local-first engineering workspace'
	};
};
