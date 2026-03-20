import { command } from '$app/server';
import { env } from '$env/dynamic/private';
import { z } from 'zod';
import { error } from '@sveltejs/kit';
import { extractErrorMessage } from '$lib/errors';
import { tagSchema } from '../tagSchema';
import type { BuildOpenTxResult } from '../types';

const subbitManUrl = () => env.PRIVATE_SUBBIT_MAN_URL || 'http://localhost:7822';

/**
 * Build an "Open" transaction to create a new channel.
 * Proxies to subbit-man-js POST /l1/build-open.
 */
export const buildOpenTx = command(
	z.object({
		tag: tagSchema,
		amount: z.string(),
		iouKey: z.string(),
		consumerKeyHash: z.string(),
		walletUtxos: z.array(z.any()),
		changeAddress: z.string()
	}),
	async (args): Promise<BuildOpenTxResult> => {
		const response = await fetch(`${subbitManUrl()}/l1/build-open`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(args)
		});

		if (!response.ok) {
			const msg = await extractErrorMessage(response);
			throw error(response.status, msg);
		}

		return await response.json();
	}
);
