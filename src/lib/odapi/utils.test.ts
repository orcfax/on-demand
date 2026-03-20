import { describe, it, expect } from 'vitest';
import { normalizeFeedIds, extractFeedIdFromDatum, datumToPrice, formatTimestamp } from './utils';

describe('normalizeFeedIds', () => {
	it('returns null for null', () => {
		expect(normalizeFeedIds(null)).toBeNull();
	});

	it('returns null for undefined', () => {
		expect(normalizeFeedIds(undefined)).toBeNull();
	});

	it('wraps a single string in an array', () => {
		expect(normalizeFeedIds('ADA-USD')).toEqual(['ADA-USD']);
	});

	it('passes through a valid array', () => {
		expect(normalizeFeedIds(['ADA-USD', 'BTC-USD'])).toEqual(['ADA-USD', 'BTC-USD']);
	});

	it('trims whitespace', () => {
		expect(normalizeFeedIds('  ADA-USD  ')).toEqual(['ADA-USD']);
	});

	it('filters empty strings', () => {
		expect(normalizeFeedIds(['', 'ADA-USD', ''])).toEqual(['ADA-USD']);
	});

	it('returns null for array of empty strings', () => {
		expect(normalizeFeedIds(['', '  '])).toBeNull();
	});

	it('throws on invalid characters', () => {
		expect(() => normalizeFeedIds('ADA USD')).toThrow();
	});

	it('accepts feed IDs with slashes and dashes', () => {
		expect(normalizeFeedIds('CER/ADA-USD/3')).toEqual(['CER/ADA-USD/3']);
	});
});

describe('extractFeedIdFromDatum', () => {
	it('extracts feed ID from CER-prefixed format', () => {
		expect(extractFeedIdFromDatum('CER/ADA-USD/3')).toBe('ADA-USD');
	});

	it('extracts from different CER formats', () => {
		expect(extractFeedIdFromDatum('CER/BTC-USD/1')).toBe('BTC-USD');
	});

	it('returns the input as-is for non-CER format', () => {
		expect(extractFeedIdFromDatum('ADA-USD')).toBe('ADA-USD');
	});

	it('returns the input for two-part paths', () => {
		expect(extractFeedIdFromDatum('FOO/BAR')).toBe('FOO/BAR');
	});

	it('handles more than 3 parts by returning input', () => {
		expect(extractFeedIdFromDatum('A/B/C/D')).toBe('A/B/C/D');
	});
});

describe('datumToPrice', () => {
	it('computes value as numerator/denominator', () => {
		const result = datumToPrice(150, 100, 1700000000000);
		expect(result.value).toBe('1.5');
	});

	it('converts millisecond timestamp to seconds', () => {
		const result = datumToPrice(1, 1, 1700000000000);
		expect(result.timestamp).toBe(1700000000);
	});

	it('returns "0" when denominator is zero', () => {
		const result = datumToPrice(100, 0, 1000);
		expect(result.value).toBe('0');
	});

	it('handles integer division', () => {
		const result = datumToPrice(10, 3, 1000);
		expect(Number(result.value)).toBeCloseTo(3.333, 2);
	});

	it('floors the timestamp conversion', () => {
		const result = datumToPrice(1, 1, 1500);
		expect(result.timestamp).toBe(1);
	});
});

describe('formatTimestamp', () => {
	it('formats a Unix timestamp in seconds to a human-readable string', () => {
		const result = formatTimestamp(1704067200);
		// Should match the en-US locale format: "Mon DD, YYYY, HH:MM AM/PM"
		expect(result).toMatch(/\w+ \d{1,2}, \d{4}, \d{1,2}:\d{2}\s?(AM|PM)/);
	});

	it('matches the expected Date conversion', () => {
		const ts = 1704067200;
		const expected = new Date(ts * 1000).toLocaleString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
		expect(formatTimestamp(ts)).toBe(expected);
	});
});
