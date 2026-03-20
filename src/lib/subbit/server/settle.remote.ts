import { command } from '$app/server';
import { env } from '$env/dynamic/private';
import { z } from 'zod';
import { getErrorMessage } from '$lib/errors';
import { tagSchema } from '../tagSchema';

const subbitManUrl = () => env.PRIVATE_SUBBIT_MAN_URL || 'http://localhost:7822';

/**
 * Trigger provider-side settlement of a closed channel.
 * Proxies to subbit-man-js POST /l1/settle-channel.
 * Returns result instead of throwing — caller uses fire-and-forget.
 */
export const settleChannel = command(
	z.object({ tag: tagSchema }),
	async (args): Promise<{ success: boolean; txHash?: string; error?: string }> => {
		try {
			const response = await fetch(`${subbitManUrl()}/l1/settle-channel`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(args)
			});

			const result = await response.json();
			return result;
		} catch (err) {
			const msg = getErrorMessage(err, 'Settle request failed');
			console.error('[settle] Fire-and-forget error:', msg);
			return { success: false, error: msg };
		}
	}
);
