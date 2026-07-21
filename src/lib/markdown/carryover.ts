export interface ChecklistItem {
	text: string;
	line: string;
}

function normalizedItemText(value: string): string {
	return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

export function extractOpenChecklistItems(markdown: string): ChecklistItem[] {
	return extractChecklistItems(markdown, true);
}

export function extractChecklistItems(markdown: string, onlyOpen = false): ChecklistItem[] {
	const seen = new Set<string>();
	const items: ChecklistItem[] = [];

	for (const line of markdown.split('\n')) {
		const match = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.+?)\s*$/);
		if (!match) continue;
		if (onlyOpen && match[1].toLocaleLowerCase() === 'x') continue;
		const text = match[2].trim();
		const key = normalizedItemText(text);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		items.push({ text, line: `- [ ] ${text}` });
	}

	return items;
}

export function extractCarryoverItems(markdown: string): ChecklistItem[] {
	const lines = markdown.split('\n');
	const start = lines.findIndex((line) => /^##\s+Carryover\s*$/i.test(line.trim()));
	if (start < 0) return [];
	const endOffset = lines.slice(start + 1).findIndex((line) => /^##\s+/.test(line.trim()));
	const end = endOffset < 0 ? lines.length : start + 1 + endOffset;
	return extractChecklistItems(lines.slice(start + 1, end).join('\n'));
}

export function mergeDailyCarryover(
	markdown: string,
	items: ChecklistItem[],
	source: { date: string; noteId: string }
): string {
	if (!items.length) return markdown;

	const existing = new Set(extractChecklistItems(markdown).map((item) => normalizedItemText(item.text)));
	const additions = items.filter((item) => !existing.has(normalizedItemText(item.text)));
	if (!additions.length) return markdown;

	const lines = markdown.trimEnd().split('\n');
	const carryoverHeading = lines.findIndex((line) => /^##\s+Carryover\s*$/i.test(line.trim()));

	if (carryoverHeading >= 0) {
		const nextHeadingOffset = lines.slice(carryoverHeading + 1).findIndex((line) => /^##\s+/.test(line.trim()));
		const insertAt = nextHeadingOffset < 0 ? lines.length : carryoverHeading + 1 + nextHeadingOffset;
		lines.splice(insertAt, 0, ...additions.map((item) => item.line), '');
		return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
	}

	const firstSection = lines.findIndex((line, index) => index > 0 && /^##\s+/.test(line.trim()));
	const insertAt = firstSection < 0 ? lines.length : firstSection;
	const block = [
		'## Carryover',
		'',
		`> From [[note/${source.noteId}|${source.date}]]. Keep what still matters; delete the rest.`,
		'',
		...additions.map((item) => item.line),
		''
	];
	lines.splice(insertAt, 0, ...block);
	return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}
