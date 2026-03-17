export function nowIso(): string {
	return new Date().toISOString();
}

function pad(value: number): string {
	return String(value).padStart(2, '0');
}

function parseDateOnly(value: string): Date {
	const [year, month, day] = value.split('-').map(Number);
	return new Date(year, month - 1, day);
}

function isDateOnly(value: string): boolean {
	return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function todayDate(date = new Date()): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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

	const parsed = isDateOnly(value) ? parseDateOnly(value) : new Date(value);
	return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(parsed);
}

export function formatDate(value: string): string {
	const parsed = isDateOnly(value) ? parseDateOnly(value) : new Date(value);
	return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}
