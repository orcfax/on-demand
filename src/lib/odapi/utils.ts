import { error } from '@sveltejs/kit';

/**
 * Normalizes incoming feed_id input into a string[] or null.
 * Accepts: string | string[] | null | undefined
 * - Trims whitespace and filters out empty strings
 * - Performs a lenient validation of feed ID characters
 */
export function normalizeFeedIds(input: string | string[] | null | undefined): string[] | null {
	if (input == null) return null;

	const toArray = Array.isArray(input) ? input : [input];

	const FEED_ID_RE = /^[A-Za-z0-9/_-]+$/; // e.g. ADA-USD, CER/ADA-USD/3

	const normalized = toArray
		.map((s) => (typeof s === 'string' ? s.trim() : ''))
		.filter((s) => s.length > 0);

	if (normalized.length === 0) return null;

	// Validate each id (be permissive but reject obviously invalid input)
	for (const id of normalized) {
		if (!FEED_ID_RE.test(id)) {
			error(400, `Invalid feed_id: ${id}`);
		}
	}

	return normalized;
}

/**
 * Extract the user-facing feed ID from a publish datum entry.
 * Handles CER-prefixed formats like "CER/ADA-USD/3" -> "ADA-USD"
 */
export function extractFeedIdFromDatum(feedId: string): string | null {
	const feedIdParts = feedId.split('/');
	if (feedIdParts.length === 3) {
		return feedIdParts[1];
	}
	return feedId;
}

/**
 * Convert a publish datum's numerator/denominator to a price value.
 * @param numerator - The numerator of the price ratio
 * @param denominator - The denominator of the price ratio
 * @param createdAt - Unix timestamp in milliseconds
 * @returns Object with value as string and timestamp in seconds
 */
export function datumToPrice(
	numerator: number,
	denominator: number,
	createdAt: number
): { value: string; timestamp: number } {
	const value = denominator ? (numerator / denominator).toString() : '0';
	const timestamp = Math.floor(createdAt / 1000);
	return { value, timestamp };
}

/**
 * Format a Unix timestamp (seconds) for display.
 */
export function formatTimestamp(timestamp: number): string {
	return new Date(timestamp * 1000).toLocaleString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}
