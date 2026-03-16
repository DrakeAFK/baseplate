import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import type { NoteKind } from '$lib/types/models';

export interface ManagedFrontmatter {
	id: string;
	kind: NoteKind;
	title: string;
	project?: string;
	meeting_date?: string;
	note_date?: string;
	created_at: string;
	updated_at: string;
}

export function ensureDir(filePath: string): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function writeManagedMarkdown(filePath: string, frontmatter: ManagedFrontmatter, body: string): void {
	ensureDir(filePath);
	const sanitizedFrontmatter = Object.fromEntries(
		Object.entries(frontmatter).filter(([, value]) => value !== undefined)
	);
	const content = matter.stringify(body.trimEnd() ? `${body.trimEnd()}\n` : '', sanitizedFrontmatter);
	fs.writeFileSync(filePath, content, 'utf8');
}

export function readManagedMarkdown(filePath: string): { data: ManagedFrontmatter; body: string } {
	const raw = fs.readFileSync(filePath, 'utf8');
	const parsed = matter(raw);
	return {
		data: parsed.data as ManagedFrontmatter,
		body: parsed.content
	};
}

export function fileExists(filePath: string): boolean {
	return fs.existsSync(filePath);
}
