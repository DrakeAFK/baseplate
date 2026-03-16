export function nowIso(): string {
	return new Date().toISOString();
}

export function todayDate(): string {
	return new Date().toISOString().slice(0, 10);
}

export function yearFromDate(date: string): string {
	return date.slice(0, 4);
}

export function formatRelative(value: string): string {
	const target = new Date(value).getTime();
	const diff = Date.now() - target;
	const minute = 60_000;
	const hour = 60 * minute;
	const day = 24 * hour;

	if (diff < hour) {
		return `${Math.max(1, Math.round(diff / minute))}m ago`;
	}

	if (diff < day) {
		return `${Math.max(1, Math.round(diff / hour))}h ago`;
	}

	return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value));
}

export function formatDate(value: string): string {
	return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
		new Date(value)
	);
}
