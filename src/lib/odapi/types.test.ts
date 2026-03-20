import { describe, it, expect } from 'vitest';
import {
	FeedIdSchema,
	FeedsResponseSchema,
	SubbitPriceValueSchema,
	SubbitPriceEntrySchema,
	GetSubbitPricesResponseSchema,
	PublishOptionsSchema,
	StoredPriceUpdateSchema
} from './types';

describe('FeedIdSchema', () => {
	it('accepts valid feed IDs', () => {
		expect(FeedIdSchema.safeParse('ADA-USD').success).toBe(true);
		expect(FeedIdSchema.safeParse('CER/ADA-USD/3').success).toBe(true);
		expect(FeedIdSchema.safeParse('BTC_ETH').success).toBe(true);
	});

	it('rejects invalid characters', () => {
		expect(FeedIdSchema.safeParse('ADA USD').success).toBe(false); // space
		expect(FeedIdSchema.safeParse('ADA@USD').success).toBe(false); // @
		expect(FeedIdSchema.safeParse('').success).toBe(false); // empty
	});

	it('trims whitespace before validating', () => {
		expect(FeedIdSchema.safeParse('  ADA-USD  ').success).toBe(true);
	});
});

describe('FeedsResponseSchema', () => {
	it('accepts array of feed IDs', () => {
		const result = FeedsResponseSchema.safeParse(['ADA-USD', 'BTC-USD']);
		expect(result.success).toBe(true);
	});

	it('rejects non-array', () => {
		expect(FeedsResponseSchema.safeParse('ADA-USD').success).toBe(false);
	});
});

describe('SubbitPriceValueSchema', () => {
	it('accepts valid price value', () => {
		const result = SubbitPriceValueSchema.safeParse({ value: '0.60', timestamp: 1761938238 });
		expect(result.success).toBe(true);
	});

	it('rejects missing fields', () => {
		expect(SubbitPriceValueSchema.safeParse({ value: '0.60' }).success).toBe(false);
		expect(SubbitPriceValueSchema.safeParse({ timestamp: 123 }).success).toBe(false);
	});
});

describe('GetSubbitPricesResponseSchema', () => {
	it('accepts valid prices response', () => {
		const result = GetSubbitPricesResponseSchema.safeParse({
			status: 'ok',
			invalid: [],
			manifest: ['ADA-USD'],
			prices: [{ 'ADA-USD': { value: '0.60', timestamp: 1761938238 } }]
		});
		expect(result.success).toBe(true);
	});

	it('rejects wrong status', () => {
		const result = GetSubbitPricesResponseSchema.safeParse({
			status: 'error',
			invalid: [],
			manifest: [],
			prices: []
		});
		expect(result.success).toBe(false);
	});
});

describe('PublishOptionsSchema', () => {
	it('accepts feedIds as string', () => {
		const result = PublishOptionsSchema.safeParse({ feedIds: 'ADA-USD' });
		expect(result.success).toBe(true);
	});

	it('accepts feedIds as array', () => {
		const result = PublishOptionsSchema.safeParse({ feedIds: ['ADA-USD', 'BTC-USD'] });
		expect(result.success).toBe(true);
	});

	it('accepts allFeeds=true without feedIds', () => {
		const result = PublishOptionsSchema.safeParse({ allFeeds: true });
		expect(result.success).toBe(true);
	});

	it('rejects when neither feedIds nor allFeeds', () => {
		const result = PublishOptionsSchema.safeParse({});
		expect(result.success).toBe(false);
	});

	it('rejects empty feedIds without allFeeds', () => {
		const result = PublishOptionsSchema.safeParse({ feedIds: [] });
		expect(result.success).toBe(false);
	});
});

describe('StoredPriceUpdateSchema', () => {
	it('accepts valid stored price update', () => {
		const result = StoredPriceUpdateSchema.safeParse({
			channelTag: 'test-tag',
			feedId: 'ADA-USD',
			value: '0.60',
			timestamp: 1761938238,
			updatedAt: '2026-03-20T12:00:00Z'
		});
		expect(result.success).toBe(true);
	});

	it('accepts optional fields', () => {
		const result = StoredPriceUpdateSchema.safeParse({
			id: 1,
			channelTag: 'test-tag',
			feedId: 'ADA-USD',
			value: '0.60',
			timestamp: 1761938238,
			updatedAt: '2026-03-20T12:00:00Z',
			published: true,
			txId: 'abc123',
			archiveId: 'archive-1'
		});
		expect(result.success).toBe(true);
	});

	it('rejects empty channelTag', () => {
		const result = StoredPriceUpdateSchema.safeParse({
			channelTag: '',
			feedId: 'ADA-USD',
			value: '0.60',
			timestamp: 1761938238,
			updatedAt: '2026-03-20T12:00:00Z'
		});
		expect(result.success).toBe(false);
	});
});
