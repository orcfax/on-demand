<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { getAuthKeyState } from '$lib/subbit/authKey.svelte';
	import { getWalletState } from '$lib/wallet/wallet.svelte';
	import { getChannelState } from '$lib/subbit/channel.svelte';
	import { getNetworkState } from '$lib/network.svelte';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import Spinner from '$lib/components/ui/spinner/spinner.svelte';
	import KeySetup from './KeySetup.svelte';
	import { tick } from 'svelte';
	import { notify } from '$lib/toast';
	import { getErrorMessage } from '$lib/errors';
	import {
		CHANNEL_RESERVE_ADA,
		CHANNEL_INIT_COST_ADA,
		EST_NETWORK_FEE_ADA
	} from '$lib/odapi/pricing';
	import Info from '@lucide/svelte/icons/info';
	import { track, identify } from '$lib/analytics';

	getAuthKeyState();
	const wallet = getWalletState();
	const channel = getChannelState();
	const network = getNetworkState();
	const isReady = $derived(wallet.isConnected);
	let tosAccepted = $state(false);
	let tagTouched = $state(false);
	const tagError = $derived.by(() => {
		if (!tagTouched || channel.isTagValid) return null;
		const result = channel.tagValidation;
		return result.ok ? null : result.error;
	});

	function handleTagBlur() {
		tagTouched = true;
	}

	let depositInput = $state(String(channel.depositAda));
	const depositNumber = $derived(parseFloat(depositInput) || 0);
	const isValidDeposit = $derived(depositNumber >= channel.minDepositAda);

	// Sync input → model whenever the parsed value is valid
	$effect(() => {
		if (isValidDeposit) {
			channel.depositAda = depositNumber;
		}
	});

	function handleDepositBlur() {
		if (!isValidDeposit) {
			depositInput = String(channel.minDepositAda);
			channel.depositAda = channel.minDepositAda;
		}
	}

	const estimatedUpdates = $derived(Math.floor(depositNumber / channel.updateCostAda));
	const estimatedPublishes = $derived(Math.floor(depositNumber / channel.publishCostAda));

	const formatAda = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });
	const totalLocked = $derived(depositNumber + CHANNEL_RESERVE_ADA);
	const estTotalFromWallet = $derived(totalLocked + EST_NETWORK_FEE_ADA);

	function scrollIntoView(node: HTMLElement) {
		tick().then(() => {
			node.scrollIntoView({ behavior: 'smooth', block: 'start' });
		});
	}
</script>

{#if !channel.pendingSync}
	<Alert>
		<Info />
		<AlertTitle class="pb-2 font-bold">Opening a Payment Channel</AlertTitle>
		<AlertDescription class="flex flex-col gap-2">
			<p class="text-sm">
				A payment channel allows you to make multiple data requests without submitting a transaction
				for each one.
			</p>
			<ul class="ml-4 list-disc space-y-1 text-sm">
				<li>Deposit funds once to open the channel</li>
				<li>Fetch price: {channel.updateCostAda} ADA per request</li>
				<li>Publish (on-chain): {channel.publishCostAda} ADA per request</li>
				<li>Add funds anytime to keep making requests</li>
			</ul>
		</AlertDescription>
	</Alert>
	<div class="space-y-3">
		<Field.Field orientation="responsive">
			<Field.Label>Provider</Field.Label>
			<Field.Content>
				<Input value="Orcfax Ltd." readonly disabled />
			</Field.Content>
		</Field.Field>

		<Field.Field orientation="responsive">
			<Field.Label>Network</Field.Label>
			<Field.Content>
				<Select.Root type="single" value={network.current} disabled>
					<Select.Trigger class="w-full">{network.current}</Select.Trigger>
					<Select.Content>
						<Select.Item value={network.current}>{network.current}</Select.Item>
					</Select.Content>
				</Select.Root>
			</Field.Content>
		</Field.Field>

		<Field.Field orientation="responsive">
			<Field.Label>Initial Deposit (Minimum {channel.minDepositAda} ADA)</Field.Label>
			<Field.Content>
				<Input
					type="number"
					bind:value={depositInput}
					onblur={handleDepositBlur}
					disabled={channel.opening || channel.isOpen}
				/>
			</Field.Content>
			<Field.Description class="text-muted-foreground text-xs">
				{#if isValidDeposit}
					~{estimatedUpdates.toLocaleString()} fetches or ~{estimatedPublishes.toLocaleString()} publishes
				{:else}
					Deposit must be at least {channel.minDepositAda} ADA
				{/if}
			</Field.Description>
		</Field.Field>

		<Field.Field data-invalid={!!tagError}>
			<Field.Label for="channelTag">Channel Tag</Field.Label>
			<Field.Content>
				<p class="text-muted-foreground mb-2 text-xs">This tag identifies your payment channel.</p>

				<Input
					id="channelTag"
					type="text"
					bind:value={channel.tag}
					onblur={handleTagBlur}
					placeholder={`Enter channel tag (max ${channel.subbitTagLength} bytes)`}
					class="font-mono text-sm"
					aria-invalid={!!tagError}
					disabled={channel.opening || channel.isOpen}
				/>

				{#if tagError}
					<Field.Error>{tagError}</Field.Error>
				{/if}
				<Field.Description class="text-muted-foreground text-xs">
					{channel.tagByteLength} / {channel.subbitTagLength} bytes
				</Field.Description>
			</Field.Content>
		</Field.Field>
	</div>
{/if}

{#if !channel.isOpen && !channel.pendingSync}
	<div class="border-border bg-muted/30 space-y-2 rounded-md border p-4 text-sm">
		<p class="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
			Transaction Summary
		</p>

		<div class="flex items-start justify-between">
			<div>
				<span>Deposit</span>
				<p class="text-muted-foreground text-xs">Your spendable balance for requests</p>
			</div>
			<span class="font-mono">{formatAda.format(depositNumber)} ADA</span>
		</div>

		<div class="flex items-start justify-between">
			<div>
				<span>Channel Reserve</span>
				<p class="text-muted-foreground text-xs">Refundable when you close your channel</p>
			</div>
			<span class="font-mono">+ {formatAda.format(CHANNEL_RESERVE_ADA)} ADA</span>
		</div>

		<hr class="border-border" />

		<div class="flex items-start justify-between font-medium">
			<span>Total Locked On-chain</span>
			<span class="font-mono">{formatAda.format(totalLocked)} ADA</span>
		</div>

		<div class="mt-2 flex items-start justify-between">
			<div>
				<span>Channel Opening Fee</span>
				<p class="text-muted-foreground text-xs">Deducted from deposit balance</p>
			</div>
			<span class="text-muted-foreground font-mono"
				>{formatAda.format(CHANNEL_INIT_COST_ADA)} ADA</span
			>
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
	</div>
{/if}

{#if channel.isOpen}
	<Alert class="border-green-500/40  text-green-700">
		<AlertDescription class="text-sm text-green-700"
			>✓ Channel opened successfully!</AlertDescription
		>
	</Alert>
{:else if channel.pendingSync}
	<!-- Recovery UI: tx submitted but sync failed -->
	<Alert class="border-yellow-500/40">
		<AlertTitle class="text-sm font-semibold">Channel created, sync incomplete</AlertTitle>
		<AlertDescription class="mt-1 flex flex-col gap-2 text-sm">
			<p>
				Your channel was created on-chain but we couldn't confirm it yet. Your funds are safe —
				click retry to complete the setup.
			</p>
			{#if channel.ref?.txHash}
				<p class="text-muted-foreground text-xs">
					Tx: <code class="bg-muted rounded px-1 font-mono text-xs">{channel.ref.txHash}</code>
				</p>
			{/if}
		</AlertDescription>
	</Alert>
	{#if channel.error}
		<p class="text-destructive text-sm">{channel.error}</p>
	{/if}
	<Button
		class="w-full"
		onclick={async () => {
			await channel.retryOpenSync();
			if (!channel.pendingSync) {
				notify.success('Payment channel opened');
				track('channel-open', { deposit: channel.depositAda });
				const changeAddress = await wallet.connection!.getChangeAddress();
				identify(changeAddress, {
					wallet: wallet.name!,
					network: network.current,
					keytag: channel.keytag!
				});
				track('onboarding-step', { step: 'channel-open' });
			}
		}}
		disabled={channel.opening}
	>
		{#if channel.opening}
			<Spinner class="mr-2 h-4 w-4" />
			{#if channel.syncStatus}
				{channel.syncStatus}
			{:else}
				Retrying...
			{/if}
		{:else}
			Retry Sync
		{/if}
	</Button>
{:else}
	<div class="flex items-start gap-2">
		<Checkbox
			id="tos-accept"
			checked={tosAccepted}
			onCheckedChange={(v) => (tosAccepted = v === true)}
			disabled={channel.opening}
		/>
		<label for="tos-accept" class="text-muted-foreground text-xs leading-tight">
			I have read and agree to the <a href="/tos" target="_blank" class="text-foreground underline"
				>Terms of Service</a
			>
		</label>
	</div>
	<Button
		class="w-full"
		onclick={async () => {
			try {
				await channel.openChannel();
				if (channel.pendingSync) return; // recovery UI will handle it
				notify.success('Payment channel opened');
				track('channel-open', { deposit: channel.depositAda });
				const changeAddress = await wallet.connection!.getChangeAddress();
				identify(changeAddress, {
					wallet: wallet.name!,
					network: network.current,
					keytag: channel.keytag!
				});
				track('onboarding-step', { step: 'channel-open' });
			} catch (err) {
				notify.error(getErrorMessage(err, 'Failed to open channel'));
			}
		}}
		disabled={!isReady || !tosAccepted || !isValidDeposit || !channel.isTagValid || channel.opening}
	>
		{#if channel.opening}
			<Spinner class="mr-2 h-4 w-4" />
			{#if channel.syncStatus}
				{channel.syncStatus}
			{:else}
				Opening Channel...
			{/if}
		{:else}
			Open Channel
		{/if}
	</Button>
{/if}

{#if !channel.pendingSync && channel.error}
	<p class="text-destructive text-sm">{channel.error}</p>
{/if}
{#if channel.isOpen}
	<div use:scrollIntoView>
		<KeySetup />
	</div>
{/if}
