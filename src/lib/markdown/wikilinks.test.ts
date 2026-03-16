import { describe, expect, it } from 'vitest';
import { extractWikiLinks } from './wikilinks';

describe('wikilinks', () => {
	it('extracts stable links', () => {
		expect(extractWikiLinks('See [[note/nte_1234567890abcdef12345678|Spec]] today.')).toEqual([
			{
				full: '[[note/nte_1234567890abcdef12345678|Spec]]',
				type: 'note',
				id: 'nte_1234567890abcdef12345678',
				label: 'Spec'
			}
		]);
	});
});
