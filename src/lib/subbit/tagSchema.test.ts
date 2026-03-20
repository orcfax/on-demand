import { describe, it, expect } from 'vitest';
import { validateTag, getTagByteLength, TAG_MIN_BYTES, TAG_MAX_BYTES } from './tagSchema';

describe('getTagByteLength', () => {
	it('returns byte length for ASCII', () => {
		expect(getTagByteLength('abc')).toBe(3);
	});

	it('returns byte length for multi-byte unicode', () => {
		// '€' is 3 bytes in UTF-8
		expect(getTagByteLength('€')).toBe(3);
	});

	it('returns 0 for empty string', () => {
		expect(getTagByteLength('')).toBe(0);
	});
});

describe('validateTag', () => {
	it('accepts valid tag', () => {
		const result = validateTag('ADA-USD');
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe('ADA-USD');
	});

	it('trims whitespace', () => {
		const result = validateTag('  abc  ');
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).toBe('abc');
	});

	it('rejects tag shorter than minimum', () => {
		const result = validateTag('ab'); // 2 bytes
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain(`${TAG_MIN_BYTES}`);
	});

	it('rejects tag longer than maximum', () => {
		const result = validateTag('a'.repeat(21));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain(`${TAG_MAX_BYTES}`);
	});

	it('rejects control characters', () => {
		const result = validateTag('abc\x00def');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain('invalid');
	});

	it('rejects zero-width spaces', () => {
		const result = validateTag('abc\u200Bdef');
		expect(result.ok).toBe(false);
	});

	it('accepts tag at exact minimum bytes', () => {
		const result = validateTag('abc'); // 3 bytes
		expect(result.ok).toBe(true);
	});

	it('accepts tag at exact maximum bytes', () => {
		const result = validateTag('a'.repeat(20)); // 20 bytes
		expect(result.ok).toBe(true);
	});
});
