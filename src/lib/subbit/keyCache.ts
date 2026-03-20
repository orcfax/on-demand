/**
 * Plaintext key cache in IndexedDB.
 * Opt-in storage so returning users can auto-restore without re-uploading their key file.
 * No encryption — mirrors the security posture of the unencrypted JSON key file on disk.
 */

interface CachedKey {
	keytag: string;
	privateKeyHex: string;
	createdAt: string;
}

const DB_NAME = 'orcfax-key-cache';
const DB_VERSION = 1;
const STORE_NAME = 'keys';

/** SSR-safe check for IndexedDB availability */
export function isCacheSupported(): boolean {
	return typeof window !== 'undefined' && 'indexedDB' in window;
}

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(new Error('IndexedDB open timed out'));
		}, 5000);

		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME, { keyPath: 'keytag' });
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

/** Store a key in the cache */
export async function cacheKey(keytag: string, privateKeyHex: string): Promise<void> {
	const db = await openDb();
	const entry: CachedKey = { keytag, privateKeyHex, createdAt: new Date().toISOString() };
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		const store = tx.objectStore(STORE_NAME);
		const request = store.put(entry);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}

/** Retrieve a cached private key hex, or null if not found */
export async function getCachedKey(keytag: string): Promise<string | null> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readonly');
		const request = tx.objectStore(STORE_NAME).get(keytag);
		request.onsuccess = () => {
			const result = request.result as CachedKey | undefined;
			resolve(result?.privateKeyHex ?? null);
		};
		request.onerror = () => reject(request.error);
	});
}

/** Check whether a cached key exists for this keytag */
export async function hasCachedKey(keytag: string): Promise<boolean> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readonly');
		const request = tx.objectStore(STORE_NAME).count(keytag);
		request.onsuccess = () => resolve(request.result > 0);
		request.onerror = () => reject(request.error);
	});
}

/** Remove a cached key */
export async function deleteCachedKey(keytag: string): Promise<void> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		const request = tx.objectStore(STORE_NAME).delete(keytag);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}
