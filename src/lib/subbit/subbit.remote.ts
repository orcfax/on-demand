import { query, command } from '$app/server';
import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { extractErrorMessage } from '$lib/errors';
import {
	IousResponseSchema,
	L1SubbitSchema,
	SyncResultSchema,
	CredentialB64Schema,
	TotResSchema,
	InfoResSchema,
	ModOptionsSchema,
	type IousResponse,
	type SyncResult,
	type L1Subbit,
	type InfoRes,
	type ModOptions
} from './types';

function baseUrl() {
	// falls back to local dev default if not configured
	return env.PRIVATE_SUBBIT_MAN_URL ?? 'http://127.0.0.1:7822';
}

async function subbitFetch<T>(path: string, init?: RequestInit): Promise<T> {
	const url = new URL(path, baseUrl());
	const res = await fetch(url, {
		...init,
		headers: {
			accept: 'application/json',
			'content-type': 'application/json',
			...(init?.headers ?? {})
		}
	});
	if (!res.ok) {
		const msg = await extractErrorMessage(res);
		throw error(res.status, msg);
	}
	const text = await res.text();
	if (!text) {
		return undefined as T;
	}
	const contentType = res.headers.get('content-type') ?? '';
	if (!contentType.includes('application/json')) {
		return text as T;
	}
	try {
		return JSON.parse(text) as T;
	} catch {
		return text as T;
	}
}

/**
 * GET /l1/ious
 * Lists IOUs keyed by keytag.
 */
export const getIous = query(async (): Promise<IousResponse> => {
	const json = await subbitFetch<unknown>('/l1/ious');
	return IousResponseSchema.parse(json);
});

/**
 * POST /l1/sync
 * Sync Subbit-Man with current L1 subbits. Accepts an array of l1 entries
 * (typically produced by subbit-xyz "show subbits --subbit-man-format").
 */
export const syncL1 = command(
	L1SubbitSchema.array().min(0),
	async (l1s: L1Subbit[]): Promise<SyncResult> => {
		const json = await subbitFetch<unknown>('/l1/sync', {
			method: 'POST',
			body: JSON.stringify(l1s)
		});
		return SyncResultSchema.parse(json);
	}
);

/**
 * GET /l2/tot?cred=...
 * Side-effectful in IOU mode (records a new IOU). Treat as command.
 */
export const getTot = command(CredentialB64Schema, async (credB64: string): Promise<string> => {
	const url = new URL('/l2/tot', baseUrl());
	url.searchParams.set('cred', credB64);
	const json = await subbitFetch<unknown>(url.toString());
	return TotResSchema.parse(json);
});

/**
 * GET /l2/info?cred=...
 * Non-destructive; returns current server view for the credential/keytag.
 */
export const getInfo = query(CredentialB64Schema, async (credB64: string): Promise<InfoRes> => {
	const url = new URL('/l2/info', baseUrl());
	url.searchParams.set('cred', credB64);
	const json = await subbitFetch<unknown>(url.toString());
	return InfoResSchema.parse(json);
});

/**
 * PATCH /l2/mod?cred=...&by=...
 * Adjust provider-side cost by a delta. Returns latest tot.
 */
export const putMod = command(
	ModOptionsSchema,
	async ({ cred, by }: ModOptions): Promise<string> => {
		const url = new URL('/l2/mod', baseUrl());
		url.searchParams.set('cred', cred);
		url.searchParams.set('by', by);
		const json = await subbitFetch<unknown>(url.toString(), { method: 'PATCH' });
		return TotResSchema.parse(json);
	}
);

/**
 * Channel opening request schema
 */
const ChannelOpenRequestSchema = z.object({
	txHash: z.string(),
	l1Subbit: L1SubbitSchema
});

/**
 * POST channel open - Sync a newly opened channel with SubbitMan
 * This should be called after the channel open transaction is confirmed on L1
 */
export const syncChannelOpen = command(
	ChannelOpenRequestSchema,
	async ({ txHash, l1Subbit }): Promise<SyncResult> => {
		// Sync the single channel with SubbitMan
		const json = await subbitFetch<unknown>('/l1/sync', {
			method: 'POST',
			body: JSON.stringify([l1Subbit])
		});
		return SyncResultSchema.parse(json);
	}
);

/**
 * Channel status request schema
 */
const ChannelStatusRequestSchema = z.object({
	walletAddress: z.string(),
	channelTag: z.string()
});

const ChannelStatusResponseSchema = z.object({
	isOpen: z.boolean(),
	info: InfoResSchema.optional(),
	error: z.string().optional()
});

export type ChannelStatusResponse = z.infer<typeof ChannelStatusResponseSchema>;

/**
 * GET channel status - Check if a channel is open and retrieve its info
 */
export const getChannelStatus = query(
	ChannelStatusRequestSchema,
	async ({ walletAddress, channelTag }): Promise<ChannelStatusResponse> => {
		try {
			// Create credential from address and tag
			const credential = {
				address: walletAddress,
				channelTag: channelTag
			};
			const credB64 = Buffer.from(JSON.stringify(credential)).toString('base64');

			// Query channel info
			const url = new URL('/l2/info', baseUrl());
			url.searchParams.set('cred', credB64);
			const json = await subbitFetch<unknown>(url.toString());
			const info = InfoResSchema.parse(json);

			// Check if channel is in an "open" state
			// Stages: 'Opened', 'Closed', 'Settled', 'Ended', 'Expired', 'NotFound'
			const isOpen = info.stage === 'Opened';

			return {
				isOpen,
				info
			};
		} catch (error) {
			return {
				isOpen: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}
);
