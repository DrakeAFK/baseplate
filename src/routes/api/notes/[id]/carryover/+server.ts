import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { carryOverDailyItems } from '$lib/server/services/workspace';

export const POST: RequestHandler = async ({ params }) => {
	try {
		return json({ document: carryOverDailyItems(params.id) });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'Unable to carry items forward' }, { status: 400 });
	}
};
