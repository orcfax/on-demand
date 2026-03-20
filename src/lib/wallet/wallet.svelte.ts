import type { Utxo } from '$lib/wallet/types';
import { getErrorMessage } from '$lib/errors';
import { parseAdaToLovelace } from '$lib/subbit/util';
import { createContext } from 'svelte';
import type { BrowserWallet, Wallet as MeshWallet } from '@meshsdk/core';
import { browser } from '$app/environment';
import { identify } from '$lib/analytics';
import { getNetworkState } from '$lib/network.svelte';

const STORAGE_KEY = 'orcfax_connected_wallet';

export class Wallet {
	connection = $state<BrowserWallet | null>(null);
	name = $state<string | null>(null);
	icon = $state<string | null>(null);
	version = $state<string | null>(null);
	error = $state<string | null>(null);

	availableWallets = $state<MeshWallet[]>([]);
	walletPickerOpen = $state(false);
	walletsLoading = $state(true);
	connecting = $state(false);
	connectingName = $state<string | null>(null);
	networkId = $state<number | null>(null);
	walletNetworkName = $derived.by<string | null>(() => {
		if (this.networkId === null) return null;
		if (this.networkId === 0) return 'Preview';
		if (this.networkId === 1) return 'Mainnet';
		return `Unknown (${this.networkId})`;
	});
	isConnected = $derived(this.connection !== null);

	constructor() {
		if (browser) {
			this.loadAvailableWallets();
		}
	}

	async loadAvailableWallets() {
		this.walletsLoading = true;
		this.error = null;
		try {
			console.log('[Wallet] Loading @meshsdk/core chunk...');
			const { BrowserWallet } = await import('@meshsdk/core');
			console.log('[Wallet] Chunk loaded, detecting wallets...');
			this.availableWallets = await BrowserWallet.getAvailableWallets();
			console.log('[Wallet] Detected:', this.availableWallets);
		} catch (err) {
			console.error('[Wallet] Failed:', err);
			this.error = getErrorMessage(err, 'Unable to load wallets.');
		} finally {
			this.walletsLoading = false;
			this.autoReconnect();
		}
	}

	async connect(w: MeshWallet) {
		this.error = null;
		this.connecting = true;
		this.connectingName = w.name;
		try {
			const { BrowserWallet } = await import('@meshsdk/core');
			const wallet: BrowserWallet = await BrowserWallet.enable(w.name);
			this.connection = wallet;
			this.name = w.name;
			this.icon = w.icon;
			this.version = w.version;
			this.networkId = await wallet.getNetworkId();
			localStorage.setItem(STORAGE_KEY, w.name);
		} catch (err) {
			this.error = getErrorMessage(err, 'Unable to connect wallet.');
		} finally {
			this.connecting = false;
			this.connectingName = null;
		}
	}

	disconnect() {
		this.connection = null;
		this.name = null;
		this.icon = null;
		this.version = null;
		this.networkId = null;
		this.walletPickerOpen = false;
		localStorage.removeItem(STORAGE_KEY);
	}

	togglePicker() {
		this.walletPickerOpen = !this.walletPickerOpen;
	}

	private async autoReconnect() {
		const storedName = localStorage.getItem(STORAGE_KEY);
		if (!storedName) return;
		const match = this.availableWallets.find((w) => w.name === storedName);
		if (!match) {
			localStorage.removeItem(STORAGE_KEY);
			return;
		}
		try {
			const { BrowserWallet } = await import('@meshsdk/core');
			const wallet: BrowserWallet = await BrowserWallet.enable(storedName);
			this.connection = wallet;
			this.name = match.name;
			this.icon = match.icon;
			this.version = match.version;
			this.networkId = await wallet.getNetworkId();
			try {
				const network = getNetworkState();
				const changeAddress = await wallet.getChangeAddress();
				identify(changeAddress, { wallet: storedName, network: network.current });
			} catch (err) {
				console.warn('[Wallet] identify() skipped during auto-reconnect:', err);
			}
			console.log('[Wallet] Auto-reconnected to', storedName);
		} catch {
			console.warn('[Wallet] Auto-reconnect failed for', storedName);
			localStorage.removeItem(STORAGE_KEY);
		}
	}

	async getNetworkName() {
		if (!this.connection) throw new Error('Wallet not connected');
		const networkId = await this.connection.getNetworkId();
		if (networkId === 0) {
			return 'Testnet';
		} else if (networkId === 1) {
			return 'Mainnet';
		} else {
			return `Unknown: ${networkId}`;
		}
	}

	async getUtxos(): Promise<Utxo[]> {
		if (!this.connection) {
			throw new Error('Wallet not connected');
		}
		return await this.connection.getUtxos();
	}

	async getAdaBalance(): Promise<string> {
		if (!this.connection) {
			throw new Error('Wallet not connected');
		}
		// Get the balance in lovelace
		const lovelace = await this.connection.getLovelace();
		// Convert to ADA
		const balanceAda = Number(lovelace) / 1_000_000;
		return `${balanceAda.toLocaleString()} ₳`;
	}

	async getChangeAddress(): Promise<string> {
		if (!this.connection) {
			throw new Error('Wallet not connected');
		}
		return await this.connection.getChangeAddress();
	}

	async signTx(tx: string, partial = true): Promise<string> {
		if (!this.connection) {
			throw new Error('Wallet not connected');
		}
		return await this.connection.signTx(tx, partial);
	}

	async submitTx(tx: string): Promise<string> {
		if (!this.connection) {
			throw new Error('Wallet not connected');
		}
		return await this.connection.submitTx(tx);
	}

	async donateAda(ada: string): Promise<string | Wallet> {
		const [lovelace, utxos, changeAddress] = await Promise.all([
			this.parseAdaToLovelace(ada),
			this.getUtxos(),
			this.getChangeAddress()
		]);

		const { MeshTxBuilder } = await import('@meshsdk/core');
		const txBuilder = new MeshTxBuilder();

		const unsignedTx = await txBuilder
			.txOut(
				'addr1q9cwxnl6v6th9n7mzhk293mfdsc6uac9hgkg2fjjf5fstjvccy2suwmp0ru23qyl8hudzrqraep3q8naq498flnhkxws5rh57s',
				[{ unit: 'lovelace', quantity: lovelace }]
			)
			.changeAddress(changeAddress)
			.selectUtxosFrom(utxos)
			.complete();
		const signedTx = await this.signTx(unsignedTx);
		const txHash = await this.submitTx(signedTx);
		const link = this.getExplorerLink(txHash);

		return link;
	}

	async parseAdaToLovelace(input: string): Promise<string> {
		return parseAdaToLovelace(input);
	}

	getExplorerLink(txHash: string): string {
		return `https://cexplorer.io/tx/${txHash}`;
	}
}

export const [getWalletState, setWalletState] = createContext<Wallet>();
