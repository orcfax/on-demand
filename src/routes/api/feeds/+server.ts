import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { FeedsResponseSchema } from '$lib/odapi/types';
import { jsonError } from '$lib/server/subbitProxy';

export async function GET() {
	try {
		const res = await fetch(`${env.PRIVATE_ODAPI_VALIDATOR_URL}/feeds`, {
			method: 'GET',
			headers: { accept: 'application/json' }
		});

		if (!res.ok) {
			return jsonError(502, 'UpstreamError', `Validator returned ${res.status}`);
		}

		const feeds = FeedsResponseSchema.parse(await res.json());
		return json(feeds);
	} catch (err) {
		console.error('[API /feeds] Error:', err);
		return jsonError(500, 'InternalError', 'Failed to fetch feeds');
	}
}
