<script lang="ts">
	import { getWalletState } from '$lib/wallet/wallet.svelte';
	import { getNetworkState } from '$lib/network.svelte';
	import * as Field from '$lib/components/ui/field/index.js';
	import NetworkSelector from '$lib/components/NetworkSelector.svelte';
	import WalletCardGrid from '$lib/components/WalletCardGrid.svelte';
	import Unplug from '@lucide/svelte/icons/unplug';
	import { track } from '$lib/analytics';

	const wallet = getWalletState();
	const network = getNetworkState();

	let showPicker = $state(false);

	const networkMismatch = $derived(
		wallet.isConnected &&
			wallet.walletNetworkName !== null &&
			wallet.walletNetworkName !== network.current
	);
</script>

<NetworkSelector />

<div class="mt-4">
	<Field.Label class="pb-2">Wallet</Field.Label>

	{#if wallet.isConnected}
		<div class="flex items-center gap-2 text-sm">
			{#if wallet.icon}
				<img src={wallet.icon} alt="" aria-hidden="true" class="h-5 w-5" />
			{/if}
			<span class="font-medium">{wallet.name}</span>
			{#if wallet.version}
				<span class="text-muted-foreground text-xs">{wallet.version}</span>
			{/if}
			<button
				class="text-muted-foreground shrink-0"
				title="Disconnect {wallet.name}"
				onclick={() => {
					wallet.disconnect();
					track('wallet-disconnect');
					showPicker = false;
				}}
			>
				<Unplug class="text-destructive/60 hover:text-destructive h-4 w-4" />
			</button>
		</div>
		{#if networkMismatch}
			<div class="bg-destructive/10 text-destructive my-2 rounded-md px-3 py-2 text-sm">
				Network mismatch: your wallet is on
				<span class="font-semibold">{wallet.walletNetworkName}</span>
				but the app is set to
				<span class="font-semibold">{network.current}</span>. Please switch your wallet or the app
				network above.
			</div>
		{/if}
	{/if}

	{#if !wallet.isConnected && network.current === 'Preview'}
		<p class="text-muted-foreground mt-2 text-sm">
			Need a wallet? Install <a
				href="https://eternl.io"
				target="_blank"
				rel="noreferrer"
				class="text-primary underline dark:text-blue-400">Eternl</a
			>
			(or any CIP-30 wallet), switch it to Preview network, and get test ADA from the
			<a
				href="https://docs.cardano.org/cardano-testnets/tools/faucet"
				target="_blank"
				rel="noreferrer"
				class="text-primary underline dark:text-blue-400">Cardano faucet</a
			>.
		</p>
	{/if}

	{#if !wallet.isConnected || showPicker}
		<div class:mt-3={wallet.isConnected}>
			<WalletCardGrid
				onconnect={() => {
					showPicker = false;
				}}
			/>
		</div>
	{/if}
</div>
