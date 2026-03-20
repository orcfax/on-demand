import { query } from '$app/server';
import { error } from '@sveltejs/kit';
import { extractErrorMessage } from '$lib/errors';
import { FeedsResponseSchema } from './types';
import { env } from '$env/dynamic/private';

/**
 * GET /feeds
 * Fetches the list of available feed IDs from the configured Orcfax Validator Node.
 *
 * Returns:
 * - string[] of feed IDs (e.g. ["ADA-USD", "ADA-DJED", ...])
 */
export const getFeeds = query(async () => {
	const res = await fetch(`${env.PRIVATE_ODAPI_VALIDATOR_URL}/feeds`, {
		method: 'GET',
		headers: {
			accept: 'application/json'
		}
	});

	if (!res.ok) {
		throw error(res.status, await extractErrorMessage(res));
	}

	return FeedsResponseSchema.parse(await res.json());
});
