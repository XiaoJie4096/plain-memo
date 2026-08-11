export interface MobileTagHistoryPopResult<T> {
	entries: T[];
	value: T | null;
}

/** Appends one tag state while retaining only the most recent history entries. */
export function pushMobileTagHistory<T>(entries: readonly T[], value: T, limit = 2): T[] {
	return [...entries, value].slice(-Math.max(0, limit));
}

/** Removes and returns the most recent tag state without mutating the source history. */
export function popMobileTagHistory<T>(entries: readonly T[]): MobileTagHistoryPopResult<T> {
	if (entries.length === 0) {
		return { entries: [], value: null };
	}
	return {
		entries: entries.slice(0, -1),
		value: entries[entries.length - 1] ?? null,
	};
}
