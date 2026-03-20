<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import Spinner from '$lib/components/ui/spinner/spinner.svelte';
	import { getWalletState } from '$lib/wallet/wallet.svelte';
	import { getChannelState } from '$lib/subbit/channel.svelte';
	import { notify } from '$lib/toast';
	import { getErrorMessage } from '$lib/errors';
	import { track } from '$lib/analytics';
	import { tos } from '$lib/tos';
	import { EST_NETWORK_FEE_ADA } from '$lib/odapi/pricing';
	import AlertTriangle from '@lucide/svelte/icons/triangle-alert';

	interface Props {
		open?: boolean;
	}

	let { open = $bindable(false) }: Props = $props();

	const wallet = getWalletState();
	const channel = getChannelState();

	const formatAda = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });
	const closePeriodHours = tos.channel.closePeriodMs / 3_600_000;

	async function handleClose() {
		try {
			await channel.close(wallet);
			notify.success(
				`Channel closed. Come back in ~${closePeriodHours} hours to withdraw your funds.`
			);
			track('channel-close');
			handleOpenChange(false);
		} catch (err) {
			notify.error(getErrorMessage(err, 'Failed to close channel'));
		}
	}

	function handleOpenChange(newOpen: boolean) {
		if (!newOpen && channel.closing) return;
		open = newOpen;
		if (!newOpen) {
			setTimeout(() => {
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
		showCloseButton={!channel.closing}
		interactOutsideBehavior={channel.closing ? 'ignore' : 'close'}
		escapeKeydownBehavior={channel.closing ? 'ignore' : 'close'}
	>
		<Dialog.Header>
			<Dialog.Title>Close Channel</Dialog.Title>
			<Dialog.Description>
				Closing starts a settlement period. The provider will settle outstanding charges during this
				time.
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4 py-4">
			<Alert class="border-amber-500/40 bg-amber-50 text-amber-800">
				<AlertTriangle class="text-amber-600" />
				<AlertTitle class="pb-1 font-bold">This is permanent</AlertTitle>
				<AlertDescription>
					<p class="text-sm">
						Closing is permanent. This channel cannot be reopened — you'll need to open a new one to
						resume using the service.
					</p>
				</AlertDescription>
			</Alert>

			<div class="border-border bg-muted/30 space-y-2 rounded-md border p-4 text-sm">
				<div class="flex items-center justify-between">
					<span class="text-muted-foreground">Settlement period</span>
					<span class="font-mono font-semibold">{closePeriodHours} hours</span>
				</div>

				<div class="flex items-center justify-between">
					<span class="text-muted-foreground">Provider deducts</span>
					<span class="font-mono">{formatAda.format(channel.costInAda)} ADA</span>
				</div>

				<div class="flex items-center justify-between">
					<span class="text-muted-foreground">Est. return</span>
					<span class="font-mono font-semibold">
						{formatAda.format(channel.simpleAvailableInAda)} ADA
					</span>
				</div>

				<div class="flex items-center justify-between">
					<span class="text-muted-foreground">Est. network fee</span>
					<span class="font-mono">~{EST_NETWORK_FEE_ADA} ADA</span>
				</div>
			</div>

			<p class="text-muted-foreground text-sm">
				After closing, a {closePeriodHours}-hour settlement window begins. The provider settles
				outstanding charges, then you return to withdraw remaining funds. If the provider doesn't
				settle in time, you can withdraw all your locked funds.
			</p>

			{#if channel.error}
				<p class="text-destructive text-sm">{channel.error}</p>
			{/if}

			<Button class="w-full" variant="destructive" onclick={handleClose} disabled={channel.closing}>
				{#if channel.closing}
					<Spinner class="mr-2 h-4 w-4" />
					{#if channel.syncStatus}
						{channel.syncStatus}
					{:else}
						Closing Channel...
					{/if}
				{:else}
					Close Channel
				{/if}
			</Button>
		</div>

		<Dialog.Footer>
			{#if channel.closing}
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
