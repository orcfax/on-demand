import { z } from 'zod';

/**
 * Shared feed ID pattern — allows letters, numbers, '/', '_' and '-'
 * Examples:
 * - ADA-USD
 * - CER/ADA-USD/3
 */
export const FEED_ID_PATTERN = /^[A-Za-z0-9/_-]+$/;

export const FeedIdSchema = z.string().trim().min(1).regex(FEED_ID_PATTERN, {
	message: 'Invalid feed_id'
});
export type FeedId = z.infer<typeof FeedIdSchema>;

/////////////////
/// Feeds I/O ///
/////////////////

export const FeedsResponseSchema = z.array(FeedIdSchema);
export type FeedsResponse = z.infer<typeof FeedsResponseSchema>;

///////////////////
/// Prices I/O  ///
///////////////////

export const SubbitPriceValueSchema = z.object({
	value: z.string(),
	timestamp: z.number()
});
export type SubbitPriceValue = z.infer<typeof SubbitPriceValueSchema>;

/**
 * Dynamic map from FeedId to SubbitPriceValue, e.g.
 * { "ADA-USD": { value: "0.60", timestamp: 1761938238 } }
 */
export const SubbitPriceEntrySchema = z.record(FeedIdSchema, SubbitPriceValueSchema);
export type SubbitPriceEntry = z.infer<typeof SubbitPriceEntrySchema>;

export const GetSubbitPricesResponseSchema = z.object({
	status: z.literal('ok'),
	invalid: z.array(FeedIdSchema),
	manifest: z.array(FeedIdSchema),
	prices: z.array(SubbitPriceEntrySchema)
});
export type GetSubbitPricesResponse = z.infer<typeof GetSubbitPricesResponseSchema>;

/**
 * Input for getPrices(...) remote query:
 * Accepts a single string feed_id, an array of feed_ids, null, or undefined.
 */
export const FeedIdsArgSchema = z.union([FeedIdSchema, z.array(FeedIdSchema), z.null()]).optional();
export type FeedIdsArg = z.infer<typeof FeedIdsArgSchema>;

/**
 * A normalized representation you may use after preprocessing:
 * - Either a non-empty array of FeedId or null
 */
export const NormalizedFeedIdsSchema = z.union([z.array(FeedIdSchema).min(1), z.literal(null)]);
export type NormalizedFeedIds = z.infer<typeof NormalizedFeedIdsSchema>;

////////////////////
/// Publish I/O  ///
////////////////////

export const PublishDatumBodySchema = z.object({
	numerator: z.number(),
	denominator: z.number()
});
export type PublishDatumBody = z.infer<typeof PublishDatumBodySchema>;

export const PublishDatumSchema = z.object({
	tx_md: z.object({
		id: z.string(),
		src: z.string()
	}),
	datum: z.object({
		feed_id: FeedIdSchema,
		created_at: z.number(),
		body: PublishDatumBodySchema
	})
});
export type PublishDatum = z.infer<typeof PublishDatumSchema>;

export const PublishSubbitResponseSchema = z.object({
	status: z.literal('ok'),
	message: z.string(),
	invalid: z.array(FeedIdSchema),
	manifest: z.array(FeedIdSchema),
	unavailable: z.array(FeedIdSchema),
	datum: z.array(PublishDatumSchema)
});
export type PublishSubbitResponse = z.infer<typeof PublishSubbitResponseSchema>;

/**
 * Input for publishPrices(...) remote command:
 * - feedIds: string | string[] | null | undefined
 * - allFeeds: boolean | undefined
 * - credential: optional base64url-encoded credential for L2 authenticated requests
 * Constraint:
 * - You must specify feedIds (non-empty) OR set allFeeds = true
 */
export const PublishOptionsSchema = z
	.object({
		feedIds: z.union([FeedIdSchema, z.array(FeedIdSchema), z.null()]).optional(),
		allFeeds: z.boolean().optional(),
		credential: z.string().optional()
	})
	.refine(
		(opts) => {
			const all = opts.allFeeds === true;
			const ids = opts.feedIds;
			const hasIds =
				typeof ids === 'string' ? ids.length > 0 : Array.isArray(ids) ? ids.length > 0 : false;
			return all || hasIds;
		},
		{
			message: 'You must specify feedIds or set allFeeds=true',
			path: ['feedIds']
		}
	);
export type PublishOptions = z.infer<typeof PublishOptionsSchema>;

/**
 * FastAPI-style 422 error payloads (when applicable)
 * Note: Depending on the backend, you may receive just `{"detail":[...]}` or a bare array.
 * Keep this here for convenience if you want to parse 422 responses.
 */
export const ValidationErrorSchema = z.object({
	loc: z.array(z.union([z.string(), z.number()])),
	msg: z.string(),
	type: z.string()
});
export type ValidationError = z.infer<typeof ValidationErrorSchema>;

export const HTTPValidationErrorSchema = z.object({
	detail: z.array(ValidationErrorSchema)
});
export type HTTPValidationError = z.infer<typeof HTTPValidationErrorSchema>;

/////////////////////////////
/// Stored Price Updates  ///
/////////////////////////////

export const StoredPriceUpdateSchema = z.object({
	id: z.number().optional(),
	channelTag: z.string().min(1),
	feedId: z.string().min(1),
	value: z.string(),
	timestamp: z.number(),
	updatedAt: z.string(),
	published: z.boolean().optional(),
	txId: z.string().optional(),
	archiveId: z.string().optional()
});
export type StoredPriceUpdateZ = z.infer<typeof StoredPriceUpdateSchema>;

export const StoredPriceUpdateExportSchema = z.array(StoredPriceUpdateSchema).min(1);
export type StoredPriceUpdateExport = z.infer<typeof StoredPriceUpdateExportSchema>;
