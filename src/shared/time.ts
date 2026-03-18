export function getNextLocalMidnight(nowMs: number): number {
	const next = new Date(nowMs);
	next.setHours(24, 0, 0, 0);
	return next.getTime();
}
