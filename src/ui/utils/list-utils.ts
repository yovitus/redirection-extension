/**
 * Shared list helpers for popup + background.
 */

// Normalize stored list entries into plain trimmed strings.
export function normalizeStoredList(value: any): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((entry: any) => {
			if (typeof entry === 'string') return entry.trim();
			if (entry && typeof entry.match === 'string') return entry.match.trim();
			if (entry && typeof entry.url === 'string') return entry.url.trim();
			if (entry && typeof entry.open === 'string') return entry.open.trim();
			return '';
		})
		.filter(Boolean);
}
