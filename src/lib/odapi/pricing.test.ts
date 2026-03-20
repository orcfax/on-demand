import { describe, it, expect } from 'vitest';
import {
	PRICE_REQUEST_COST,
	PUBLISH_REQUEST_COST,
	CHANNEL_RESERVE,
	CHANNEL_RESERVE_ADA,
	CHANNEL_INIT_COST,
	CHANNEL_INIT_COST_ADA,
	EST_NETWORK_FEE_ADA,
	PRICE_REQUEST_COST_ADA,
	PUBLISH_REQUEST_COST_ADA
} from './pricing';

describe('pricing constants', () => {
	it('PRICE_REQUEST_COST is a positive bigint', () => {
		expect(typeof PRICE_REQUEST_COST).toBe('bigint');
		expect(PRICE_REQUEST_COST).toBeGreaterThan(0n);
	});

	it('PUBLISH_REQUEST_COST is a positive bigint', () => {
		expect(typeof PUBLISH_REQUEST_COST).toBe('bigint');
		expect(PUBLISH_REQUEST_COST).toBeGreaterThan(0n);
	});

	it('CHANNEL_RESERVE is 2 ADA in lovelace', () => {
		expect(CHANNEL_RESERVE).toBe(2_000_000n);
	});

	it('CHANNEL_RESERVE_ADA matches CHANNEL_RESERVE', () => {
		expect(CHANNEL_RESERVE_ADA * 1_000_000).toBe(Number(CHANNEL_RESERVE));
	});

	it('CHANNEL_INIT_COST is 0.001 ADA in lovelace', () => {
		expect(CHANNEL_INIT_COST).toBe(1_000n);
	});

	it('CHANNEL_INIT_COST_ADA matches CHANNEL_INIT_COST', () => {
		expect(CHANNEL_INIT_COST_ADA * 1_000_000).toBe(Number(CHANNEL_INIT_COST));
	});

	it('EST_NETWORK_FEE_ADA is a reasonable estimate', () => {
		expect(EST_NETWORK_FEE_ADA).toBeGreaterThan(0);
		expect(EST_NETWORK_FEE_ADA).toBeLessThan(1); // should be less than 1 ADA
	});

	it('PRICE_REQUEST_COST_ADA matches PRICE_REQUEST_COST in lovelace', () => {
		expect(PRICE_REQUEST_COST_ADA).toBe(Number(PRICE_REQUEST_COST) / 1_000_000);
	});

	it('PUBLISH_REQUEST_COST_ADA matches PUBLISH_REQUEST_COST in lovelace', () => {
		expect(PUBLISH_REQUEST_COST_ADA).toBe(Number(PUBLISH_REQUEST_COST) / 1_000_000);
	});

	it('publish cost >= price request cost', () => {
		expect(PUBLISH_REQUEST_COST).toBeGreaterThanOrEqual(PRICE_REQUEST_COST);
	});
});
