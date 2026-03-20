import { TAG_MIN_BYTES, TAG_MAX_BYTES } from './tagSchema';

export const hexToBytes = (hex: string) => {
	const cleaned = hex.trim().replace(/^0x/i, '');
	if (!/^[0-9a-fA-F]+$/.test(cleaned) || cleaned.length % 2 !== 0) {
		throw new Error('Invalid hex string.');
	}
	return Uint8Array.from(cleaned.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? []);
};

export const bytesToHex = (bytes: Uint8Array) =>
	Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

// Decomposes a channel keytag into its constituent parts
export function decomposeKeytag(keytagHex: string): { key: string; tag: string } {
	const KEY_BYTES = 32;
	const bytes = hexToBytes(keytagHex);
	return {
		key: bytes.slice(0, KEY_BYTES).toString(),
		tag: bytes.slice(KEY_BYTES).toString()
	};
}

// Composes a channel keytag from its constituent parts
export function composeKeytag(publicKeyHex: string, tag: string): string {
	// ---- validate public key ----
	if (!/^[0-9a-fA-F]+$/.test(publicKeyHex)) {
		throw new Error('publicKeyHex must be a valid hex string');
	}
	const publicKey = Buffer.from(publicKeyHex, 'hex');
	if (publicKey.length !== 32) {
		throw new Error(`publicKeyHex must decode to 32 bytes (got ${publicKey.length})`);
	}

	// ---- validate tag ----
	const tagBytes = Buffer.from(tag, 'utf8');
	if (tagBytes.length < TAG_MIN_BYTES || tagBytes.length > TAG_MAX_BYTES) {
		throw new Error(
			`tag must be between ${TAG_MIN_BYTES} and ${TAG_MAX_BYTES} bytes (got ${tagBytes.length})`
		);
	}

	// ---- concatenate ----
	const keytag = Buffer.concat([publicKey, tagBytes]);
	return keytag.toString('hex');
}

export type ChannelStage = 'opening' | 'open' | 'closing' | 'closed' | 'settled' | 'ended';

/**
 * Gets the next IOU amount for a request.
 * IOUs must be monotonically increasing, so this returns the higher
 * of (cost, iouAmt) plus the new request cost.
 */
export function getNextIouAmount(cost: bigint, iouAmt: bigint, requestCost: bigint): bigint {
	const baseline = cost > iouAmt ? cost : iouAmt;
	return baseline + requestCost;
}

/**
 * Generates a random channel tag of the given length using alphanumeric chars.
 */
export function generateRandomTag(length: number = 20): string {
	const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

/**
 * Parses an ADA amount string to lovelace string.
 * Handles both dot and comma decimal separators, but rejects ambiguous input.
 */
export function parseAdaToLovelace(input: string): string {
	const cleaned = input.trim();
	const dotCount = (cleaned.match(/\./g) || []).length;
	const commaCount = (cleaned.match(/,/g) || []).length;

	if (dotCount > 0 && commaCount > 0) {
		throw new Error(
			`Ambiguous ADA format: "${input}". Please use only one type of decimal separator.`
		);
	}

	const normalized = commaCount > 0 && dotCount === 0 ? cleaned.replace(',', '.') : cleaned;
	const ada = Number(normalized);
	if (isNaN(ada)) {
		throw new Error(`Invalid ADA amount: "${input}"`);
	}

	const lovelace = Math.round(ada * 1_000_000);
	return lovelace.toString();
}

/**
 * Maps a stage string from SubbitMan's L2 response to the internal ChannelStage type.
 * SubbitMan returns stages like "Opened", "Suspended", "Closed", "Settled", "Ended".
 */
export function mapStage(stage: string): ChannelStage {
	const normalized = stage.toLowerCase();
	if (normalized.includes('opened')) return 'open';
	else if (normalized.includes('suspended'))
		return 'closed'; // DB returns "Suspended" for closed channels
	else if (normalized.includes('closed')) return 'closed';
	else if (normalized.includes('settled')) return 'settled';
	else if (normalized.includes('ended')) return 'ended';
	else throw new Error('Invalid channel stage: ' + stage);
}
