import { query } from '$app/server';
import { error } from '@sveltejs/kit';
import { extractErrorMessage } from '$lib/errors';
import {
	GetSubbitPricesResponseSchema,
	FeedIdsArgSchema,
	type GetSubbitPricesResponse
} from './types';
import { normalizeFeedIds } from './utils';
import { env } from '$env/dynamic/private';
import { z } from 'zod';
import { PRICE_REQUEST_COST } from './pricing';

/**
 * Validates credential with subbit-man-js
 * For IOU credentials: automatically records the IOU and increases iouAmt
 * For Stamp/Fixed credentials: just validates
 * This MUST be called before serving data to ensure payment is processed
 */
async function validateAndProcessCredential(credential: string): Promise<void> {
	const subbitManUrl = env.PRIVATE_SUBBIT_MAN_URL ?? 'http://127.0.0.1:7822';

	// Use /l2/tot to validate credential
	// If it's an IOU, this automatically records it and increases iouAmt
	const url = new URL('/l2/tot', subbitManUrl);
	url.searchParams.set('cred', credential);

	console.log('[CREDENTIAL] Validating credential with subbit-man-js:', url.toString());

	const response = await fetch(url.toString(), {
		method: 'GET',
		headers: {
			accept: 'application/json'
		}
	});

	console.log('[CREDENTIAL] Validation response status:', response.status);

	if (!response.ok) {
		const msg = await extractErrorMessage(response);
		console.error('[CREDENTIAL] Validation failed:', response.status, msg);
		throw error(502, msg);
	}

	const tot = await response.text();
	console.log('[CREDENTIAL] Validated! Current tot (available balance):', tot);
}

/**
 * Updates the cost after serving data to record actual service cost
 * This MUST be called after successfully serving data
 *
 * ⚠️ CRITICAL: The 'by' parameter uses accounting convention:
 * - Negative values = charge the user (increase cost)
 * - Positive values = credit the user (decrease cost)
 */
async function updateCost(credential: string, cost: bigint): Promise<void> {
	const subbitManUrl = env.PRIVATE_SUBBIT_MAN_URL ?? 'http://127.0.0.1:7822';

	// Use PATCH /l2/mod to update the cost
	// IMPORTANT: Negate the cost to charge the user (accounting convention)
	const url = new URL('/l2/mod', subbitManUrl);
	url.searchParams.set('cred', credential);
	url.searchParams.set('by', (-cost).toString());

	console.log('[COST] Updating cost with subbit-man-js:', url.toString());

	const response = await fetch(url.toString(), {
		method: 'PATCH',
		headers: {
			accept: 'application/json'
		}
	});

	console.log('[COST] Update response status:', response.status);

	if (!response.ok) {
		const errorText = await response.text();
		console.error('[COST] Cost update failed:', response.status, errorText);
		throw new Error(`Cost update failed: ${response.status} - ${errorText}`);
	}

	const newTot = await response.text();
	console.log('[COST] Cost updated! New tot (available balance):', newTot);
}

/**
 * GET /subbit/request
 * Fetches current price(s) for one or more feeds from the configured Orcfax Validator Node.
 *
 * Input:
 * - feedIds: string | string[] | null | undefined
 *   - If null/undefined/empty, the request will be made without feed_id params
 *     (server may respond with validation error depending on configuration)
 * - credential: optional base64url-encoded credential for L2 authenticated requests
 *
 * Returns:
 * - The JSON response from the validator, typed as GetSubbitPricesResponse
 */
export const getPrices = query(
	z.union([
		FeedIdsArgSchema,
		z.object({
			feedIds: FeedIdsArgSchema,
			credential: z.string().optional()
		})
	]),
	async (input): Promise<GetSubbitPricesResponse> => {
		// Handle both old signature (just feedIds) and new signature (object with feedIds and credential)
		let feedIds: string | string[] | null | undefined;
		let credential: string | undefined;

		if (input && typeof input === 'object' && !Array.isArray(input) && 'feedIds' in input) {
			// New signature: { feedIds, credential }
			feedIds = input.feedIds;
			credential = input.credential;
		} else if (
			Array.isArray(input) ||
			typeof input === 'string' ||
			input === null ||
			input === undefined
		) {
			// Old signature: just feedIds (string, array, null, or undefined)
			feedIds = input;
			credential = undefined;
		} else {
			// Shouldn't happen due to Zod validation, but TypeScript needs this
			feedIds = undefined;
			credential = undefined;
		}

		const ids = normalizeFeedIds(feedIds);

		// 1. If credential provided, validate it with subbit-man-js FIRST
		//    This validates the credential and for IOUs, updates iouAmt
		if (credential) {
			console.log('[PRICES] Credential provided, validating with subbit-man-js...');
			try {
				await validateAndProcessCredential(credential);
				console.log('[PRICES] Credential validated, proceeding to fetch data...');
			} catch (err) {
				console.error('[PRICES] Credential validation failed:', err);
				throw error(502, 'Payment validation failed. Please check your channel balance.');
			}
		}

		// 2. Now fetch data from ODAPI validator (which is "dumb" and just serves data)
		const url = new URL(`${env.PRIVATE_ODAPI_VALIDATOR_URL}/subbit/request`);
		if (ids && ids.length > 0) {
			for (const id of ids) {
				url.searchParams.append('feed_id', id);
			}
		}

		console.log('[PRICES] Fetching data from ODAPI validator:', url.toString());

		const res = await fetch(url.toString(), {
			method: 'GET',
			headers: {
				accept: 'application/json'
			}
		});

		if (!res.ok) {
			throw error(res.status, await extractErrorMessage(res));
		}

		const result = GetSubbitPricesResponseSchema.parse(await res.json());
		console.log('[PRICES] Data fetched successfully');

		// 3. If credential provided, update the cost after successfully serving data
		//    This records the actual cost incurred for the service
		//    Note: updateCost will negate this value automatically (accounting convention)
		if (credential) {
			const serviceCost = PRICE_REQUEST_COST;
			console.log('[PRICES] Updating cost for service...');
			try {
				await updateCost(credential, serviceCost);
				console.log('[PRICES] Cost updated successfully');
			} catch (err) {
				console.error('[PRICES] Cost update failed:', err);
				// Note: We still return the data since it was already served
				// The cost update failure is logged but doesn't fail the request
			}
		}

		return result;
	}
);
