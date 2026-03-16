import type { LayoutServerLoad } from './$types';
import { bootstrapWorkspace, getShellData } from '$lib/server/services/workspace';

export const load: LayoutServerLoad = async () => {
	bootstrapWorkspace();
	return {
		shell: getShellData()
	};
};
