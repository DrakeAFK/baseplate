import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { readManagedMarkdown, writeManagedMarkdown } from './files';

const tempDir = path.join(process.cwd(), 'tmp-test-files');
const tempFile = path.join(tempDir, 'note.md');

afterEach(() => {
	fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('managed markdown files', () => {
	it('round trips frontmatter and body', () => {
		writeManagedMarkdown(
			tempFile,
			{
				id: 'nte_example',
				kind: 'note',
				project: 'quick-work',
				title: 'Example',
				created_at: '2026-03-16T00:00:00.000Z',
				updated_at: '2026-03-16T00:00:00.000Z'
			},
			'# Example\n\nHello world\n'
		);
		const parsed = readManagedMarkdown(tempFile);
		expect(parsed.data.title).toBe('Example');
		expect(parsed.body).toContain('Hello world');
	});
});
