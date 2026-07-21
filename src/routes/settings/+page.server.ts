import type { PageServerLoad } from './$types';
import { getShellData, getWorkspaceHealth, listArchivedItems } from '$lib/server/services/workspace';

export const load: PageServerLoad = async () => {
	const shell = getShellData();
	const health = getWorkspaceHealth();
	return {
		workspaceDir: shell.workspaceDir,
		databaseStatus: health.databaseStatus,
		missingFiles: health.missingFiles,
		canonicalTaskFiles: health.canonicalTaskFiles,
		historySnapshots: health.historySnapshots,
		archivedItems: listArchivedItems(),
		appInfo: 'Local-first engineering workspace',
		snapshot: shell.snapshot
	};
};
