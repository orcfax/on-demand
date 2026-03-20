<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import Spinner from '$lib/components/ui/spinner/spinner.svelte';
	import { getWalletState } from '$lib/wallet/wallet.svelte';
	import { getChannelState } from '$lib/subbit/channel.svelte';
	import { notify } from '$lib/toast';
	import { getErrorMessage } from '$lib/errors';
	import { track } from '$lib/analytics';
	import { EST_NETWORK_FEE_ADA } from '$lib/odapi/pricing';
	import Info from '@lucide/svelte/icons/info';

	interface Props {
		open?: boolean;
	}

	let { open = $bindable(false) }: Props = $props();

	const wallet = getWalletState();
	const channel = getChannelState();

	let amountAda = $state('10');
	let snapshotAvailableAda = $state(0);

	// Snapshot available amount when dialog opens (stays stable during tx)
	$effect(() => {
		if (open && !channel.adding) {
			snapshotAvailableAda = channel.simpleAvailableInAda;
		}
	});

	const amountNumber = $derived(parseFloat(amountAda) || 0);
	const estimatedUpdates = $derived(Math.floor(amountNumber / channel.updateCostAda));
	const estimatedPublishes = $derived(Math.floor(amountNumber / channel.publishCostAda));
	const isValidAmount = $derived(amountNumber >= 1 && amountNumber <= 1_000_000);
	const estTotalFromWallet = $derived(amountNumber + EST_NETWORK_FEE_ADA);
	const newAvailableAda = $derived(snapshotAvailableAda + amountNumber);

	const formatAda = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });

	async function handleAddFunds() {
		if (!isValidAmount) return;

		try {
			await channel.addFunds(wallet, String(amountAda));
			notify.success(`Added ${amountAda} ADA to your channel`);
			track('channel-add-funds', { amount: amountNumber });
			handleOpenChange(false);
		} catch (err) {
			notify.error(getErrorMessage(err, 'Failed to add funds'));
		}
	}

	function handleOpenChange(newOpen: boolean) {
		open = newOpen;
		if (!newOpen) {
			setTimeout(() => {
				amountAda = '10';
				channel.error = null;
				channel.syncStatus = '';
			}, 300);
		}
	}
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
	<Dialog.Overlay class="bg-black/80" />
	<Dialog.Content
		class="max-w-lg"
		showCloseButton={!channel.adding}
		interactOutsideBehavior={channel.adding ? 'ignore' : 'close'}
		escapeKeydownBehavior={channel.adding ? 'ignore' : 'close'}
	>
		<Dialog.Header>
			<Dialog.Title>Add Funds to Channel</Dialog.Title>
			<Dialog.Description>
				Add more ADA to your payment channel to continue making requests.
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4 py-4">
			<Alert>
				<Info />
				<AlertTitle class="pb-2 font-bold">Adding Funds to Your Channel</AlertTitle>
				<AlertDescription class="flex flex-col gap-1">
					<p class="text-sm">
						<strong>Available:</strong>
						{formatAda.format(snapshotAvailableAda)} ADA
					</p>
					<p class="text-sm">
						<strong>New Available:</strong>
						{formatAda.format(newAvailableAda)} ADA
					</p>
					<p class="text-muted-foreground text-xs">
						Added funds become available immediately for making requests. IOUs will be signed
						automatically.
					</p>
				</AlertDescription>
			</Alert>

			<Field.Field orientation="responsive">
				<Field.Label>Amount to Add (Minimum 1 ADA)</Field.Label>
				<Field.Content>
					<Input
						type="number"
						step="0.1"
						bind:value={amountAda}
						disabled={channel.adding}
						placeholder="Enter amount in ADA"
					/>
				</Field.Content>
				<Field.Description class="text-muted-foreground text-xs">
					{#if isValidAmount}
						~{estimatedUpdates.toLocaleString()} fetches or ~{estimatedPublishes.toLocaleString()} publishes
					{:else if amountNumber < 1}
						Amount must be at least 1 ADA
					{:else}
						Amount too large
					{/if}
				</Field.Description>
			</Field.Field>

			<div class="border-border bg-muted/30 space-y-2 rounded-md border p-4 text-sm">
				<p class="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
					Transaction Summary
				</p>

				<div class="flex items-start justify-between">
					<span>Amount to Add</span>
					<span class="font-mono">{formatAda.format(amountNumber)} ADA</span>
				</div>

				<div class="flex items-start justify-between">
					<div>
						<span>Est. Network Fee</span>
						<p class="text-muted-foreground text-xs">Cardano transaction fee (approx.)</p>
					</div>
					<span class="text-muted-foreground font-mono"
						>~{formatAda.format(EST_NETWORK_FEE_ADA)} ADA</span
					>
				</div>

				<hr class="border-border" />

				<div class="flex items-start justify-between font-medium">
					<span>Est. Total from Wallet</span>
					<span class="font-mono">~{formatAda.format(estTotalFromWallet)} ADA</span>
				</div>

				<div class="flex items-start justify-between">
					<span>Current → New Available</span>
					<span class="font-mono">
						{formatAda.format(snapshotAvailableAda)} → {formatAda.format(newAvailableAda)} ADA
					</span>
				</div>
			</div>

			{#if channel.error}
				<p class="text-destructive text-sm">{channel.error}</p>
			{/if}

			<Button class="w-full" onclick={handleAddFunds} disabled={!isValidAmount || channel.adding}>
				{#if channel.adding}
					<Spinner class="mr-2 h-4 w-4" />
					{#if channel.syncStatus}
						{channel.syncStatus}
					{:else}
						Adding Funds...
					{/if}
				{:else}
					Add Funds
				{/if}
			</Button>
		</div>

		<Dialog.Footer>
			{#if channel.adding}
				<p class="text-muted-foreground text-sm">
					Please wait while the transaction is being processed...
				</p>
			{:else}
				<Button variant="outline" onclick={() => handleOpenChange(false)} class="w-full">
					Cancel
				</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
