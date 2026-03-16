import { describe, expect, it } from 'vitest';
import { toSlug, uniqueSlug } from './slug';

describe('slug helpers', () => {
	it('creates deterministic slugs', () => {
		expect(toSlug('RequestBridge Direction')).toBe('requestbridge-direction');
	});

	it('avoids collisions', () => {
		expect(uniqueSlug('Quick Work', new Set(['quick-work']))).toBe('quick-work-2');
	});
});
