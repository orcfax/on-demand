import { query } from '$app/server';
import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import { extractErrorMessage } from '$lib/errors';
import {
	CredentialB64Schema,
	InfoResSchema,
	type InfoRes,
	type OnChainStateResult
} from '../types';
import { z } from 'zod';
import { tagSchema } from '../tagSchema';

const subbitManUrl = () => env.PRIVATE_SUBBIT_MAN_URL || 'http://localhost:7822';

/**
 * GET /l2/info?cred=...
 * Gets the current channel state from the server for the given credential.
 * Already proxied to subbit-man-js — unchanged.
 */
export const getCurrentChannelState = query(
	CredentialB64Schema,
	async (credB64: string): Promise<InfoRes> => {
		const response = await fetch(`${subbitManUrl()}/l2/info?cred=${encodeURIComponent(credB64)}`, {
			method: 'GET',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json'
			}
		});

		if (!response.ok) {
			const msg = await extractErrorMessage(response);
			throw error(response.status, msg);
		}

		const json = await response.json();
		return InfoResSchema.parse(json);
	}
);

/**
 * Query on-chain state directly (L1), bypassing LevelDB.
 * Proxies to subbit-man-js POST /l1/channel-on-chain-state.
 */
export const getChannelOnChainState = query(
	z.object({ tag: tagSchema, consumerKeyHash: z.string() }),
	async (args): Promise<OnChainStateResult> => {
		const response = await fetch(`${subbitManUrl()}/l1/channel-on-chain-state`, {
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
 * Query to fetch UTxOs from a transaction by its hash.
 * Proxies to subbit-man-js POST /l1/utxos.
 */
export const getTxUtxos = query(z.string().min(1), async (txHash: string): Promise<any[]> => {
	const response = await fetch(`${subbitManUrl()}/l1/utxos`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ outRefs: [{ txHash, outputIndex: 0 }] })
	});

	if (!response.ok) {
		const msg = await extractErrorMessage(response);
		throw error(response.status, msg);
	}

	const json = await response.json();
	return json.utxos;
});
