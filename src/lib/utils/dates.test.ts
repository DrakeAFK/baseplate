import { describe, expect, it } from 'vitest';
import { formatDate, todayDate } from './dates';

describe('date helpers', () => {
	it('formats local dates without timezone drift', () => {
		expect(formatDate('2026-03-17')).toBe('Mar 17, 2026');
	});

	it('uses the local calendar day for todayDate', () => {
		expect(todayDate(new Date(2026, 2, 17, 23, 45))).toBe('2026-03-17');
	});
});
