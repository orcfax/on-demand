import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { GetSubbitPricesResponseSchema } from '$lib/odapi/types';
import { normalizeFeedIds } from '$lib/odapi/utils';
import { PRICE_REQUEST_COST } from '$lib/odapi/pricing';
import {
	extractCredential,
	validateCredential,
	chargeCost,
	SubbitError,
	mapSubbitError,
	requireTosAcceptance,
	tosHeaders,
	jsonError
} from '$lib/server/subbitProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const credential = extractCredential(request);
	if (!credential) {
		return jsonError(401, 'Unauthorized', 'Missing X-Credential header');
	}

	const tosResponse = requireTosAcceptance(request);
	if (tosResponse) return tosResponse;

	const feedIdParams = url.searchParams.getAll('feed_id');
	const ids = normalizeFeedIds(feedIdParams.length > 0 ? feedIdParams : null);

	try {
		await validateCredential(credential);
	} catch (err) {
		if (err instanceof SubbitError) {
			const { status, error } = mapSubbitError(err.code);
			return jsonError(status, error, err.message, tosHeaders());
		}
		return jsonError(500, 'InternalError', 'Credential validation failed', tosHeaders());
	}

	try {
		const fetchUrl = new URL(`${env.PRIVATE_ODAPI_VALIDATOR_URL}/subbit/request`);
		if (ids && ids.length > 0) {
			for (const id of ids) {
				fetchUrl.searchParams.append('feed_id', id);
			}
		}

		const res = await fetch(fetchUrl.toString(), {
			method: 'GET',
			headers: { accept: 'application/json' }
		});

		if (!res.ok) {
			return jsonError(502, 'UpstreamError', `Validator returned ${res.status}`, tosHeaders());
		}

		const result = GetSubbitPricesResponseSchema.parse(await res.json());

		chargeCost(credential, PRICE_REQUEST_COST).catch((err) => {
			console.error('[API /prices] Cost update failed (non-blocking):', err);
		});

		return json(result, { headers: tosHeaders() });
	} catch (err) {
		console.error('[API /prices] Error:', err);
		return jsonError(500, 'InternalError', 'Failed to fetch prices', tosHeaders());
	}
};
