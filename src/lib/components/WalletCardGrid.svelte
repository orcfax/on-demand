<script lang="ts">
	import { getWalletState } from '$lib/wallet/wallet.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import Spinner from '$lib/components/ui/spinner/spinner.svelte';
	import PlugZap from '@lucide/svelte/icons/plug-zap';
	import { notify } from '$lib/toast';
	import { track, identify } from '$lib/analytics';
	import { getNetworkState } from '$lib/network.svelte';

	let { onconnect }: { onconnect?: () => void } = $props();

	const wallet = getWalletState();
	const network = getNetworkState();
</script>

{#if wallet.walletsLoading}
	<div class="grid grid-cols-2 gap-2">
		{#each { length: 4 }}
			<Skeleton class="h-14 rounded-lg" />
		{/each}
	</div>
{:else if wallet.availableWallets.length === 0}
	<div class="py-4 text-center">
		<p class="text-muted-foreground text-sm">
			No wallets detected. Please install a Cardano wallet extension.
		</p>
		<button
			class="text-muted-foreground hover:text-foreground mt-2 text-xs underline"
			onclick={() => wallet.loadAvailableWallets()}
		>
			Refresh
		</button>
	</div>
{:else}
	<div class="grid grid-cols-2 gap-2">
		{#each wallet.availableWallets as w (w.name)}
			<button
				class="border-border hover:bg-accent flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:pointer-events-none disabled:opacity-50"
				disabled={wallet.connecting}
				title="Connect {w.name}"
				onclick={async () => {
					await wallet.connect(w);
					if (wallet.isConnected) {
						const changeAddress = await wallet.connection!.getChangeAddress();
						identify(changeAddress, { wallet: w.name, network: network.current });
						notify.success(`Connected to ${wallet.name}`);
						track('wallet-connect', { wallet: w.name });
						track('onboarding-step', { step: 'wallet' });
						onconnect?.();
					} else if (wallet.error) {
						notify.error(wallet.error);
					}
				}}
			>
				{#if wallet.connectingName === w.name}
					<Spinner class="h-7 w-7 shrink-0" />
				{:else}
					<img src={w.icon} alt="" aria-hidden="true" class="h-7 w-7 shrink-0 rounded" />
				{/if}
				<span class="flex-1 text-sm font-medium">{w.name}</span>
				<PlugZap class="text-muted-foreground hover:text-foreground h-5 w-5 shrink-0" />
			</button>
		{/each}
	</div>
	<button
		class="text-muted-foreground hover:text-foreground mt-2 text-xs underline"
		onclick={() => wallet.loadAvailableWallets()}
	>
		Refresh wallets
	</button>
{/if}
{#if wallet.error && !wallet.connecting}
	<p class="text-destructive mt-2 text-sm">{wallet.error}</p>
{/if}
