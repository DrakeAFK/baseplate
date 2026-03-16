import slugify from 'slugify';

export function toSlug(value: string): string {
	return slugify(value, { lower: true, strict: true, trim: true }) || 'untitled';
}

export function uniqueSlug(baseValue: string, existing: Set<string>): string {
	const base = toSlug(baseValue);
	if (!existing.has(base)) {
		return base;
	}

	let counter = 2;
	while (existing.has(`${base}-${counter}`)) {
		counter += 1;
	}

	return `${base}-${counter}`;
}
