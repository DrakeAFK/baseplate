import type { LinkableObjectType } from '$lib/types/models';

export interface WikiLinkMatch {
	full: string;
	type: LinkableObjectType;
	id: string;
	label: string | null;
}

const WIKILINK_REGEX = /\[\[(project|note|meeting|task)\/([a-z]{3}_[a-f0-9]{24})(?:\|([^\]]+))?\]\]/g;

export function extractWikiLinks(content: string): WikiLinkMatch[] {
	return Array.from(content.matchAll(WIKILINK_REGEX)).map((match) => ({
		full: match[0],
		type: match[1] as LinkableObjectType,
		id: match[2],
		label: match[3] ?? null
	}));
}
