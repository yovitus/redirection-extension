export function normalizeTriggerSite(value: string): string {
	const trimmed = (value || '').trim();
	if (!trimmed) return '';

	const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
	try {
		const parsed = new URL(withProtocol);
		return (parsed.hostname || '').toLowerCase().replace(/^www\./i, '');
	} catch (e) {
		return trimmed
			.toLowerCase()
			.replace(/^https?:\/\//i, '')
			.replace(/^www\./i, '')
			.replace(/\/+$/, '')
			.split('/')[0];
	}
}
