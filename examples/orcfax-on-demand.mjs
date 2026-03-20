#!/usr/bin/env node

/**
 * Orcfax On-Demand — standalone API client example
 *
 * Usage:
 *   node orcfax-on-demand.mjs ./path-to-keyfile.json
 *
 * Environment:
 *   ODAPI_URL  — API base URL (default: http://localhost:5173)
 *
 * Prerequisites:
 *   - Node.js 20+
 *   - pnpm add @noble/ed25519 @noble/hashes cbor2
 *   - A keyfile downloaded from the Orcfax On-Demand portal
 *   - An open Subbit payment channel on the configured network
 */

import { readFileSync } from 'node:fs';
import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2';
import { encode as encodeCbor } from 'cbor2';

// ed25519 requires a sha512 implementation
ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_BASE = process.env.ODAPI_URL?.replace(/\/$/, '') || 'http://localhost:5173';
const keyfilePath = process.argv[2];

if (!keyfilePath) {
	console.error('Usage: node orcfax-on-demand.mjs <keyfile.json>');
	process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hexToBytes(hex) {
	const cleaned = hex.trim().replace(/^0x/i, '');
	return Uint8Array.from(cleaned.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
}

// function bytesToHex(bytes) {
// 	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
// }

// ---------------------------------------------------------------------------
// Credential classes (mirrors src/lib/subbit/credential.ts)
// ---------------------------------------------------------------------------

class Iou {
	constructor(tag, amount) {
		this.tag = tag; // Uint8Array
		this.amount = amount; // BigInt
	}

	toCBOR(writer) {
		const tagBytes = encodeCbor(this.tag);
		const amountBytes = encodeCbor(this.amount);
		writer.write(new Uint8Array([0xd8, 0x79, 0x9f, ...tagBytes, ...amountBytes, 0xff]));
	}
}

class Stamp {
	constructor(tag, now) {
		this.tag = tag; // Uint8Array
		this.now = now; // BigInt
	}

	toCBOR() {
		return [122, [this.tag, this.now]];
	}
}

class Cred {
	constructor(iouKey, message, signature) {
		this.iouKey = iouKey; // Uint8Array (public key)
		this.message = message; // Iou | Stamp
		this.signature = signature; // Uint8Array
	}

	toCbor() {
		return encodeCbor([this.iouKey, this.message, this.signature]);
	}

	toB64() {
		return Buffer.from(this.toCbor()).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
	}

	static async mk(skey, message) {
		const vkey = await ed25519.getPublicKeyAsync(skey);
		const msgCbor = encodeCbor(message);
		const signature = await ed25519.signAsync(msgCbor, skey);
		return new Cred(vkey, message, signature);
	}
}

// ---------------------------------------------------------------------------
// Credential factories
// ---------------------------------------------------------------------------

async function makeStampCred(skey, tagBytes) {
	const now = BigInt(Date.now());
	return Cred.mk(skey, new Stamp(tagBytes, now));
}

async function makeIouCred(skey, tagBytes, amount) {
	return Cred.mk(skey, new Iou(tagBytes, amount));
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

async function apiGet(path, headers = {}) {
	const res = await fetch(`${API_BASE}${path}`, { headers });
	return { status: res.status, headers: res.headers, data: await res.json() };
}

// async function apiPost(path, headers = {}) {
// 	const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers });
// 	return { status: res.status, headers: res.headers, data: await res.json() };
// }

async function getFeeds() {
	const { data } = await apiGet('/api/feeds');
	return data;
}

async function getTos() {
	const { data } = await apiGet('/api/tos');
	return data;
}

async function getChannel(skey, tagBytes, tosVersion) {
	const cred = await makeStampCred(skey, tagBytes);
	const headers = { 'X-Credential': cred.toB64() };
	if (tosVersion) headers['X-ToS-Accepted'] = tosVersion;
	const { status, data } = await apiGet('/api/channel', headers);
	if (status !== 200)
		throw new Error(`GET /api/channel failed (${status}): ${JSON.stringify(data)}`);
	return data;
}

async function getPrice(skey, tagBytes, iouAmount, feedIds, tosVersion) {
	const cred = await makeIouCred(skey, tagBytes, iouAmount);
	const params = feedIds.map((id) => `feed_id=${encodeURIComponent(id)}`).join('&');
	const headers = { 'X-Credential': cred.toB64() };
	if (tosVersion) headers['X-ToS-Accepted'] = tosVersion;
	const { status, data } = await apiGet(`/api/prices?${params}`, headers);
	return { status, data };
}

// async function publish(skey, tagBytes, iouAmount, feedIds, tosVersion) {
// 	const cred = await makeIouCred(skey, tagBytes, iouAmount);
// 	const params = feedIds.map((id) => `feed_id=${encodeURIComponent(id)}`).join('&');
// 	const headers = { 'X-Credential': cred.toB64() };
// 	if (tosVersion) headers['X-ToS-Accepted'] = tosVersion;
// 	const { status, data } = await apiPost(`/api/publish?${params}`, headers);
// 	return { status, data };
// }

/**
 * Get price with automatic retry on InsufficientAmount (402).
 *
 * If the first attempt returns 402, the script:
 * 1. Fetches fresh channel state via GET /api/channel
 * 2. Computes a new IOU amount = current iouAmt + cost
 * 3. Retries the price request once
 */
async function getPriceWithRetry(skey, tagBytes, currentIouAmt, feedIds, cost, tosVersion) {
	const { status, data } = await getPrice(skey, tagBytes, currentIouAmt, feedIds, tosVersion);

	if (status === 409) {
		throw new Error(
			'ToS update required. Review the new terms at /api/tos and update your X-ToS-Accepted header.'
		);
	}

	if (status === 200) {
		return { data, iouAmt: currentIouAmt };
	}

	if (status !== 402) {
		throw new Error(`GET /api/prices failed (${status}): ${JSON.stringify(data)}`);
	}

	// 402 — InsufficientAmount: sync channel state and retry
	console.log('[retry] Got 402, syncing channel state...');
	const info = await getChannel(skey, tagBytes, tosVersion);
	const freshIouAmt = BigInt(info.iouAmt) + cost;
	console.log(`[retry] Fresh iouAmt from channel: ${info.iouAmt}, retrying with: ${freshIouAmt}`);

	const retry = await getPrice(skey, tagBytes, freshIouAmt, feedIds, tosVersion);
	if (retry.status !== 200) {
		throw new Error(
			`GET /api/prices retry failed (${retry.status}): ${JSON.stringify(retry.data)}`
		);
	}

	return { data: retry.data, iouAmt: freshIouAmt };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	// 1. Load keyfile
	const keyfile = JSON.parse(readFileSync(keyfilePath, 'utf-8'));
	if (keyfile.format !== 'orcfax-on-demand-key') {
		throw new Error(`Unexpected keyfile format: ${keyfile.format}`);
	}

	const skey = hexToBytes(keyfile.crypto.private_key.hex);
	const channelTag = keyfile.binding.channel_tag;
	const tagBytes = new TextEncoder().encode(channelTag);

	console.log(`Loaded keyfile for channel tag: ${channelTag}`);
	console.log(`  Network: ${keyfile.metadata.network}`);
	console.log(`  Public key: ${keyfile.crypto.public_key.hex.slice(0, 16)}...`);
	console.log(`  API: ${API_BASE}`);
	console.log();

	// 2. Fetch ToS (read pricing + version)
	const tos = await getTos();
	const tosVersion = tos.version;
	const updateCost = BigInt(tos.pricing.updateCostLovelace);
	const publishCost = BigInt(tos.pricing.publishCostLovelace);

	console.log(`ToS v${tosVersion}`);
	console.log(`  Update cost: ${updateCost} lovelace`);
	console.log(`  Publish cost: ${publishCost} lovelace`);
	console.log();

	// 3. List feeds
	const feeds = await getFeeds();
	console.log(`Available feeds (${feeds.length}):`);
	for (const f of feeds) console.log(`  - ${f}`);
	console.log();

	// 4. Get channel state
	const channelInfo = await getChannel(skey, tagBytes, tosVersion);
	console.log('Channel state:');
	console.log(`  Stage: ${channelInfo.stage}`);
	console.log(`  Cost: ${channelInfo.cost} lovelace`);
	console.log(`  IOU amount: ${channelInfo.iouAmt} lovelace`);
	console.log(`  Subbit amount: ${channelInfo.subbitAmt} lovelace`);
	console.log();

	// 5. Get price with retry
	const targetFeed = feeds[0] || 'ADA-USD';
	const startIouAmt = BigInt(channelInfo.iouAmt) + updateCost;

	console.log(`Fetching price for ${targetFeed} (iouAmt=${startIouAmt})...`);
	const { data: priceData, iouAmt: finalIouAmt } = await getPriceWithRetry(
		skey,
		tagBytes,
		startIouAmt,
		[targetFeed],
		updateCost,
		tosVersion
	);

	console.log('Price response:');
	console.log(JSON.stringify(priceData, null, 2));
	console.log(`Final iouAmt: ${finalIouAmt}`);
}

main().catch((err) => {
	console.error('Error:', err.message || err);
	process.exit(1);
});
