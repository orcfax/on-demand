import { command } from '$app/server';
import { env } from '$env/dynamic/private';
import { z } from 'zod';
import { error } from '@sveltejs/kit';
import { extractErrorMessage } from '$lib/errors';
import { tagSchema } from '../tagSchema';
import type { BuildEndTxResult, BuildExpireTxResult } from '../types';

const subbitManUrl = () => env.PRIVATE_SUBBIT_MAN_URL || 'http://localhost:7822';

/**
 * Build an "End" transaction to reclaim funds after provider settlement.
 * Proxies to subbit-man-js POST /l1/build-end.
 */
export const buildEndTx = command(
	z.object({
		consumerKeyHash: z.string(),
		walletUtxos: z.array(z.any()),
		changeAddress: z.string()
	}),
	async (args): Promise<BuildEndTxResult> => {
		const response = await fetch(`${subbitManUrl()}/l1/build-end`, {
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

/**
 * Build an "Expire" transaction to reclaim all funds after deadline passed.
 * Proxies to subbit-man-js POST /l1/build-expire.
 */
export const buildExpireTx = command(
	z.object({
		tag: tagSchema,
		walletUtxos: z.array(z.any()),
		changeAddress: z.string()
	}),
	async (args): Promise<BuildExpireTxResult> => {
		const response = await fetch(`${subbitManUrl()}/l1/build-expire`, {
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
