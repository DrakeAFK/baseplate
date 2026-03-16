import { randomUUID } from 'node:crypto';

export function createId(prefix: 'prj' | 'tsk' | 'nte' | 'mtg' | 'dly' | 'lnk'): string {
	return `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
}
