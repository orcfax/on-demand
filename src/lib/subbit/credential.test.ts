import { describe, it, expect } from 'vitest';
import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2';
import { encode as encodeCbor } from 'cbor2';
import {
	Iou,
	Stamp,
	Fixed,
	Cred,
	createIouCredential,
	createStampCredential,
	createFixedCredential
} from './credential';
import { bytesToHex } from './util';

// Enable sync sha512 for ed25519 (same as authKey.svelte.ts does)
ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));

// Generate a test keypair
function makeTestKey() {
	const skey = ed25519.utils.randomPrivateKey();
	const vkey = ed25519.getPublicKey(skey);
	return { skey, vkey, skeyHex: bytesToHex(skey), vkeyHex: bytesToHex(vkey) };
}

describe('Iou', () => {
	it('constructs with tag and amount', () => {
		const tag = new Uint8Array([1, 2, 3]);
		const iou = new Iou(tag, 100n);
		expect(iou.tag).toEqual(tag);
		expect(iou.amount).toBe(100n);
	});

	it('produces CBOR output via toCBOR', () => {
		const tag = new Uint8Array([0xaa]);
		const iou = new Iou(tag, 42n);
		const encoded = encodeCbor(iou);
		expect(encoded).toBeInstanceOf(Uint8Array);
		expect(encoded.length).toBeGreaterThan(0);
		// Should start with 0xd8 0x79 (CBOR tag 121)
		expect(encoded[0]).toBe(0xd8);
		expect(encoded[1]).toBe(0x79);
	});
});

describe('Stamp', () => {
	it('constructs with tag and timestamp', () => {
		const tag = new Uint8Array([4, 5, 6]);
		const stamp = new Stamp(tag, BigInt(Date.now()));
		expect(stamp.tag).toEqual(tag);
	});
});

describe('Fixed', () => {
	it('constructs with tag and seed', () => {
		const tag = new Uint8Array([7, 8, 9]);
		const fixed = new Fixed(tag, 999n);
		expect(fixed.tag).toEqual(tag);
		expect(fixed.seed).toBe(999n);
	});
});

describe('Cred', () => {
	it('creates a credential with valid signature (Cred.mk)', async () => {
		const { skey } = makeTestKey();
		const tag = new Uint8Array([1, 2, 3]);
		const msg = new Iou(tag, 500n);

		const cred = await Cred.mk(skey, msg);
		expect(cred.iouKey).toBeInstanceOf(Uint8Array);
		expect(cred.iouKey.length).toBe(32); // ed25519 public key
		expect(cred.signature).toBeInstanceOf(Uint8Array);
		expect(cred.signature.length).toBe(64); // ed25519 signature
		expect(cred.message).toBe(msg);
	});

	it('verifies a valid signature (cred.check)', async () => {
		const { skey } = makeTestKey();
		const msg = new Iou(new Uint8Array([10, 20]), 1000n);
		const cred = await Cred.mk(skey, msg);
		expect(await cred.check()).toBe(true);
	});

	it('fails verification with wrong public key', async () => {
		const key1 = makeTestKey();
		const key2 = makeTestKey();
		const msg = new Iou(new Uint8Array([1]), 1n);
		const cred = await Cred.mk(key1.skey, msg);

		// Replace the public key with a different one
		const tampered = new Cred(key2.vkey, cred.message, cred.signature);
		expect(await tampered.check()).toBe(false);
	});

	it('fails verification with tampered message', async () => {
		const { skey } = makeTestKey();
		const msg = new Iou(new Uint8Array([1]), 100n);
		const cred = await Cred.mk(skey, msg);

		// Create a different message but keep the same signature
		const differentMsg = new Iou(new Uint8Array([1]), 200n);
		const tampered = new Cred(cred.iouKey, differentMsg, cred.signature);
		expect(await tampered.check()).toBe(false);
	});

	it('produces keytag (iouKey + message.tag)', async () => {
		const { skey } = makeTestKey();
		const tag = new Uint8Array([0xaa, 0xbb]);
		const msg = new Iou(tag, 1n);
		const cred = await Cred.mk(skey, msg);

		const keytag = cred.keytag();
		expect(keytag.length).toBe(34); // 32 (key) + 2 (tag)
		expect(keytag.slice(0, 32)).toEqual(cred.iouKey);
		expect(keytag.slice(32)).toEqual(tag);
	});

	it('encodes to CBOR (toCbor)', async () => {
		const { skey } = makeTestKey();
		const msg = new Stamp(new Uint8Array([1, 2, 3]), BigInt(Date.now()));
		const cred = await Cred.mk(skey, msg);

		const cbor = cred.toCbor();
		expect(cbor).toBeInstanceOf(Uint8Array);
		expect(cbor.length).toBeGreaterThan(0);
	});

	it('encodes to base64url (toB64)', async () => {
		const { skey } = makeTestKey();
		const msg = new Iou(new Uint8Array([5]), 42n);
		const cred = await Cred.mk(skey, msg);

		const b64 = cred.toB64();
		expect(typeof b64).toBe('string');
		expect(b64.length).toBeGreaterThan(0);
		// base64url should not contain + or /
		expect(b64).not.toContain('+');
		expect(b64).not.toContain('/');
	});

	it('msgCbor returns CBOR-encoded message', async () => {
		const { skey } = makeTestKey();
		const msg = new Iou(new Uint8Array([1]), 50n);
		const cred = await Cred.mk(skey, msg);

		const msgCbor = cred.msgCbor();
		expect(msgCbor).toBeInstanceOf(Uint8Array);
		// Should match what encodeCbor produces for the same message
		expect(msgCbor).toEqual(encodeCbor(msg));
	});
});

describe('createIouCredential', () => {
	it('creates a verifiable IOU credential from hex key', async () => {
		const { skeyHex } = makeTestKey();
		const cred = await createIouCredential(skeyHex, 'test-tag', 1000n);

		expect(await cred.check()).toBe(true);
		expect(cred.message).toBeInstanceOf(Iou);
		expect((cred.message as Iou).amount).toBe(1000n);
	});
});

describe('createStampCredential', () => {
	it('creates a verifiable Stamp credential', async () => {
		const { skeyHex } = makeTestKey();
		const cred = await createStampCredential(skeyHex);

		expect(await cred.check()).toBe(true);
		expect(cred.message).toBeInstanceOf(Stamp);
	});

	it('uses current timestamp', async () => {
		const before = BigInt(Date.now());
		const { skeyHex } = makeTestKey();
		const cred = await createStampCredential(skeyHex);
		const after = BigInt(Date.now());

		const now = (cred.message as Stamp).now;
		expect(now >= before).toBe(true);
		expect(now <= after).toBe(true);
	});
});

describe('createFixedCredential', () => {
	it('creates a verifiable Fixed credential', async () => {
		const { skeyHex } = makeTestKey();
		const tag = new Uint8Array([1, 2, 3]);
		const cred = await createFixedCredential(skeyHex, tag, 42n);

		expect(await cred.check()).toBe(true);
		expect(cred.message).toBeInstanceOf(Fixed);
		expect((cred.message as Fixed).seed).toBe(42n);
	});
});

describe('cross-key isolation', () => {
	it('two different keys produce different signatures for same message', async () => {
		const key1 = makeTestKey();
		const key2 = makeTestKey();
		const msg = new Iou(new Uint8Array([1, 2, 3]), 100n);

		const cred1 = await Cred.mk(key1.skey, msg);
		const cred2 = await Cred.mk(key2.skey, msg);

		expect(bytesToHex(cred1.signature)).not.toBe(bytesToHex(cred2.signature));
		expect(await cred1.check()).toBe(true);
		expect(await cred2.check()).toBe(true);
	});
});
