import { createContext } from 'svelte';
import { localStore } from '$lib/localStore.svelte';
import { SvelteSet } from 'svelte/reactivity';

export type Network = 'Preview' | 'Mainnet';

const NETWORKS: Network[] = ['Preview', 'Mainnet'];

export class NetworkState {
	readonly available: Network[] = NETWORKS;
	readonly #selectable: Set<Network>;
	#store = localStore<Network>('orcfax_selected_network', 'Preview');

	constructor(mainnetEnabled: boolean) {
		this.#selectable = new SvelteSet<Network>(mainnetEnabled ? NETWORKS : ['Preview']);
	}

	get current(): Network {
		return this.#store.value;
	}

	set current(network: Network) {
		this.#store.value = network;
		this.#store.save();
	}

	isSelectable(network: Network): boolean {
		return this.#selectable.has(network);
	}
}

export const [getNetworkState, setNetworkState] = createContext<NetworkState>();
