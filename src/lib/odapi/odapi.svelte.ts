import { createContext } from 'svelte';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { getErrorMessage } from '$lib/errors';
import { getAuthKeyState, type AuthKey } from '$lib/subbit/authKey.svelte';
import { getChannelState, type Channel } from '$lib/subbit/channel.svelte';
import { createIouCredential } from '$lib/subbit/credential';
import { getPrices } from './prices.remote';
import { publishPrices } from './publish.remote';
import { getFeeds } from './feeds.remote';
import { PRICE_REQUEST_COST, PUBLISH_REQUEST_COST, CHANNEL_RESERVE } from './pricing';
import { extractFeedIdFromDatum, datumToPrice, formatTimestamp } from './utils';
import type {
	SubbitPriceValue,
	GetSubbitPricesResponse,
	PublishSubbitResponse,
	PublishDatum
} from './types';

/**
 * Stored price update entry (persisted to IndexedDB)
 */
export interface StoredPriceUpdate {
	id?: number;
	channelTag: string;
	feedId: string;
	value: string;
	timestamp: number;
	updatedAt: string;
	published?: boolean;
	txId?: string;
	archiveId?: string;
}

/**
 * Feed data for table display
 */
export interface FeedData {
	feedId: string;
	price?: number;
	lastUpdated?: Date;
	isUpdating: boolean;
	isPublishing: boolean;
	isPublished: boolean;
}

/**
 * Options for publish operations
 */
export interface PublishOptions {
	allFeeds?: boolean;
}

/**
 * Reactive ODAPI client class - Svelte 5 class for interacting with ODAPI
 * Manages feeds, prices, publishing, and local persistence
 */
export class ODAPI {
	// Dependencies
	#key: AuthKey;
	#channel: Channel;

	// State
	feeds = $state.raw<string[]>([]);
	updatingFeeds = new SvelteSet<string>();
	publishingFeeds = new SvelteSet<string>();
	feedHistoryMap = new SvelteMap<string, StoredPriceUpdate[]>();
	feedHistoryLoaded = new Set<string>(); // Track which feeds have full history loaded
	feedHistoryCounts = new SvelteMap<string, number>(); // Total count of history records per feed
	error = $state<string | null>(null);
	#nextTempId = -1; // Negative IDs for in-memory records not yet persisted to IndexedDB

	// UI state
	loading = $state(false);
	syncing = $state(false);
	selectedCount = $state(0);

	// IndexedDB configuration
	private readonly DB_NAME = 'odapi-price-updates';
	private readonly STORE_NAME = 'updates';
	private readonly DB_VERSION = 2;

	constructor() {
		this.#key = getAuthKeyState();
		this.#channel = getChannelState();
	}

	// ==================== Initialization ====================

	/**
	 * Initialize ODAPI - fetches feeds list and loads stored updates from IndexedDB
	 */
	async initialize() {
		// Reset in-memory state to prevent stale data from previous channel
		this.feedHistoryMap.clear();
		this.feedHistoryCounts.clear();
		this.feedHistoryLoaded.clear();

		try {
			this.loading = true;
			this.error = null;
			// Fetch the list of available feeds from the validator
			await this.fetchFeeds();
			// Load stored price history from IndexedDB before showing the table
			await this.loadStoredUpdates();
		} catch (err) {
			this.error = getErrorMessage(err, 'Failed to initialize ODAPI');
			console.error('ODAPI initialization error:', err);
		} finally {
			this.loading = false;
		}
	}

	/**
	 * Fetch available feeds from the validator and update the feeds list
	 */
	async fetchFeeds() {
		try {
			console.log('[ODAPI] Fetching feeds...');
			const feedIds = await getFeeds();
			console.log('[ODAPI] Feeds received:', feedIds);
			this.setFeeds(feedIds);
		} catch (err) {
			throw new Error(`Failed to fetch feeds: ${getErrorMessage(err, 'Unknown error')}`);
		}
	}

	// ==================== Derived State ====================

	/**
	 * Feed data for table display — $state array with controlled updates.
	 * Entry properties are mutated directly, then notifyTableChanged() creates
	 * a shallow copy to give TanStack Table a new array reference. This batches
	 * multiple property mutations into a single table rebuild.
	 */
	feedData = $state<FeedData[]>([]);

	/**
	 * Check if any feed is currently updating
	 */
	isAnyFeedUpdating = $derived(this.updatingFeeds.size > 0);

	/**
	 * Check if any feed is currently publishing
	 */
	isAnyFeedPublishing = $derived(this.publishingFeeds.size > 0);

	/**
	 * Whether the channel is open and has sufficient funds for a price update.
	 * Uses simple available balance (subbitAmt - cost - reserve) to stay
	 * consistent with the balance the UI displays.
	 */
	canUpdate = $derived.by(() => {
		const available = this.#channel.subbitAmt - this.#channel.cost - CHANNEL_RESERVE;
		return this.#channel.isOpen && available >= PRICE_REQUEST_COST;
	});

	/**
	 * Whether the channel is open and has sufficient funds for a publish.
	 * Uses simple available balance (subbitAmt - cost - reserve) to stay
	 * consistent with the balance the UI displays.
	 */
	canPublish = $derived.by(() => {
		const available = this.#channel.subbitAmt - this.#channel.cost - CHANNEL_RESERVE;
		return this.#channel.isOpen && available >= PUBLISH_REQUEST_COST;
	});

	/**
	 * Whether the channel can afford updates for the currently selected feeds.
	 * Uses the simple available balance (subbitAmt - cost - reserve) to match the UI display.
	 */
	canAffordUpdates = $derived.by(() => {
		const available = this.#channel.subbitAmt - this.#channel.cost - CHANNEL_RESERVE;
		return this.#channel.isOpen && available >= PRICE_REQUEST_COST * BigInt(this.selectedCount);
	});

	/**
	 * Whether the channel can afford publishes for the currently selected feeds.
	 * Uses the simple available balance (subbitAmt - cost - reserve) to match the UI display.
	 */
	canAffordPublishes = $derived.by(() => {
		const available = this.#channel.subbitAmt - this.#channel.cost - CHANNEL_RESERVE;
		return this.#channel.isOpen && available >= PUBLISH_REQUEST_COST * BigInt(this.selectedCount);
	});

	// ==================== Feed Management ====================

	/**
	 * Set the list of available feeds
	 */
	setFeeds(feeds: string[]) {
		this.feeds = feeds;
		this.feedData = feeds.map((feedId) => ({
			feedId,
			price: undefined,
			lastUpdated: undefined,
			isUpdating: false,
			isPublishing: false,
			isPublished: false
		}));
	}

	/**
	 * Get history for a specific feed
	 */
	getFeedHistory(feedId: string): StoredPriceUpdate[] {
		return this.feedHistoryMap.get(feedId) ?? [];
	}

	// ==================== Price Operations ====================

	/**
	 * Get current price for one or more feeds (always uses credentials)
	 * @param feedIds - Single feed ID, array of feed IDs, or null for all feeds
	 * @returns Price response from ODAPI
	 */
	async getPrice(feedIds: string | string[] | null): Promise<GetSubbitPricesResponse> {
		this.error = null;

		try {
			let credential: string | undefined;

			// Create IOU credential if channel is available
			if (this.#key.isLoaded && this.#channel.tag) {
				const iouAmount = this.#channel.getNextIouAmount(PRICE_REQUEST_COST);
				const iou = await createIouCredential(this.#key.privateKey, this.#channel.tag, iouAmount);
				credential = iou.toB64();
			}

			// Make API request
			const response = credential
				? await getPrices({ feedIds, credential })
				: await getPrices(feedIds);

			// Process and store results
			if (response.status === 'ok' && response.prices.length > 0) {
				for (const priceEntry of response.prices) {
					for (const [feedId, priceValue] of Object.entries(priceEntry)) {
						await this.storePriceUpdate(feedId, priceValue, false);
					}
				}

				// Sync channel after authenticated request
				if (credential && this.#key.isLoaded && this.#channel.tag) {
					try {
						await this.#channel.sync();
					} catch (err) {
						console.warn('Failed to sync channel after authenticated request:', err);
					}
				}
			}

			return response;
		} catch (err) {
			this.error = getErrorMessage(err, 'Failed to get price');
			throw err;
		}
	}

	/**
	 * Update price for a specific feed (with UI state tracking)
	 * @param feedId - The feed to update
	 */
	async updateFeedPrice(feedId: string): Promise<void> {
		if (!this.canUpdate)
			throw new Error('Insufficient funds to fetch price. Please add funds to your channel.');
		this.setFeedUpdating(feedId, true);
		this.error = null;

		try {
			await this.getPrice(feedId);
		} catch (err) {
			this.error = getErrorMessage(err, 'Failed to fetch feed price');
			throw err;
		} finally {
			this.setFeedUpdating(feedId, false);
		}
	}

	/**
	 * Update prices for multiple feeds
	 * @param feedIds - Array of feed IDs to update
	 */
	async updateMultipleFeedPrices(feedIds: string[]): Promise<void> {
		feedIds.forEach((feedId) => this.setFeedUpdating(feedId, true));
		this.error = null;

		try {
			await this.getPrice(feedIds);
		} catch (err) {
			this.error = getErrorMessage(err, 'Failed to fetch feed prices');
			throw err;
		} finally {
			feedIds.forEach((feedId) => this.setFeedUpdating(feedId, false));
		}
	}

	// ==================== Publish Operations ====================

	/**
	 * Publish prices for one or more feeds on-chain (always uses credentials)
	 * @param feedIds - Single feed ID, array of feed IDs, or null
	 * @param options - Optional configuration
	 * @returns Publish response from ODAPI
	 */
	async publish(
		feedIds: string | string[] | null,
		options: PublishOptions = {}
	): Promise<PublishSubbitResponse> {
		const { allFeeds = false } = options;

		this.error = null;

		try {
			let credential: string | undefined;

			// Create IOU credential if channel is available
			if (this.#key.isLoaded && this.#channel.tag) {
				const iouAmount = this.#channel.getNextIouAmount(PUBLISH_REQUEST_COST);
				const iou = await createIouCredential(this.#key.privateKey, this.#channel.tag, iouAmount);
				credential = iou.toB64();
			}

			// Make API request
			const response = await publishPrices({ feedIds, credential, allFeeds });

			// Process and store results
			if (response.status === 'ok' && response.datum.length > 0) {
				for (const datumEntry of response.datum) {
					const feedId = extractFeedIdFromDatum(datumEntry.datum.feed_id);
					if (feedId) {
						const { numerator, denominator } = datumEntry.datum.body;
						const priceValue = datumToPrice(numerator, denominator, datumEntry.datum.created_at);
						await this.storePriceUpdate(feedId, priceValue, true, datumEntry);
					}
				}

				// Sync channel after authenticated request
				if (credential && this.#key.isLoaded && this.#channel.tag) {
					try {
						await this.#channel.sync();
					} catch (err) {
						console.warn('Failed to sync channel after publish:', err);
					}
				}
			}

			return response;
		} catch (err) {
			this.error = getErrorMessage(err, 'Failed to publish');
			throw err;
		}
	}

	/**
	 * Publish price for a specific feed (with UI state tracking)
	 * @param feedId - The feed to publish
	 * @param options - Optional configuration
	 */
	async publishFeedPrice(feedId: string, options: PublishOptions = {}): Promise<void> {
		if (!this.canPublish)
			throw new Error('Insufficient funds to publish. Please add funds to your channel.');
		this.setFeedPublishing(feedId, true);
		this.error = null;

		try {
			await this.publish(feedId, options);
		} catch (err) {
			this.error = getErrorMessage(err, 'Failed to publish feed price');
			throw err;
		} finally {
			this.setFeedPublishing(feedId, false);
		}
	}

	/**
	 * Publish prices for multiple feeds
	 * @param feedIds - Array of feed IDs to publish
	 * @param options - Optional configuration
	 */
	async publishMultipleFeedPrices(feedIds: string[], options: PublishOptions = {}): Promise<void> {
		feedIds.forEach((feedId) => this.setFeedPublishing(feedId, true));
		this.error = null;

		try {
			await this.publish(feedIds, options);
		} catch (err) {
			this.error = getErrorMessage(err, 'Failed to publish feed prices');
			throw err;
		} finally {
			feedIds.forEach((feedId) => this.setFeedPublishing(feedId, false));
		}
	}

	// ==================== Persistence (IndexedDB) ====================

	/**
	 * Open IndexedDB database (with timeout to prevent indefinite hangs)
	 */
	private openDb(): Promise<IDBDatabase> {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error('IndexedDB open timed out'));
			}, 5000);

			const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
			request.onupgradeneeded = (event) => {
				const db = request.result;
				const oldVersion = (event as IDBVersionChangeEvent).oldVersion;

				if (oldVersion < 1) {
					// Fresh install: create store with all indexes
					const store = db.createObjectStore(this.STORE_NAME, {
						keyPath: 'id',
						autoIncrement: true
					});
					store.createIndex('feedId', 'feedId', { unique: false });
					store.createIndex('timestamp', 'timestamp', { unique: false });
					store.createIndex('channelTag', 'channelTag', { unique: false });
				} else if (oldVersion < 2) {
					// Upgrade v1→v2: add channelTag index to existing store
					const store = request.transaction!.objectStore(this.STORE_NAME);
					store.createIndex('channelTag', 'channelTag', { unique: false });
				}
			};
			request.onsuccess = () => {
				clearTimeout(timeout);
				resolve(request.result);
			};
			request.onerror = () => {
				clearTimeout(timeout);
				reject(request.error);
			};
			request.onblocked = () => {
				clearTimeout(timeout);
				reject(new Error('IndexedDB blocked by another connection'));
			};
		});
	}

	/**
	 * Store a price update in IndexedDB and update state
	 */
	private async storePriceUpdate(
		feedId: string,
		priceValue: SubbitPriceValue,
		published: boolean,
		datumEntry?: PublishDatum
	): Promise<void> {
		const update: StoredPriceUpdate = {
			channelTag: this.#channel.tag,
			feedId,
			value: priceValue.value,
			timestamp: priceValue.timestamp,
			updatedAt: new Date(priceValue.timestamp * 1000).toISOString(),
			published,
			txId: datumEntry?.tx_md.id,
			archiveId: datumEntry?.tx_md.src
		};

		// Update in-memory state
		this.addToHistory(update);

		// Update history count
		const currentCount = this.feedHistoryCounts.get(feedId) ?? 0;
		this.feedHistoryCounts.set(feedId, currentCount + 1);

		// Persist to IndexedDB
		if (typeof window === 'undefined' || !('indexedDB' in window)) {
			return;
		}

		try {
			const db = await this.openDb();
			const tx = db.transaction(this.STORE_NAME, 'readwrite');
			const request = tx.objectStore(this.STORE_NAME).add(update);
			await new Promise<void>((resolve, reject) => {
				request.onsuccess = () => resolve();
				request.onerror = () => reject(request.error);
				tx.onerror = () => reject(tx.error);
			});
		} catch (err) {
			console.warn('Failed to persist price update to IndexedDB:', err);
		}
	}

	/**
	 * Load only the most recent stored update for each feed from IndexedDB
	 */
	async loadStoredUpdates(): Promise<void> {
		if (typeof window === 'undefined' || !('indexedDB' in window)) {
			return;
		}

		try {
			const currentTag = this.#channel.tag;
			console.log(`[ODAPI] Loading stored updates from IndexedDB for channel ${currentTag}...`);
			const db = await this.openDb();
			const tx = db.transaction(this.STORE_NAME, 'readonly');
			const store = tx.objectStore(this.STORE_NAME);
			const channelTagIndex = store.index('channelTag');

			// Query only records matching the active channel tag
			const allUpdates = await new Promise<StoredPriceUpdate[]>((resolve, reject) => {
				const request = channelTagIndex.getAll(currentTag);
				request.onsuccess = () => resolve(request.result as StoredPriceUpdate[]);
				request.onerror = () => reject(request.error);
			});

			console.log(
				`[ODAPI] IndexedDB: ${allUpdates.length} stored updates for channel ${currentTag}`
			);

			const historyMap = new Map<string, StoredPriceUpdate[]>();
			const feedSet = new Set(this.feeds);

			// Group records by feedId
			const grouped = new Map<string, StoredPriceUpdate[]>();
			for (const update of allUpdates) {
				if (!feedSet.has(update.feedId)) continue;
				const list = grouped.get(update.feedId) ?? [];
				list.push(update);
				grouped.set(update.feedId, list);
			}

			// For each feed, keep only the most recent
			for (const feedId of this.feeds) {
				const updates = grouped.get(feedId) ?? [];
				this.feedHistoryCounts.set(feedId, updates.length);

				if (updates.length > 0) {
					const sorted = updates.sort((a, b) => b.timestamp - a.timestamp);
					historyMap.set(feedId, [sorted[0]]);
					const entry = this.feedData.find((f) => f.feedId === feedId);
					if (entry) {
						entry.price = parseFloat(sorted[0].value);
						entry.lastUpdated = new Date(sorted[0].timestamp * 1000);
						entry.isPublished = sorted[0].published ?? false;
					}
				} else {
					historyMap.set(feedId, []);
				}
			}

			this.feedHistoryMap.clear();
			for (const [k, v] of historyMap) {
				this.feedHistoryMap.set(k, v);
			}
			this.notifyTableChanged();
			console.log(
				'[ODAPI] IndexedDB history loaded:',
				Object.fromEntries([...historyMap.entries()].map(([k, v]) => [k, v.length]))
			);
		} catch (err) {
			console.warn('Failed to load stored updates from IndexedDB:', err);
		}
	}

	/**
	 * Load full history for a specific feed from IndexedDB
	 * @param feedId - The feed ID to load history for
	 */
	async loadFeedHistory(feedId: string): Promise<void> {
		// Don't reload if already loaded
		if (this.feedHistoryLoaded.has(feedId)) {
			return;
		}

		if (typeof window === 'undefined' || !('indexedDB' in window)) {
			return;
		}

		try {
			const currentTag = this.#channel.tag;
			const db = await this.openDb();
			const tx = db.transaction(this.STORE_NAME, 'readonly');
			const store = tx.objectStore(this.STORE_NAME);
			const channelTagIndex = store.index('channelTag');

			// Query by channel tag, then filter by feedId in memory
			const channelUpdates = await new Promise<StoredPriceUpdate[]>((resolve, reject) => {
				const request = channelTagIndex.getAll(currentTag);
				request.onsuccess = () => resolve(request.result as StoredPriceUpdate[]);
				request.onerror = () => reject(request.error);
			});

			const updates = channelUpdates.filter((u) => u.feedId === feedId);

			if (updates.length > 0) {
				// Sort by timestamp (latest first)
				const sorted = updates.sort((a, b) => b.timestamp - a.timestamp);
				this.feedHistoryMap.set(feedId, sorted);
			}

			// Mark this feed's history as loaded
			this.feedHistoryLoaded.add(feedId);
		} catch (err) {
			console.warn(`Failed to load history for feed ${feedId} from IndexedDB:`, err);
		}
	}

	/**
	 * Check if a feed has expandable history
	 * @param feedId - The feed ID to check
	 * @returns true if the feed has more than one history entry
	 */
	hasExpandableHistory(feedId: string): boolean {
		const totalCount = this.feedHistoryCounts.get(feedId) ?? 0;
		return totalCount > 1;
	}

	/**
	 * Clear stored updates for a specific channel from IndexedDB
	 */
	async clearStoredUpdatesForChannel(channelTag: string): Promise<void> {
		if (typeof window === 'undefined' || !('indexedDB' in window)) {
			return;
		}

		try {
			const db = await this.openDb();
			const tx = db.transaction(this.STORE_NAME, 'readwrite');
			const store = tx.objectStore(this.STORE_NAME);
			const index = store.index('channelTag');

			await new Promise<void>((resolve, reject) => {
				const request = index.openCursor(channelTag);
				request.onsuccess = () => {
					const cursor = request.result;
					if (cursor) {
						cursor.delete();
						cursor.continue();
					} else {
						resolve();
					}
				};
				request.onerror = () => reject(request.error);
			});

			// Reset in-memory maps and feedData for affected feeds
			this.feedHistoryLoaded.clear();
			for (const feedId of this.feeds) {
				this.feedHistoryMap.set(feedId, []);
				this.feedHistoryCounts.set(feedId, 0);
				const entry = this.feedData.find((f) => f.feedId === feedId);
				if (entry) {
					entry.price = undefined;
					entry.lastUpdated = undefined;
					entry.isPublished = false;
				}
			}
			this.notifyTableChanged();
		} catch (err) {
			console.warn('Failed to clear stored updates for channel:', err);
		}
	}

	/**
	 * Get all stored updates for a specific channel from IndexedDB
	 */
	async getStoredUpdatesForChannel(channelTag: string): Promise<StoredPriceUpdate[]> {
		if (typeof window === 'undefined' || !('indexedDB' in window)) {
			return [];
		}

		try {
			const db = await this.openDb();
			const tx = db.transaction(this.STORE_NAME, 'readonly');
			const store = tx.objectStore(this.STORE_NAME);
			const index = store.index('channelTag');

			return await new Promise<StoredPriceUpdate[]>((resolve, reject) => {
				const request = index.getAll(channelTag);
				request.onsuccess = () => resolve(request.result as StoredPriceUpdate[]);
				request.onerror = () => reject(request.error);
			});
		} catch (err) {
			console.warn('Failed to get stored updates for channel:', err);
			return [];
		}
	}

	/**
	 * Import stored updates into IndexedDB for the current channel.
	 * Strips `id` from each record (IDB auto-increments), writes all records
	 * in a single transaction, then reloads stored updates to refresh state.
	 */
	async importStoredUpdates(
		updates: StoredPriceUpdate[]
	): Promise<{ added: number; skipped: number }> {
		if (!updates.length || typeof window === 'undefined' || !('indexedDB' in window)) {
			return { added: 0, skipped: 0 };
		}

		const db = await this.openDb();

		// Phase 1: Load existing keys for this channel
		const existingKeys = new Set<string>();
		const readTx = db.transaction(this.STORE_NAME, 'readonly');
		const existing = await new Promise<StoredPriceUpdate[]>((resolve, reject) => {
			const req = readTx
				.objectStore(this.STORE_NAME)
				.index('channelTag')
				.getAll(updates[0].channelTag);
			req.onsuccess = () => resolve(req.result as StoredPriceUpdate[]);
			req.onerror = () => reject(req.error);
		});
		for (const rec of existing) {
			existingKeys.add(`${rec.channelTag}|${rec.feedId}|${rec.timestamp}`);
		}

		// Phase 2: Write only new records
		let added = 0,
			skipped = 0;
		const writeTx = db.transaction(this.STORE_NAME, 'readwrite');
		const store = writeTx.objectStore(this.STORE_NAME);
		for (const update of updates) {
			const { id: _, ...record } = update;
			const key = `${record.channelTag}|${record.feedId}|${record.timestamp}`;
			if (existingKeys.has(key)) {
				skipped++;
			} else {
				store.add(record);
				existingKeys.add(key);
				added++;
			}
		}
		await new Promise<void>((resolve, reject) => {
			writeTx.oncomplete = () => resolve();
			writeTx.onerror = () => reject(writeTx.error);
		});

		// Reload in-memory state from IDB
		this.feedHistoryLoaded.clear();
		await this.loadStoredUpdates();
		return { added, skipped };
	}

	/**
	 * Clear all stored updates from IndexedDB
	 */
	async clearStoredUpdates(): Promise<void> {
		if (typeof window === 'undefined' || !('indexedDB' in window)) {
			return;
		}

		try {
			const db = await this.openDb();
			const tx = db.transaction(this.STORE_NAME, 'readwrite');
			await new Promise<void>((resolve, reject) => {
				const request = tx.objectStore(this.STORE_NAME).clear();
				request.onsuccess = () => resolve();
				request.onerror = () => reject(request.error);
			});

			this.feedHistoryMap.clear();
			this.feedHistoryCounts.clear();
			this.feedHistoryLoaded.clear();
			this.feeds.forEach((feedId) => {
				this.feedHistoryMap.set(feedId, []);
				this.feedHistoryCounts.set(feedId, 0);
			});
			// Reset feedData entries
			for (const entry of this.feedData) {
				entry.price = undefined;
				entry.lastUpdated = undefined;
				entry.isPublished = false;
			}
			this.notifyTableChanged();
		} catch (err) {
			console.warn('Failed to clear stored updates from IndexedDB:', err);
		}
	}

	// ==================== Internal State Management ====================

	/**
	 * Shallow-copy feedData to create a new array reference, triggering
	 * TanStack Table to rebuild its row model with current entry values.
	 * Call once after all entry mutations are done to batch into a single rebuild.
	 */
	private notifyTableChanged() {
		this.feedData = [...this.feedData];
	}

	/**
	 * Set updating state for a feed
	 */
	private setFeedUpdating(feedId: string, value: boolean) {
		if (value) {
			if (!this.updatingFeeds.has(feedId)) this.updatingFeeds.add(feedId);
		} else {
			if (this.updatingFeeds.has(feedId)) this.updatingFeeds.delete(feedId);
		}
		const entry = this.feedData.find((f) => f.feedId === feedId);
		if (entry) entry.isUpdating = value;
		this.notifyTableChanged();
	}

	/**
	 * Set publishing state for a feed
	 */
	private setFeedPublishing(feedId: string, value: boolean) {
		if (value) {
			if (!this.publishingFeeds.has(feedId)) this.publishingFeeds.add(feedId);
		} else {
			if (this.publishingFeeds.has(feedId)) this.publishingFeeds.delete(feedId);
		}
		const entry = this.feedData.find((f) => f.feedId === feedId);
		if (entry) entry.isPublishing = value;
		this.notifyTableChanged();
	}

	/**
	 * Add an update to feed history
	 */
	private addToHistory(update: StoredPriceUpdate) {
		if (update.id == null) update.id = this.#nextTempId--;
		const existing = this.feedHistoryMap.get(update.feedId) ?? [];
		this.feedHistoryMap.set(
			update.feedId,
			[update, ...existing].sort((a, b) => b.timestamp - a.timestamp)
		);

		// Update feedData entry directly — granular proxy mutation
		const entry = this.feedData.find((f) => f.feedId === update.feedId);
		if (entry) {
			entry.price = parseFloat(update.value);
			entry.lastUpdated = new Date(update.timestamp * 1000);
			entry.isPublished = update.published ?? false;
		}
	}

	// ==================== Utility Methods ====================

	/**
	 * Format timestamp for display (delegates to extracted util)
	 */
	formatTimestamp(timestamp: number): string {
		return formatTimestamp(timestamp);
	}

	/**
	 * Clear error state
	 */
	clearError() {
		this.error = null;
	}
}

// ==================== Context Management ====================

export const [getODAPIState, setODAPIState] = createContext<ODAPI>();
