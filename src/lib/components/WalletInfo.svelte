<script lang="ts">
	import { Collapsible } from 'bits-ui';
	import { getWalletState } from '$lib/wallet/wallet.svelte';
	import { getNetworkState } from '$lib/network.svelte';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import StatusIndicator from '$lib/components/StatusIndicator.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import WalletCardGrid from '$lib/components/WalletCardGrid.svelte';
	import Unplug from '@lucide/svelte/icons/unplug';
	import { track } from '$lib/analytics';

	const wallet = getWalletState();
	const network = getNetworkState();

	const networkMismatch = $derived(
		wallet.isConnected &&
			wallet.walletNetworkName !== null &&
			wallet.walletNetworkName !== network.current
	);
</script>

<Field.Field>
	<Field.Content>
		<Field.Label>
			<div class="flex items-center gap-2">
				<StatusIndicator color={wallet.isConnected ? 'green' : 'red'} size="md" />
				<div class="flex items-center gap-1">
					<span>Wallet</span>
					<span class="text-muted-foreground text-xs font-medium">
						{wallet.isConnected ? 'connected' : 'not connected'}
					</span>
				</div>
			</div>
		</Field.Label>
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
					}}
				>
					<Unplug class="text-destructive/60 hover:text-destructive h-4 w-4" />
				</button>
			</div>
			{#if networkMismatch}
				<div class="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-xs">
					Wallet is on <span class="font-semibold">{wallet.walletNetworkName}</span>, app is set to
					<span class="font-semibold">{network.current}</span>.
				</div>
			{/if}
			<Collapsible.Root>
				<Collapsible.Trigger class="text-muted-foreground text-xs underline">
					View details
				</Collapsible.Trigger>
				<Collapsible.Content class="space-y-2 pt-2 text-xs">
					<p><strong>Network:</strong> {await wallet.getNetworkName()}</p>
					<p><strong>Balance:</strong> {await wallet.getAdaBalance()}</p>
					{#if wallet.connection}
						<p class="font-semibold">Addresses</p>
						<ul class="space-y-1">
							{#await wallet.connection.getUsedAddresses() then addresses}
								{#if addresses?.length}
									{#each addresses as address (address)}
										<li class="truncate" title={address}>{address}</li>
									{/each}
								{:else}
									<li>No addresses found.</li>
								{/if}
							{/await}
						</ul>
					{/if}
				</Collapsible.Content>
			</Collapsible.Root>
		{:else}
			<Button class="h-8" onclick={() => wallet.togglePicker()}>Connect Wallet</Button>
		{/if}

		<Dialog.Root bind:open={wallet.walletPickerOpen}>
			<Dialog.Content class="max-w-md">
				<Dialog.Header>
					<Dialog.Title>
						{wallet.isConnected ? 'Change Wallet' : 'Connect Wallet'}
					</Dialog.Title>
					<Dialog.Description>Select a wallet to connect.</Dialog.Description>
				</Dialog.Header>
				<WalletCardGrid
					onconnect={() => {
						wallet.walletPickerOpen = false;
					}}
				/>
			</Dialog.Content>
		</Dialog.Root>
	</Field.Content>
</Field.Field>
