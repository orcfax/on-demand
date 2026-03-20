import { authKeyFileSchema } from './types';
import { getErrorMessage } from '$lib/errors';
import { createContext } from 'svelte';
import * as ed25519 from '@noble/ed25519';
import { encodeBech32 } from '@harmoniclabs/crypto';
import { hexToBytes, bytesToHex, composeKeytag } from './util';
import { sha512 } from '@noble/hashes/sha2';
import { getNetworkState, type NetworkState } from '$lib/network.svelte';
import { TOS_VERSION, computeTosHash } from '$lib/tos';
import { getCachedKey } from './keyCache';

ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));

export class AuthKey {
	isLoaded = $state(false);
	isDownloaded = $state(false);
	isRestored = $state(false);
	publicKey = $state('');
	privateKey = $state('');
	createdAt = $state('');
	channelTag = $state('');
	error = $state<string | null>(null);

	#networkState: NetworkState;
	private readonly provider = 'Orcfax Ltd.';
	private readonly version = 1;

	private get network() {
		return this.#networkState.current;
	}

	constructor() {
		this.#networkState = getNetworkState();
	}

	// Getter properties for private key (skey) in different formats
	get skeyHex() {
		return this.privateKey;
	}

	get skeyBech() {
		if (!this.privateKey) return '';
		try {
			return encodeBech32('ed25519_sk', hexToBytes(this.privateKey));
		} catch {
			return '';
		}
	}

	// Getter properties for public key (vkey) in different formats
	get vkeyHex() {
		return this.publicKey;
	}

	get vkeyBech() {
		if (!this.publicKey) return '';
		try {
			return encodeBech32('ed25519_vk', hexToBytes(this.publicKey));
		} catch {
			return '';
		}
	}

	create() {
		const skey = ed25519.utils.randomPrivateKey();
		const vkey = ed25519.getPublicKey(skey);

		// Update state properties
		this.privateKey = bytesToHex(skey);
		this.publicKey = bytesToHex(vkey);
		this.createdAt = new Date().toISOString();
		this.isLoaded = true;
		this.isRestored = false;

		// Return values from getter methods
		return this;
	}

	async restore(keyFile: File | undefined) {
		if (!keyFile) throw new Error(`No key file detected`);
		try {
			const result = authKeyFileSchema.safeParse(JSON.parse(await keyFile.text()));
			if (result.success) {
				this.privateKey = result.data.crypto.private_key.hex;
				this.publicKey = result.data.crypto.public_key.hex;
				this.isLoaded = true;
				this.isRestored = true;
			} else throw new Error(`Invalid or corrupted key file: ${result.error.message}`);
		} catch (err) {
			this.error = getErrorMessage(err, 'Unable to restore key file.');
		}
	}

	restoreFromParsed(crypto: { private_key: { hex: string }; public_key: { hex: string } }) {
		this.privateKey = crypto.private_key.hex;
		this.publicKey = crypto.public_key.hex;
		this.isLoaded = true;
		this.isRestored = true;
	}

	async restoreFromCache(keytag: string) {
		const privateKeyHex = await getCachedKey(keytag);
		if (!privateKeyHex) throw new Error('No cached key found');
		const publicKey = ed25519.getPublicKey(hexToBytes(privateKeyHex));
		this.privateKey = privateKeyHex;
		this.publicKey = bytesToHex(publicKey);
		this.isLoaded = true;
		this.isRestored = true;
	}

	clear() {
		this.isLoaded = false;
		this.isDownloaded = false;
		this.isRestored = false;
		this.publicKey = '';
		this.privateKey = '';
		this.error = null;
	}

	private downloadKey() {
		const filenameDate = this.createdAt.slice(0, 10);
		const payload = {
			format: 'orcfax-on-demand-key',
			version: 1,
			crypto: {
				algorithm: 'ed25519',
				private_key: {
					hex: this.skeyHex,
					bech32: this.skeyBech
				},
				public_key: {
					hex: this.vkeyHex,
					bech32: this.vkeyBech
				}
			},
			binding: {
				scope: 'subbit-channel',
				channel_tag: this.channelTag,
				channel_keytag: composeKeytag(this.publicKey, this.channelTag)
			},
			metadata: {
				network: this.network,
				provider: this.provider,
				created_at: this.createdAt,
				tos_version: TOS_VERSION,
				tos_hash: computeTosHash()
			}
		};
		const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `orcfax-on-demand-key-${filenameDate}.json`;
		document.body.appendChild(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(url);
		this.isDownloaded = true;
	}

	cacheAndDownloadKey(channelTag: string) {
		this.channelTag = channelTag;
		this.downloadKey();
	}
}

export const [getAuthKeyState, setAuthKeyState] = createContext<AuthKey>();
