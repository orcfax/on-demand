import { command } from '$app/server';
import { env } from '$env/dynamic/private';
import { z } from 'zod';
import { error } from '@sveltejs/kit';
import { extractErrorMessage } from '$lib/errors';
import { tagSchema } from '../tagSchema';
import type { BuildCloseTxResult } from '../types';

const subbitManUrl = () => env.PRIVATE_SUBBIT_MAN_URL || 'http://localhost:7822';

/**
 * Build a "Close" transaction to close an open channel.
 * Proxies to subbit-man-js POST /l1/build-close.
 */
export const buildCloseTx = command(
	z.object({
		tag: tagSchema,
		walletUtxos: z.array(z.any()),
		changeAddress: z.string()
	}),
	async (args): Promise<BuildCloseTxResult> => {
		const response = await fetch(`${subbitManUrl()}/l1/build-close`, {
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
