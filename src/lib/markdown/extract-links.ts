import { createId } from '$lib/utils/ids';
import { nowIso } from '$lib/utils/dates';
import { extractWikiLinks } from './wikilinks';
import type { ObjectLink } from '$lib/types/models';

export function buildOutgoingLinks(
	fromType: 'note' | 'task',
	fromId: string,
	content: string
): ObjectLink[] {
	return extractWikiLinks(content).map((link) => ({
		id: createId('lnk'),
		from_type: fromType,
		from_id: fromId,
		to_type: link.type,
		to_id: link.id,
		label: link.label ?? '',
		raw_text: link.full,
		created_at: nowIso()
	}));
}
