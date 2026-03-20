import { createContext } from 'svelte';
import { localStore } from '$lib/localStore.svelte';

export interface StoredChannelEntry {
	keytag: string;
	tag: string;
	publicKeyHex: string;
	txHash: string;
	opened_at: string;
	consumerKeyHash?: string;
	stage?: string;
	deadline?: number;
	lastUsed: string;
	network: string;
	tosVersion?: string;
	tosHash?: string;
	tosAcceptedAt?: string;
}

export class ChannelStore {
	#channels = localStore<Record<string, StoredChannelEntry>>('orcfax_subbit_channels', {});
	#activeKeytag = localStore<string | null>('orcfax_active_channel', null);

	get activeKeytag(): string | null {
		return this.#activeKeytag.value;
	}

	set activeKeytag(keytag: string | null) {
		this.#activeKeytag.value = keytag;
		this.#activeKeytag.save();
	}

	save(entry: StoredChannelEntry) {
		this.#channels.value = { ...this.#channels.value, [entry.keytag]: entry };
		this.#channels.save();
	}

	update(keytag: string, partial: Partial<StoredChannelEntry>) {
		const existing = this.#channels.value[keytag];
		if (!existing) return;
		this.#channels.value = {
			...this.#channels.value,
			[keytag]: { ...existing, ...partial }
		};
		this.#channels.save();
	}

	remove(keytag: string) {
		const { [keytag]: _, ...rest } = this.#channels.value;
		this.#channels.value = rest;
		this.#channels.save();
		if (this.#activeKeytag.value === keytag) {
			this.activeKeytag = null;
		}
	}

	get(keytag: string): StoredChannelEntry | null {
		return this.#channels.value[keytag] ?? null;
	}

	entriesForNetwork(network: string): StoredChannelEntry[] {
		return Object.values(this.#channels.value)
			.filter((e) => e.network === network)
			.sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime());
	}
}

export const [getChannelStoreState, setChannelStoreState] = createContext<ChannelStore>();
