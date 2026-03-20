import { encode as encodeCbor } from 'cbor2';
import * as ed25519 from '@noble/ed25519';
import { hexToBytes } from './util';

/**
 * Message types for Subbit credentials
 */
export class Iou {
	static _cborTag = 121;
	constructor(
		public tag: Uint8Array,
		public amount: bigint
	) {}

	/**
	 * Write IOU to CBOR using writer interface (cbor2 will call this)
	 * Format: 0xd8 0x79 0x9f [tag_bytes] [amount_bytes] 0xff
	 */
	toCBOR(writer: any) {
		// Manually construct the bytes like the server does
		const tagBytes = encodeCbor(this.tag);
		const amountBytes = encodeCbor(this.amount);

		writer.write(
			new Uint8Array([
				0xd8, // CBOR tag marker
				0x79, // tag number 121
				0x9f, // indefinite array start
				...tagBytes,
				...amountBytes,
				0xff // indefinite array end (break)
			])
		);
	}
}

export class Stamp {
	static _cborTag = 122;
	constructor(
		public tag: Uint8Array,
		public now: bigint
	) {}

	toCBOR(writer?: any) {
		// For Stamp, return the standard array format (cbor2 handles this correctly)
		return [Stamp._cborTag, [this.tag, this.now]];
	}
}

export class Fixed {
	static _cborTag = 123;
	constructor(
		public tag: Uint8Array,
		public seed: bigint
	) {}

	toCBOR(writer?: any) {
		// For Fixed, return the standard array format (cbor2 handles this correctly)
		return [Fixed._cborTag, [this.tag, this.seed]];
	}
}

export type Msg = Iou | Stamp | Fixed;

/**
 * Credential class for signing messages with Ed25519 keys
 */
export class Cred {
	constructor(
		public iouKey: Uint8Array,
		public message: Msg,
		public signature: Uint8Array
	) {}

	/**
	 * Gets the keytag (concatenation of iouKey and message tag)
	 */
	keytag(): Uint8Array {
		return new Uint8Array([...this.iouKey, ...this.message.tag]);
	}

	/**
	 * Gets the CBOR-encoded message
	 */
	msgCbor(): Uint8Array {
		return encodeCbor(this.message);
	}

	/**
	 * Creates a credential by signing a message with a private key
	 */
	static async mk(skey: Uint8Array, message: Msg): Promise<Cred> {
		const vkey = await ed25519.getPublicKeyAsync(skey);
		const msgCbor = encodeCbor(message);
		const signature = await ed25519.signAsync(msgCbor, skey);

		return new Cred(vkey, message, signature);
	}

	/**
	 * Encodes credential to CBOR
	 */
	toCbor(): Uint8Array {
		return encodeCbor([this.iouKey, this.message, this.signature]);
	}

	/**
	 * Encodes credential to base64url
	 */
	toB64(): string {
		const cbor = this.toCbor();
		// Convert to base64 using browser APIs
		if (typeof window !== 'undefined' && typeof btoa !== 'undefined') {
			// Browser environment
			return btoa(String.fromCharCode(...cbor))
				.replace(/\+/g, '-')
				.replace(/\//g, '_');
		} else {
			// Node environment (for SSR)
			return Buffer.from(cbor).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
		}
	}

	/**
	 * Verifies the signature
	 */
	async check(): Promise<boolean> {
		const msgCbor = this.msgCbor();
		return await ed25519.verifyAsync(this.signature, msgCbor, this.iouKey);
	}
}

/**
 * Creates a Stamp credential for the current timestamp
 */
export async function createStampCredential(
	privateKeyHex: string,
	tag: Uint8Array = new Uint8Array(0)
): Promise<Cred> {
	const skey = hexToBytes(privateKeyHex);
	const now = BigInt(Date.now());
	const message = new Stamp(tag, now);
	return await Cred.mk(skey, message);
}

/**
 * Creates an IOU credential
 */
export async function createIouCredential(
	privateKeyHex: string,
	tag: string,
	amount: bigint
): Promise<Cred> {
	const skey = hexToBytes(privateKeyHex);
	const tagBytes = new TextEncoder().encode(tag);
	const message = new Iou(tagBytes, amount);
	return await Cred.mk(skey, message);
}

/**
 * Creates a Fixed credential
 */
export async function createFixedCredential(
	privateKeyHex: string,
	tag: Uint8Array,
	seed: bigint
): Promise<Cred> {
	const skey = hexToBytes(privateKeyHex);
	const message = new Fixed(tag, seed);
	return await Cred.mk(skey, message);
}
