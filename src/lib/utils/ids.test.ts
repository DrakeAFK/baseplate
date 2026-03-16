import { describe, expect, it } from 'vitest';
import { createId } from './ids';

describe('id helper', () => {
	it('uses stable prefixes', () => {
		expect(createId('prj')).toMatch(/^prj_[a-f0-9]{24}$/);
	});
});
