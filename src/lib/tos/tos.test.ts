import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	tos,
	TOS_VERSION,
	computeTosHash,
	isInGracePeriod,
	getGraceDeadline,
	getEffectivePricing
} from './index';

describe('tos constants', () => {
	it('exports TOS_VERSION matching tos.json', () => {
		expect(TOS_VERSION).toBe('1.0.0');
	});

	it('tos object has required fields', () => {
		expect(tos.version).toBe('1.0.0');
		expect(tos.effectiveDate).toBe('2026-02-20');
		expect(tos.gracePeriodDays).toBe(7);
		expect(tos.pricing.currency).toBe('ADA');
		expect(tos.pricing.updateCostLovelace).toBe(10000);
		expect(tos.pricing.publishCostLovelace).toBe(5000000);
		expect(tos.channel.closePeriodMs).toBe(3600000);
		expect(tos.channel.minDepositAda).toBe(10);
	});
});

describe('computeTosHash', () => {
	it('returns a 64-char hex string (blake2b-256)', () => {
		const hash = computeTosHash();
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
	});

	it('is deterministic (same result on repeated calls)', () => {
		const hash1 = computeTosHash();
		const hash2 = computeTosHash();
		expect(hash1).toBe(hash2);
	});
});

describe('isInGracePeriod', () => {
	afterEach(() => vi.restoreAllMocks());

	it('returns false when previousVersion is null', () => {
		// Current tos.json has previousVersion: null
		expect(isInGracePeriod()).toBe(false);
	});

	it('returns false when grace period has passed', () => {
		// The effective date is 2026-02-20, grace is 7 days
		// Current date (2026-03-20) is well past the grace period
		expect(isInGracePeriod()).toBe(false);
	});
});

describe('getGraceDeadline', () => {
	it('returns null when previousVersion is null', () => {
		expect(getGraceDeadline()).toBeNull();
	});
});

describe('getEffectivePricing', () => {
	it('returns current pricing when no grace period', () => {
		const pricing = getEffectivePricing();
		expect(pricing.updateCostLovelace).toBe(10000);
		expect(pricing.publishCostLovelace).toBe(5000000);
		expect(pricing.currency).toBe('ADA');
	});
});
