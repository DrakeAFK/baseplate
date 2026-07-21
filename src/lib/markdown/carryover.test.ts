import { describe, expect, it } from 'vitest';
import { extractCarryoverItems, extractOpenChecklistItems, mergeDailyCarryover } from './carryover';

describe('daily carryover', () => {
	it('extracts only unique open checklist items', () => {
		expect(extractOpenChecklistItems('- [ ] Ship it\n- [x] Done\n  * [ ] Follow up\n- [ ] Ship it')).toEqual([
			{ text: 'Ship it', line: '- [ ] Ship it' },
			{ text: 'Follow up', line: '- [ ] Follow up' }
		]);
	});

	it('adds carryover before the first daily section', () => {
		const result = mergeDailyCarryover('# 2026-07-21\n\n## Focus\n', [{ text: 'Fix editor', line: '- [ ] Fix editor' }], {
			date: '2026-07-20',
			noteId: 'nte_0123456789abcdef01234567'
		});
		expect(result).toContain('## Carryover');
		expect(result.indexOf('## Carryover')).toBeLessThan(result.indexOf('## Focus'));
		expect(extractCarryoverItems(result)).toHaveLength(1);
	});

	it('does not duplicate an item already present in the note', () => {
		const source = { date: '2026-07-20', noteId: 'nte_0123456789abcdef01234567' };
		const once = mergeDailyCarryover('# Today\n\n## Focus\n', [{ text: 'Fix editor', line: '- [ ] Fix editor' }], source);
		expect(mergeDailyCarryover(once, [{ text: 'Fix editor', line: '- [ ] Fix editor' }], source)).toBe(once);
	});

	it('does not resurrect an item completed after carryover', () => {
		const source = { date: '2026-07-20', noteId: 'nte_0123456789abcdef01234567' };
		const current = '# Today\n\n## Carryover\n\n- [x] Fix editor\n\n## Focus\n';
		expect(mergeDailyCarryover(current, [{ text: 'Fix editor', line: '- [ ] Fix editor' }], source)).toBe(current);
	});
});
