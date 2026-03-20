import { createContext } from 'svelte';
import { SvelteDate } from 'svelte/reactivity';
import { getWalletState, type Wallet } from '$lib/wallet/wallet.svelte';
import { AuthKey, getAuthKeyState } from './authKey.svelte';
import { createStampCredential } from './credential';
import {
	composeKeytag,
	decomposeKeytag,
	mapStage,
	getNextIouAmount,
	generateRandomTag,
	type ChannelStage
} from './util';
import { validateTag, getTagByteLength } from './tagSchema';
import { syncChannels } from './server/sync.remote';
import { buildOpenTx } from './server/open.remote';
import { buildAddTx } from './server/add.remote';
import { buildCloseTx } from './server/close.remote';
import { settleChannel } from './server/settle.remote';
import { buildEndTx, buildExpireTx } from './server/withdraw.remote';
import { getTxUtxos, getCurrentChannelState, getChannelOnChainState } from './server/info.remote';
import { authKeyFileSchema } from './types';
import { track } from '$lib/analytics';
import { getErrorMessage } from '$lib/errors';
import {
	PRICE_REQUEST_COST_ADA,
	PUBLISH_REQUEST_COST_ADA,
	CHANNEL_RESERVE,
	CHANNEL_RESERVE_ADA
} from '$lib/odapi/pricing';
import { TOS_VERSION, computeTosHash } from '$lib/tos';
import { getChannelStoreState, type ChannelStore } from './channelStore.svelte';
import { getNetworkState, type NetworkState } from '$lib/network.svelte';
import { deleteCachedKey } from './keyCache';

interface ChannelRef {
	txHash: string;
	outputIndex: number;
}

interface ChannelInfo {
	ref: ChannelRef;
	stage: ChannelStage;
	balance: bigint;
	tag: Uint8Array;
}

interface SubbitInfoRes {
	keytag: string;
	stage: string;
	cost: string;
	iouAmt: string;
	sub: string;
	subbitAmt: string;
	sig: string;
}

export class Channel {
	readonly subbitTagLength = 20;

	ref = $state<ChannelRef | null>(null);
	stage = $state<ChannelStage>('opening');
	#tag = $state<string>(generateRandomTag(this.subbitTagLength));
	keytag = $state<string | null>(null);
	#depositAda = $state(10);
	cost = $state<bigint>(0n); // Actual amount owed to provider for services rendered
	iouAmt = $state<bigint>(0n); // Maximum amount consumer has agreed to pay via latest IOU
	sub = $state<bigint>(0n); // Amount already deducted/settled on L1 blockchain
	subbitAmt = $state<bigint>(0n); // Total funds locked in the L1 blockchain subbit
	sig = $state<string>(''); // Current IOU signature (hex-encoded)
	#key: AuthKey; // AuthKey instance for internal channel usage
	#wallet: Wallet; // Wallet instance for internal channel usage
	#channelStore: ChannelStore;
	#networkState: NetworkState;

	isRestored = $state(false);

	// UI state
	syncing = $state(false);
	syncStatus = $state<string>(''); // Status message during sync process
	opening = $state(false);
	pendingSync = $state(false); // True when tx submitted but post-submit sync failed
	adding = $state(false); // True when adding funds
	closing = $state(false); // True during close tx submission
	withdrawing = $state(false); // True during withdraw tx submission
	error = $state<string | null>(null);

	// Close/withdraw lifecycle state
	consumerKeyHash = $state<string | null>(null); // Wallet payment pubKeyHash
	deadline = $state<number | null>(null); // Close period deadline (unix ms)
	lastSynced = $state<number | null>(null); // Timestamp of last successful sync
	#now = new SvelteDate();

	readonly updateCostAda = PRICE_REQUEST_COST_ADA;
	readonly publishCostAda = PUBLISH_REQUEST_COST_ADA;
	readonly channelReserveAda = CHANNEL_RESERVE_ADA;

	readonly minDepositAda = 10;

	constructor() {
		this.#key = getAuthKeyState();
		this.#wallet = getWalletState();
		this.#channelStore = getChannelStoreState();
		this.#networkState = getNetworkState();

		$effect(() => {
			if (this.stage !== 'closed' && this.stage !== 'closing') return;
			this.#now.setTime(Date.now());
			const interval = setInterval(() => {
				this.#now.setTime(Date.now());
			}, 60_000);
			return () => clearInterval(interval);
		});
	}

	// Derived state
	isOpen = $derived(this.stage === 'open');
	isClosed = $derived(this.stage === 'closed');
	canAddFunds = $derived(this.stage === 'open');
	canClose = $derived(this.stage === 'open');

	canExpire = $derived(
		this.stage === 'closed' && this.deadline !== null && this.#now.getTime() >= this.deadline
	);

	canWithdraw = $derived(this.stage === 'settled' || this.canExpire);

	timeRemainingMs = $derived.by(() => {
		if (!this.deadline) return null;
		const ms = this.deadline - this.#now.getTime();
		return ms > 0 ? ms : 0;
	});

	/**
	 * Gets available balance (how much can still be spent)
	 * Formula from accounting.md: tot = min(iouAmt - max(cost, sub), subbitAmt)
	 */
	availableBalance = $derived.by(() => {
		const maxCostOrSub = this.cost > this.sub ? this.cost : this.sub;
		const iouAvailable = this.iouAmt - maxCostOrSub;
		return iouAvailable < this.subbitAmt ? iouAvailable : this.subbitAmt;
	});

	balanceInAda = $derived(Number(this.availableBalance) / 1_000_000);

	/** Simple available balance: locked minus spent minus reserve (ignores IOU mechanics) */
	simpleAvailableInAda = $derived.by(() => {
		const available = this.subbitAmt - this.cost - CHANNEL_RESERVE;
		return Number(available < 0n ? 0n : available) / 1_000_000;
	});

	costInAda = $derived(Number(this.cost) / 1_000_000);
	iouAmtInAda = $derived(Number(this.iouAmt) / 1_000_000);
	subInAda = $derived(Number(this.sub) / 1_000_000);
	subbitAmtInAda = $derived(Number(this.subbitAmt) / 1_000_000);

	set tag(input: string) {
		if (this.isOpen) return;
		this.#tag = input;
	}

	get tag() {
		return this.#tag;
	}

	tagValidation = $derived.by(() => validateTag(this.#tag));
	tagByteLength = $derived(getTagByteLength(this.#tag));
	isTagValid = $derived(this.tagValidation.ok);

	set depositAda(deposit: number) {
		this.#depositAda = deposit;
	}

	get depositAda() {
		return this.#depositAda;
	}

	/**
	 * Fetches channel info from Subbit-Man-JS by public key hash
	 */
	async fetchFromSubbit() {
		this.syncing = true;
		try {
			if (!this.tag) {
				throw new Error('Channel tag not set. Paste the tag before syncing.');
			}
			// Create a timestamp-based credential for authentication
			const cred = await createStampCredential(
				this.#key.privateKey,
				new TextEncoder().encode(this.tag)
			);
			const credB64 = cred.toB64();

			const data = await getCurrentChannelState(credB64);
			this.updateFromInfo(data);
		} finally {
			this.syncing = false;
		}
	}

	/**
	 * Opens a new channel with initial deposit (client-side transaction building)
	 * Returns the tag hex on success
	 */
	async openChannel(): Promise<string> {
		// Validation
		if (!this.#wallet.isConnected || !this.#wallet.connection) {
			throw new Error('Connect wallet first');
		}
		if (this.#depositAda < this.minDepositAda) {
			throw new Error(`Initial deposit must be at least ${this.minDepositAda} ADA`);
		}

		this.error = null;
		this.opening = true;
		this.pendingSync = false;
		let txSubmitted = false;

		try {
			this.#key.create();
			track('key-generate');
			this.keytag = composeKeytag(this.#key.publicKey, this.tag);
			const { txHash, tag } = await this.open();
			txSubmitted = true;

			// Persist recovery info to a separate localStorage key (NOT channelStore).
			// Writing to channelStore would flip the "New/Returning" tab mid-opening.
			// This survives browser crashes; cleared once the full flow completes.
			this.persistPendingOpen();

			await this.runPostOpenSync(txHash);

			// Full flow succeeded — move from pending to channelStore
			this.clearPendingOpen();
			this.syncStatus = 'Channel ready!';

			this.saveToStore();
			this.#channelStore.update(this.keytag!, {
				tosVersion: TOS_VERSION,
				tosHash: computeTosHash(),
				tosAcceptedAt: new Date().toISOString()
			});
			this.isRestored = true;

			// Clear sync status after a brief delay to show success message
			setTimeout(() => {
				this.syncStatus = '';
			}, 2000);

			return tag;
		} catch (err) {
			const message = getErrorMessage(err, 'Failed to open channel');

			if (txSubmitted) {
				// Post-submit failure: tx is on-chain but sync didn't complete.
				// Keep state intact so the UI can offer a retry.
				this.error = message;
				this.pendingSync = true;
				this.syncStatus = '';
				this.opening = false;
				// Don't re-throw — the UI will show recovery controls
				return this.tag;
			}

			// Pre-submit failure: nothing happened on-chain, let user retry the form
			this.error = message;
			this.syncStatus = '';
			throw err;
		} finally {
			this.opening = false;
		}
	}

	/**
	 * Retries the post-submission sync steps after a failed channel opening.
	 * Picks up from where openChannel() left off using the already-stored txHash.
	 */
	async retryOpenSync(): Promise<void> {
		if (!this.pendingSync || !this.ref?.txHash) {
			throw new Error('No pending sync to retry');
		}

		this.error = null;
		this.opening = true;

		try {
			await this.runPostOpenSync(this.ref.txHash);

			// Success — move from pending to channelStore
			this.clearPendingOpen();
			this.syncStatus = 'Channel ready!';
			this.pendingSync = false;

			this.saveToStore();
			this.#channelStore.update(this.keytag!, {
				tosVersion: TOS_VERSION,
				tosHash: computeTosHash(),
				tosAcceptedAt: new Date().toISOString()
			});
			this.isRestored = true;

			setTimeout(() => {
				this.syncStatus = '';
			}, 2000);
		} catch (err) {
			this.error = getErrorMessage(err, 'Sync failed — you can retry');
		} finally {
			this.opening = false;
		}
	}

	/**
	 * Runs the post-submission sync steps: UTxO confirmation → L1 sync → L2 fetch.
	 * Shared between openChannel() and retryOpenSync().
	 */
	private async runPostOpenSync(txHash: string): Promise<void> {
		// Wait for UTxO to appear on-chain with polling
		this.syncStatus = 'Waiting for blockchain confirmation...';
		console.log('[Channel] Waiting for UTxO confirmation on-chain...');
		await this.waitForUtxoConfirmation(txHash, 60000, 5000); // 60s max, check every 5s

		// Give Blockfrost indexer time to index the UTxO properly
		this.syncStatus = 'Waiting for indexer to process transaction...';
		console.log('[Channel] Waiting additional 10s for Blockfrost indexer...');
		await new Promise((resolve) => setTimeout(resolve, 10000));

		// Sync the l1 with retry logic
		this.syncStatus = 'Syncing channel from L1...';
		console.log('[Channel] Syncing channel from L1...', { txHash });
		await this.syncWithRetry(3, 5000);

		// Now fetch channel info from subbit-man-js
		this.syncStatus = 'Loading channel info...';
		await this.syncAfterOpen(3, 5000);
	}

	/**
	 * Restores a channel from a key file
	 */
	async restore(key: File | undefined): Promise<void> {
		if (!key) throw new Error(`No key file detected`);
		try {
			this.error = null;

			// Parse key file once and distribute to AuthKey + Channel
			const text = await key.text();
			const result = authKeyFileSchema.safeParse(JSON.parse(text));
			if (!result.success) {
				throw new Error(`Invalid or corrupted key file: ${result.error.message}`);
			}
			this.#key.restoreFromParsed(result.data.crypto);
			this.tag = result.data.binding.channel_tag;
			this.keytag = result.data.binding.channel_keytag;

			await this.syncAfterRestore();
		} catch (err) {
			this.error = getErrorMessage(err, 'Failed to restore channel');
			throw err;
		}
	}

	/**
	 * Restores a channel from the browser key cache (no file needed)
	 */
	async restoreFromCache(keytag: string): Promise<void> {
		try {
			this.error = null;

			// Restore key from cache (derives public key internally)
			await this.#key.restoreFromCache(keytag);

			// Load stored channel metadata to recover tag + keytag
			const stored = this.#channelStore.get(keytag);
			if (!stored) throw new Error('No stored channel found for this keytag');
			this.tag = stored.tag;
			this.keytag = keytag;

			await this.syncAfterRestore();
		} catch (err) {
			this.error = getErrorMessage(err, 'Failed to restore channel from cache');
			throw err;
		}
	}

	/**
	 * Retries a failed restore sync (re-runs syncAfterRestore with existing state)
	 */
	async retrySync(): Promise<void> {
		try {
			this.error = null;
			await this.syncAfterRestore();
		} catch (err) {
			this.error = getErrorMessage(err, 'Failed to restore channel');
			throw err;
		}
	}

	/**
	 * Shared sync logic after restore (file or cache)
	 */
	private async syncAfterRestore(): Promise<void> {
		// Load stored channel info if available
		const stored = this.loadFromStore();
		if (stored && stored.txHash) {
			this.ref = { txHash: stored.txHash, outputIndex: 0 };
		}
		if (stored?.consumerKeyHash) {
			this.consumerKeyHash = stored.consumerKeyHash;
		}
		if (stored?.stage) {
			this.stage = stored.stage as ChannelStage;
		}
		if (stored?.deadline) {
			this.deadline = stored.deadline;
		}

		// Derive consumerKeyHash from wallet if missing (new browser scenario)
		if (!this.consumerKeyHash && this.#wallet.isConnected && this.#wallet.connection) {
			const { deserializeAddress } = await import('@meshsdk/core');
			const changeAddress = await this.#wallet.connection.getChangeAddress();
			const { pubKeyHash } = deserializeAddress(changeAddress);
			if (pubKeyHash) this.consumerKeyHash = pubKeyHash;
		}

		// Resilient sync: L2 first → L1 fallback → stage correction
		try {
			await this.fetchFromSubbit();
		} catch {
			// SubbitMan doesn't know this channel — try L1 sync to repopulate
			// (only helps for Opened channels; Closed/Settled are filtered from sync)
			try {
				await syncChannels();
				await this.fetchFromSubbit();
			} catch {
				// L2 has no record even after L1 sync — go directly to L1 state check
				if (this.consumerKeyHash) {
					await this.checkOnChainState();
					if (this.stage === 'opening') {
						throw new Error('Channel not found on-chain — it may have already been withdrawn');
					}
				} else {
					throw new Error(
						'Channel not found in provider records and cannot check on-chain state without wallet'
					);
				}
			}
		}

		// Stage correction: if L2 returned 'closed'/'settled', fetch deadline from L1
		if ((this.stage === 'closed' || this.stage === 'settled') && this.consumerKeyHash) {
			await this.checkOnChainState();
			// Re-read stage after async mutation (TS narrowing doesn't account for clear())
			if ((this.stage as ChannelStage) === 'opening') {
				throw new Error('Channel not found on-chain — it may have already been withdrawn');
			}
		}

		// Clear any intermediate errors from the fallback chain
		this.error = null;
		this.lastSynced = Date.now();
		this.isRestored = true;

		// Save to store
		this.saveToStore();
	}

	/**
	 * Internal method: Opens a new channel with initial deposit (server-built transaction)
	 */
	private async open() {
		if (!this.#wallet.isConnected || !this.#wallet.connection) {
			throw new Error('Wallet not connected');
		}
		if (!this.#key.isLoaded) {
			throw new Error('AuthKey not loaded');
		}

		this.error = null;
		try {
			const { deserializeAddress } = await import('@meshsdk/core');

			// Parse deposit amount + add channel reserve (minADA that must stay in UTxO)
			const depositLovelace = BigInt(Math.round(this.#depositAda * 1_000_000));
			const lovelace = depositLovelace + CHANNEL_RESERVE;

			// Get wallet UTxOs and change address
			const [walletUtxos, changeAddress] = await Promise.all([
				this.#wallet.connection.getUtxos(),
				this.#wallet.connection.getChangeAddress()
			]);
			const { pubKeyHash } = deserializeAddress(changeAddress);
			if (!pubKeyHash) {
				throw new Error('Unable to resolve wallet payment key hash');
			}
			this.consumerKeyHash = pubKeyHash;

			// Build transaction via server remote function
			const { unsignedTx, channelInfo } = await buildOpenTx({
				tag: this.tag,
				amount: lovelace.toString(),
				iouKey: this.#key.vkeyHex,
				consumerKeyHash: pubKeyHash,
				walletUtxos,
				changeAddress
			});

			// Sign and submit
			const signedTx = await this.#wallet.connection.signTx(unsignedTx, true);
			const txHash = await this.#wallet.connection.submitTx(signedTx);

			this.subbitAmt = BigInt(channelInfo.subbitAmt);
			this.ref = { txHash, outputIndex: 0 };

			return { txHash, tag: this.tag };
		} catch (err) {
			this.error = getErrorMessage(err, 'Failed to open channel');
			throw err;
		}
	}

	/**
	 * Wait for UTxO to be confirmed on-chain by polling
	 */
	private async waitForUtxoConfirmation(
		txHash: string,
		maxWaitMs: number,
		pollIntervalMs: number
	): Promise<void> {
		const startTime = Date.now();
		let attempt = 0;

		while (Date.now() - startTime < maxWaitMs) {
			attempt++;
			try {
				// Fetch UTxOs from the transaction using remote query
				const utxos = await getTxUtxos(txHash);
				if (utxos && utxos.length > 0) {
					console.log(
						`[Channel] UTxO confirmed after ${Date.now() - startTime}ms (${attempt} attempts)`,
						utxos
					);
					return;
				}
			} catch (err) {
				console.warn(`[Channel] Polling attempt ${attempt} failed:`, err);
			}

			// Wait before next poll
			await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
			const elapsed = Math.floor((Date.now() - startTime) / 1000);
			this.syncStatus = `Waiting for blockchain confirmation... (${elapsed}s)`;
		}

		throw new Error('Transaction not confirmed within timeout period');
	}

	/**
	 * Sync channels from L1 with retry logic
	 */
	private async syncWithRetry(maxRetries: number, delayMs: number): Promise<void> {
		let lastError: Error | null = null;

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				const res = await syncChannels();
				console.log('[Channel] Sync successful:', res);
				return;
			} catch (err) {
				lastError = err instanceof Error ? err : new Error(String(err));
				console.warn(`[Channel] Sync attempt ${attempt}/${maxRetries} failed:`, lastError.message);

				if (attempt < maxRetries) {
					const waitTime = delayMs * attempt; // Exponential backoff
					this.syncStatus = `Sync failed, retrying in ${waitTime / 1000}s... (${attempt}/${maxRetries})`;
					await new Promise((resolve) => setTimeout(resolve, waitTime));
				}
			}
		}

		// All retries failed
		throw new Error(`Sync failed after ${maxRetries} attempts: ${lastError?.message}`);
	}

	/**
	 * Fetch channel info from L2 after opening, retrying L1 sync if the channel
	 * hasn't been indexed yet (Blockfrost can lag behind confirmation).
	 */
	private async syncAfterOpen(maxRetries: number, delayMs: number): Promise<void> {
		let lastError: Error | null = null;

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				await this.sync();
				return;
			} catch (err) {
				lastError = err instanceof Error ? err : new Error(String(err));
				console.warn(
					`[Channel] L2 fetch attempt ${attempt}/${maxRetries} failed:`,
					lastError.message
				);

				if (attempt < maxRetries) {
					const waitTime = delayMs * attempt;
					this.syncStatus = `Channel not found in provider yet, retrying in ${waitTime / 1000}s... (${attempt}/${maxRetries})`;
					await new Promise((resolve) => setTimeout(resolve, waitTime));

					// Re-sync L1 so SubbitMan picks up the new UTxO
					this.syncStatus = 'Re-syncing from chain...';
					await this.syncWithRetry(1, 0);
				}
			}
		}

		throw new Error(`Channel not found after ${maxRetries} attempts: ${lastError?.message}`);
	}

	/**
	 * Generates a random channel tag
	 */
	generateRandomTag(): string {
		return generateRandomTag(this.subbitTagLength);
	}

	/**
	 * Adds funds to existing channel (hybrid approach: server builds tx with client UTXOs)
	 */
	async addFunds(wallet: Wallet, amountAda: string) {
		if (!this.canAddFunds) {
			throw new Error('Cannot add funds to channel in current state');
		}
		if (!wallet.isConnected || !wallet.connection) {
			throw new Error('Wallet not connected');
		}

		this.error = null;
		this.adding = true;
		this.syncStatus = 'Preparing transaction...';

		try {
			const lovelaceToAdd = await wallet.parseAdaToLovelace(amountAda);
			console.log('[Channel] Adding funds via server-side transaction building...');
			console.log('[Channel] Amount to add:', amountAda, 'ADA =', lovelaceToAdd, 'lovelace');

			// Get wallet UTXOs and change address
			this.syncStatus = 'Fetching wallet data...';
			const [walletUtxos, changeAddress] = await Promise.all([
				wallet.connection.getUtxos(),
				wallet.connection.getChangeAddress()
			]);

			console.log('[Channel] Wallet has', walletUtxos.length, 'UTXOs');
			console.log('[Channel] Change address:', changeAddress);

			// Build transaction using remote function
			this.syncStatus = 'Building transaction...';
			const { unsignedTx, channelInfo } = await buildAddTx({
				tag: this.tag,
				amount: lovelaceToAdd,
				walletUtxos,
				changeAddress
			});
			console.log('[Channel] Unsigned transaction built via remote function');

			// Sign the transaction (partial signing since script is involved)
			this.syncStatus = 'Waiting for signature...';
			const signedTx = await wallet.connection.signTx(unsignedTx, true);
			console.log('[Channel] Transaction signed');

			// Submit the transaction
			this.syncStatus = 'Submitting transaction...';
			const txHash = await wallet.connection.submitTx(signedTx);
			console.log('[Channel] Transaction submitted:', txHash);

			// Update the channel ref to point to the new UTXO
			this.ref = { txHash, outputIndex: 0 };

			// Authoritative new amount from the build response
			const newSubbitAmt = BigInt(channelInfo.subbitAmt);
			this.subbitAmt = newSubbitAmt;

			// Wait for confirmation
			this.syncStatus = 'Waiting for confirmation...';
			await this.waitForUtxoConfirmation(txHash, 60000, 3000);
			console.log('[Channel] Transaction confirmed');

			// Sync with SubbitMan
			this.syncStatus = 'Syncing with provider...';
			await this.syncWithRetry(3, 2000);
			console.log('[Channel] Sync complete');

			// Fetch updated channel info from SubbitMan
			this.syncStatus = 'Fetching updated channel info...';
			await this.fetchFromSubbit();
			// Re-apply authoritative amount — L2 may lag behind L1
			this.subbitAmt = newSubbitAmt;
			this.saveToStore();

			this.syncStatus = 'Funds added successfully!';
			return { txHash };
		} catch (err) {
			this.error = getErrorMessage(err, 'Failed to add funds');
			console.error('[Channel] Add funds error:', err);
			throw err;
		} finally {
			this.adding = false;
			// Clear status after a delay
			setTimeout(() => {
				this.syncStatus = '';
			}, 3000);
		}
	}

	/**
	 * Closes the channel — starts the settlement period.
	 * Consumer signs a Close tx; provider can then settle within the deadline.
	 */
	async close(wallet: Wallet) {
		if (!this.canClose) {
			throw new Error('Cannot close channel in current state');
		}
		if (!wallet.isConnected || !wallet.connection) {
			throw new Error('Wallet not connected');
		}

		this.error = null;
		this.closing = true;
		this.stage = 'closing';
		this.syncStatus = 'Preparing close transaction...';
		let txSubmitted = false;

		try {
			// Get wallet UTxOs + change address
			const [walletUtxos, changeAddress] = await Promise.all([
				wallet.connection.getUtxos(),
				wallet.connection.getChangeAddress()
			]);

			// Build close tx via remote function
			this.syncStatus = 'Building close transaction...';
			const { unsignedTx, deadline } = await buildCloseTx({
				tag: this.tag,
				walletUtxos,
				changeAddress
			});

			// Sign
			this.syncStatus = 'Please sign the transaction in your wallet...';
			const signedTx = await wallet.connection.signTx(unsignedTx, true);

			// Submit
			this.syncStatus = 'Submitting transaction...';
			const txHash = await wallet.connection.submitTx(signedTx);
			txSubmitted = true;

			// Update ref to the new Closed UTxO
			this.ref = { txHash, outputIndex: 0 };

			// Wait for confirmation
			this.syncStatus = 'Waiting for confirmation...';
			await this.waitForUtxoConfirmation(txHash, 60000, 5000);

			// Sync — checkOnChainState() sets stage='closed' + deadline
			this.syncStatus = 'Syncing channel state...';
			await this.syncWithRetry(3, 5000);

			// Store deadline from build response as fallback
			if (!this.deadline) {
				this.deadline = deadline;
			}
			this.persistToStore();

			// Fire-and-forget: trigger provider settle
			settleChannel({ tag: this.tag }).then(
				(res) => console.log('[Channel] Settle triggered:', res.success ? res.txHash : res.error),
				(err) => console.warn('[Channel] Settle trigger failed (non-blocking):', err)
			);

			setTimeout(() => {
				this.syncStatus = '';
			}, 2000);
		} catch (err) {
			this.error = getErrorMessage(err, 'Failed to close channel');

			if (!txSubmitted) {
				// Pre-submit error: revert to open
				this.stage = 'open';
			}
			// Post-submit error: keep 'closing' — next sync() will reconcile

			throw err;
		} finally {
			this.closing = false;
		}
	}

	/**
	 * Withdraws remaining funds from the channel.
	 * Dispatches to End (after settlement) or Expire (after deadline) internally.
	 */
	async withdraw(wallet: Wallet) {
		if (!this.canWithdraw) {
			throw new Error('Cannot withdraw from channel in current state');
		}
		if (!wallet.isConnected || !wallet.connection) {
			throw new Error('Wallet not connected');
		}

		this.error = null;
		this.withdrawing = true;
		this.syncStatus = 'Preparing withdrawal transaction...';

		try {
			const [walletUtxos, changeAddress] = await Promise.all([
				wallet.connection.getUtxos(),
				wallet.connection.getChangeAddress()
			]);

			let unsignedTx: string;

			if (this.stage === 'settled') {
				// End: consumer reclaims after provider settlement
				if (!this.consumerKeyHash) {
					throw new Error('Consumer key hash not available');
				}
				this.syncStatus = 'Building End transaction...';
				const result = await buildEndTx({
					consumerKeyHash: this.consumerKeyHash,
					walletUtxos,
					changeAddress
				});
				unsignedTx = result.unsignedTx;
			} else {
				// Expire: consumer reclaims all funds after deadline
				this.syncStatus = 'Building Expire transaction...';
				const result = await buildExpireTx({
					tag: this.tag,
					walletUtxos,
					changeAddress
				});
				unsignedTx = result.unsignedTx;
			}

			// Sign
			this.syncStatus = 'Please sign the transaction in your wallet...';
			const signedTx = await wallet.connection.signTx(unsignedTx, true);

			// Submit
			this.syncStatus = 'Submitting transaction...';
			await wallet.connection.submitTx(signedTx);

			// Clear channel state — UTxO is destroyed
			this.clearFromStore();
			this.clear();
		} catch (err) {
			this.error = getErrorMessage(err, 'Failed to withdraw');
			throw err;
		} finally {
			this.withdrawing = false;
			setTimeout(() => {
				this.syncStatus = '';
			}, 2000);
		}
	}

	/**
	 * Syncs channel state — dispatches to L2 (open channels) or L1 (closed/settled).
	 * The L2 /info endpoint only has Opened/Suspended stages in LevelDB.
	 * Once closed, only on-chain state (L1) knows the lifecycle stage and deadline.
	 */
	async sync() {
		if (this.stage === 'closed' || this.stage === 'closing' || this.stage === 'settled') {
			await this.checkOnChainState();
			if (!this.tag) return; // cleared by not-found
		} else {
			const previousStage = this.stage;
			await this.fetchFromSubbit();
			// If L2 says Suspended but we were open, verify against L1 (catches false suspensions).
			// Hold the previous stage during verification to prevent a transient
			// open→closed→open flicker that would cascade through $derived state.
			if (
				previousStage === 'open' &&
				(this.stage as ChannelStage) === 'closed' &&
				this.consumerKeyHash
			) {
				this.stage = previousStage;
				await this.checkOnChainState();
				if (!this.tag) return; // cleared by not-found
			}
		}
		this.lastSynced = Date.now();
		this.persistToStore();
	}

	/**
	 * Checks on-chain state directly via L1 endpoint.
	 * Used for closed/settled channels where LevelDB doesn't have the current state.
	 */
	private async checkOnChainState() {
		if (!this.tag || !this.consumerKeyHash) return;

		const result = await getChannelOnChainState({
			tag: this.tag,
			consumerKeyHash: this.consumerKeyHash
		});

		if (result.state === 'closed') {
			this.stage = 'closed';
			this.deadline = result.deadline ?? null;
		} else if (result.state === 'settled') {
			this.stage = 'settled';
		} else if (result.state === 'opened') {
			this.stage = 'open';
		} else if (result.state === 'not-found') {
			// UTxO destroyed — End or Expire already happened (possibly from another session)
			this.clearFromStore();
			this.clear();
			return;
		}

		this.persistToStore();
	}

	/**
	 * Updates state from channel info
	 */
	private updateFromInfo(info: ChannelInfo | SubbitInfoRes) {
		if ('keytag' in info) {
			// Update from SubbitInfoRes (from subbit-man-js)
			// Don't null out ref - it's needed for blockchain operations
			this.stage = mapStage(info.stage);
			if (!this.tag) {
				this.tag = decomposeKeytag(info.keytag).tag;
			}

			// Update all accounting fields
			this.cost = BigInt(info.cost);
			this.iouAmt = BigInt(info.iouAmt);
			this.sub = BigInt(info.sub);
			this.subbitAmt = BigInt(info.subbitAmt);
			this.sig = info.sig;
			return;
		}
	}

	/**
	 * Clears all channel state
	 */
	clear() {
		this.isRestored = false;
		this.pendingSync = false;
		this.clearPendingOpen();
		this.ref = null;
		this.stage = 'opening';
		this.tag = this.generateRandomTag();
		this.keytag = '';
		this.depositAda = this.minDepositAda;
		this.cost = 0n;
		this.iouAmt = 0n;
		this.sub = 0n;
		this.subbitAmt = 0n;
		this.sig = '';
		this.consumerKeyHash = null;
		this.deadline = null;
		this.lastSynced = null;
	}

	/**
	 * Saves full channel entry to ChannelStore
	 */
	saveToStore() {
		if (!this.keytag) return;
		const existing = this.#channelStore.get(this.keytag);
		this.#channelStore.save({
			keytag: this.keytag,
			tag: this.tag,
			publicKeyHex: this.#key.publicKey,
			txHash: this.ref?.txHash ?? '',
			opened_at: existing?.opened_at ?? new Date().toISOString(),
			consumerKeyHash: this.consumerKeyHash ?? undefined,
			stage: this.stage !== 'opening' ? this.stage : undefined,
			deadline: this.deadline ?? undefined,
			lastUsed: new Date().toISOString(),
			network: this.#networkState.current,
			tosVersion: existing?.tosVersion,
			tosHash: existing?.tosHash,
			tosAcceptedAt: existing?.tosAcceptedAt
		});
		this.#channelStore.activeKeytag = this.keytag;
	}

	/**
	 * Persists current lifecycle state to ChannelStore (close/settle updates)
	 */
	private persistToStore() {
		if (!this.keytag) return;
		this.#channelStore.update(this.keytag, {
			stage: this.stage,
			deadline: this.deadline ?? undefined,
			consumerKeyHash: this.consumerKeyHash ?? undefined,
			lastUsed: new Date().toISOString()
		});
	}

	/**
	 * Loads stored channel entry from ChannelStore
	 */
	loadFromStore() {
		if (!this.keytag) return null;
		return this.#channelStore.get(this.keytag);
	}

	/**
	 * Removes channel entry from ChannelStore and clears cached key
	 */
	clearFromStore() {
		if (!this.keytag) return;
		this.#channelStore.remove(this.keytag);
		deleteCachedKey(this.keytag).catch(() => {});
	}

	/**
	 * Gets the next IOU amount for a request
	 * IOUs must be monotonically increasing, so this returns iouAmt + requestCost
	 * @param requestCost - The cost of the current request in lovelace
	 * @returns The IOU amount to use for the next credential
	 */
	getNextIouAmount(requestCost: bigint): bigint {
		return getNextIouAmount(this.cost, this.iouAmt, requestCost);
	}

	// --- Pending open recovery (separate from channelStore to avoid UI side-effects) ---

	private static readonly PENDING_OPEN_KEY = 'orcfax_pending_open';

	/**
	 * Persists minimal recovery info after tx submission, bypassing channelStore
	 * so that storedChannels / activeKeytag / tab switching are NOT triggered.
	 */
	private persistPendingOpen() {
		try {
			localStorage.setItem(
				Channel.PENDING_OPEN_KEY,
				JSON.stringify({
					keytag: this.keytag,
					tag: this.tag,
					txHash: this.ref?.txHash,
					consumerKeyHash: this.consumerKeyHash,
					publicKeyHex: this.#key.publicKey,
					network: this.#networkState.current
				})
			);
		} catch {
			// localStorage full or unavailable — in-session retry still works
		}
	}

	private clearPendingOpen() {
		try {
			localStorage.removeItem(Channel.PENDING_OPEN_KEY);
		} catch {}
	}

	/**
	 * Checks for a pending open from a previous session (browser crash recovery).
	 * Returns true if a pending open was found and state was populated.
	 */
	async resumePendingOpen(): Promise<boolean> {
		let raw: string | null;
		try {
			raw = localStorage.getItem(Channel.PENDING_OPEN_KEY);
		} catch {
			return false;
		}
		if (!raw) return false;

		let pending: {
			keytag: string;
			tag: string;
			txHash: string;
			consumerKeyHash: string;
			publicKeyHex: string;
			network: string;
		};
		try {
			pending = JSON.parse(raw);
		} catch {
			this.clearPendingOpen();
			return false;
		}

		// Only resume if same network
		if (pending.network !== this.#networkState.current) return false;

		// Restore key from IndexedDB cache
		try {
			await this.#key.restoreFromCache(pending.keytag);
		} catch {
			// Key not in cache — can't recover without key file
			this.clearPendingOpen();
			return false;
		}

		// Populate channel state
		this.keytag = pending.keytag;
		this.tag = pending.tag;
		this.ref = { txHash: pending.txHash, outputIndex: 0 };
		this.consumerKeyHash = pending.consumerKeyHash;
		this.pendingSync = true;
		this.error =
			'Channel was created on-chain but sync was interrupted. Click retry to complete setup.';

		return true;
	}
}

export const [getChannelState, setChannelState] = createContext<Channel>();
