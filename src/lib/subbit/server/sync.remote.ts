import { command } from '$app/server';
import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import { extractErrorMessage } from '$lib/errors';

const subbitManUrl = () => env.PRIVATE_SUBBIT_MAN_URL || 'http://localhost:7822';

/**
 * Sync channels from L1 with subbit-man-js.
 * Proxies to subbit-man-js POST /l1/sync-from-chain.
 */
export const syncChannels = command(async () => {
	const response = await fetch(`${subbitManUrl()}/l1/sync-from-chain`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({})
	});

	if (!response.ok) {
		const msg = await extractErrorMessage(response);
		throw error(response.status, msg);
	}

	return await response.json();
});
