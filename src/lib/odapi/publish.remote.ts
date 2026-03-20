import { command } from '$app/server';
import { error } from '@sveltejs/kit';
import { extractErrorMessage } from '$lib/errors';
import { normalizeFeedIds } from './utils';
import {
	PublishOptionsSchema,
	PublishSubbitResponseSchema,
	type PublishOptions,
	type PublishSubbitResponse
} from './types';
import { env } from '$env/dynamic/private';
import { PUBLISH_REQUEST_COST } from './pricing';

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
 * POST /subbit/request
 * Triggers on-chain publication of current price(s) for one or more feeds
 * via the configured Orcfax Validator Node.
 *
 * Usage:
 * - publishPrices({ feedIds: 'ADA-USD' })
 * - publishPrices({ feedIds: ['ADA-USD', 'ADA-DJED'] })
 * - publishPrices({ allFeeds: true })
 * - publishPrices({ feedIds: 'ADA-USD', credential: 'base64url_encoded_credential' })
 */
export const publishPrices = command(
	PublishOptionsSchema,
	async (options: PublishOptions): Promise<PublishSubbitResponse> => {
		const ids = normalizeFeedIds(options?.feedIds);
		const allFeeds = options?.allFeeds === true;
		const credential = options?.credential;

		// 1. If credential provided, validate it with subbit-man-js FIRST
		//    This validates the credential and for IOUs, updates iouAmt
		if (credential) {
			console.log('[PUBLISH] Credential provided, validating with subbit-man-js...');
			try {
				await validateAndProcessCredential(credential);
				console.log('[PUBLISH] Credential validated, proceeding to publish data...');
			} catch (err) {
				console.error('[PUBLISH] Credential validation failed:', err);
				throw error(502, 'Payment validation failed. Please check your channel balance.');
			}
		}

		// 2. Now publish data to ODAPI validator
		const url = new URL(`${env.PRIVATE_ODAPI_VALIDATOR_URL}/subbit/request`);

		if (allFeeds) {
			url.searchParams.set('all_feeds', 'true');
		} else if (ids && ids.length > 0) {
			for (const id of ids) {
				url.searchParams.append('feed_id', id);
			}
		}

		console.log('[PUBLISH] Publishing data to ODAPI validator:', url.toString());

		const res = await fetch(url.toString(), {
			method: 'POST',
			headers: {
				accept: 'application/json'
			}
			// According to the API, parameters are query params; no request body is required
		});

		if (!res.ok) {
			throw error(res.status, await extractErrorMessage(res));
		}

		const result = PublishSubbitResponseSchema.parse(await res.json());
		console.log('[PUBLISH] Data published successfully');

		// 3. If credential provided, update the cost after successfully serving data
		//    This records the actual cost incurred for the service
		//    Publication costs more than just requesting data
		//    Note: updateCost will negate this value automatically (accounting convention)
		if (credential) {
			const serviceCost = PUBLISH_REQUEST_COST;
			console.log('[PUBLISH] Updating cost for service...');
			try {
				await updateCost(credential, serviceCost);
				console.log('[PUBLISH] Cost updated successfully');
			} catch (err) {
				console.error('[PUBLISH] Cost update failed:', err);
				// Note: We still return the data since it was already served
				// The cost update failure is logged but doesn't fail the request
			}
		}

		return result;
	}
);
