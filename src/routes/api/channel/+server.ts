import { json } from '@sveltejs/kit';
import {
	extractCredential,
	getChannelInfo,
	SubbitError,
	mapSubbitError,
	jsonError
} from '$lib/server/subbitProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const credential = extractCredential(request);
	if (!credential) {
		return jsonError(401, 'Unauthorized', 'Missing X-Credential header');
	}

	try {
		const info = await getChannelInfo(credential);
		return json(info);
	} catch (err) {
		if (err instanceof SubbitError) {
			const { status, error } = mapSubbitError(err.code);
			return jsonError(status, error, err.message);
		}
		console.error('[API /channel] Error:', err);
		return jsonError(500, 'InternalError', 'Failed to get channel info');
	}
};
