import { describe, it, expect } from 'vitest';
import {
	hexToBytes,
	bytesToHex,
	decomposeKeytag,
	composeKeytag,
	mapStage,
	getNextIouAmount,
	generateRandomTag,
	parseAdaToLovelace
} from './util';

describe('hexToBytes', () => {
	it('converts valid hex to bytes', () => {
		expect(hexToBytes('deadbeef')).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
	});

	it('handles 0x prefix', () => {
		expect(hexToBytes('0xab01')).toEqual(new Uint8Array([0xab, 0x01]));
	});

	it('handles uppercase hex', () => {
		expect(hexToBytes('AABB')).toEqual(new Uint8Array([0xaa, 0xbb]));
	});

	it('trims whitespace', () => {
		expect(hexToBytes('  ff00  ')).toEqual(new Uint8Array([0xff, 0x00]));
	});

	it('throws on odd-length hex', () => {
		expect(() => hexToBytes('abc')).toThrow('Invalid hex string');
	});

	it('throws on non-hex characters', () => {
		expect(() => hexToBytes('gggg')).toThrow('Invalid hex string');
	});

	it('throws on empty string', () => {
		expect(() => hexToBytes('')).toThrow('Invalid hex string');
	});
});

describe('bytesToHex', () => {
	it('converts bytes to lowercase hex', () => {
		expect(bytesToHex(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))).toBe('deadbeef');
	});

	it('pads single-digit bytes', () => {
		expect(bytesToHex(new Uint8Array([0x01, 0x00, 0x0f]))).toBe('01000f');
	});

	it('handles empty array', () => {
		expect(bytesToHex(new Uint8Array([]))).toBe('');
	});
});

describe('hexToBytes / bytesToHex roundtrip', () => {
	it('roundtrips correctly', () => {
		const hex = 'cafebabe01020304';
		expect(bytesToHex(hexToBytes(hex))).toBe(hex);
	});
});

describe('composeKeytag', () => {
	const validPubKey = 'a'.repeat(64); // 32 bytes in hex

	it('concatenates 32-byte public key hex with utf8-encoded tag', () => {
		const result = composeKeytag(validPubKey, 'test');
		// 32 bytes key + 4 bytes "test" = 36 bytes = 72 hex chars
		expect(result.length).toBe(72);
		expect(result.startsWith(validPubKey)).toBe(true);
	});

	it('throws on non-hex public key', () => {
		expect(() => composeKeytag('not-hex!', 'tag')).toThrow('valid hex string');
	});

	it('throws on wrong-length public key', () => {
		expect(() => composeKeytag('aabb', 'tag')).toThrow('32 bytes');
	});

	it('throws on tag too short', () => {
		expect(() => composeKeytag(validPubKey, 'ab')).toThrow(); // 2 bytes < TAG_MIN_BYTES (3)
	});

	it('throws on tag too long', () => {
		const longTag = 'a'.repeat(21); // 21 bytes > TAG_MAX_BYTES (20)
		expect(() => composeKeytag(validPubKey, longTag)).toThrow();
	});

	it('accepts tag at minimum length', () => {
		expect(() => composeKeytag(validPubKey, 'abc')).not.toThrow(); // 3 bytes = TAG_MIN_BYTES
	});

	it('accepts tag at maximum length', () => {
		const tag = 'a'.repeat(20); // 20 bytes = TAG_MAX_BYTES
		expect(() => composeKeytag(validPubKey, tag)).not.toThrow();
	});
});

describe('decomposeKeytag', () => {
	it('splits keytag into key and tag parts', () => {
		const validPubKey = 'a'.repeat(64);
		const keytag = composeKeytag(validPubKey, 'test');
		const { key, tag } = decomposeKeytag(keytag);
		// key is first 32 bytes, tag is the remainder
		expect(key).toBeTruthy();
		expect(tag).toBeTruthy();
	});
});

describe('mapStage', () => {
	it('maps "Opened" to "open"', () => {
		expect(mapStage('Opened')).toBe('open');
	});

	it('maps "Closed" to "closed"', () => {
		expect(mapStage('Closed')).toBe('closed');
	});

	it('maps "Settled" to "settled"', () => {
		expect(mapStage('Settled')).toBe('settled');
	});

	it('maps "Ended" to "ended"', () => {
		expect(mapStage('Ended')).toBe('ended');
	});

	it('maps "Suspended" to "closed" (DB convention)', () => {
		expect(mapStage('Suspended')).toBe('closed');
	});

	it('is case-insensitive', () => {
		expect(mapStage('OPENED')).toBe('open');
		expect(mapStage('closed')).toBe('closed');
		expect(mapStage('sEtTlEd')).toBe('settled');
	});

	it('matches partial strings containing the keyword', () => {
		expect(mapStage('ChannelOpened')).toBe('open');
		expect(mapStage('IsSuspended')).toBe('closed');
	});

	it('throws on unknown stage', () => {
		expect(() => mapStage('unknown')).toThrow('Invalid channel stage');
		expect(() => mapStage('')).toThrow('Invalid channel stage');
	});
});

describe('getNextIouAmount', () => {
	it('uses cost as baseline when cost > iouAmt', () => {
		expect(getNextIouAmount(100n, 50n, 10n)).toBe(110n);
	});

	it('uses iouAmt as baseline when iouAmt > cost', () => {
		expect(getNextIouAmount(50n, 100n, 10n)).toBe(110n);
	});

	it('uses either when cost === iouAmt', () => {
		expect(getNextIouAmount(100n, 100n, 25n)).toBe(125n);
	});

	it('works with zero requestCost', () => {
		expect(getNextIouAmount(100n, 50n, 0n)).toBe(100n);
	});

	it('works with all zeros', () => {
		expect(getNextIouAmount(0n, 0n, 0n)).toBe(0n);
	});

	it('handles large values', () => {
		const large = BigInt('100000000000000');
		expect(getNextIouAmount(large, 0n, 1n)).toBe(large + 1n);
	});
});

describe('generateRandomTag', () => {
	it('returns a string of the requested length', () => {
		expect(generateRandomTag(10)).toHaveLength(10);
		expect(generateRandomTag(20)).toHaveLength(20);
	});

	it('defaults to length 20', () => {
		expect(generateRandomTag()).toHaveLength(20);
	});

	it('only contains alphanumeric characters', () => {
		const tag = generateRandomTag(100);
		expect(tag).toMatch(/^[a-zA-Z0-9]+$/);
	});

	it('generates different tags each time', () => {
		const tags = new Set(Array.from({ length: 10 }, () => generateRandomTag()));
		expect(tags.size).toBe(10);
	});
});

describe('parseAdaToLovelace', () => {
	it('converts whole ADA to lovelace', () => {
		expect(parseAdaToLovelace('5')).toBe('5000000');
	});

	it('converts fractional ADA with dot separator', () => {
		expect(parseAdaToLovelace('1.5')).toBe('1500000');
	});

	it('converts fractional ADA with comma separator', () => {
		expect(parseAdaToLovelace('1,5')).toBe('1500000');
	});

	it('handles small fractions', () => {
		expect(parseAdaToLovelace('0.000001')).toBe('1');
	});

	it('trims whitespace', () => {
		expect(parseAdaToLovelace('  10  ')).toBe('10000000');
	});

	it('throws on mixed separators', () => {
		expect(() => parseAdaToLovelace('1,000.50')).toThrow('Ambiguous ADA format');
	});

	it('throws on non-numeric input', () => {
		expect(() => parseAdaToLovelace('abc')).toThrow('Invalid ADA amount');
	});

	it('handles zero', () => {
		expect(parseAdaToLovelace('0')).toBe('0');
	});

	it('rounds sub-lovelace amounts', () => {
		// 0.0000005 ADA = 0.5 lovelace, rounds to 1
		expect(parseAdaToLovelace('0.0000005')).toBe('1');
	});
});
