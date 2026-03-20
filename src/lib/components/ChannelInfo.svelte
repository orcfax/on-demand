<script lang="ts">
	import * as Field from '$lib/components/ui/field/index.js';
	import { getWalletState } from '$lib/wallet/wallet.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { getAuthKeyState } from '$lib/subbit/authKey.svelte';
	import { getChannelState } from '$lib/subbit/channel.svelte';
	import { PRICE_REQUEST_COST_ADA, PUBLISH_REQUEST_COST_ADA } from '$lib/odapi/pricing';
	import RefreshCcwDotIcon from '@lucide/svelte/icons/refresh-ccw-dot';
	import PackagePlus from '@lucide/svelte/icons/package-plus';
	import AddFundsDialog from '$lib/components/AddFundsDialog.svelte';
	import CloseChannelDialog from '$lib/components/CloseChannelDialog.svelte';
	import WithdrawDialog from '$lib/components/WithdrawDialog.svelte';
	import StatusIndicator from '$lib/components/StatusIndicator.svelte';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import ChannelSettingsDialog from '$lib/components/ChannelSettingsDialog.svelte';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import { deleteCachedKey } from '$lib/subbit/keyCache';
	import AlertCircleIcon from '@lucide/svelte/icons/circle-alert';

	const authKey = getAuthKeyState();
	const wallet = getWalletState();
	const channel = getChannelState();
	const formatAda = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });
	let showAddFundsDialog = $state(false);
	let showCloseDialog = $state(false);
	let showWithdrawDialog = $state(false);
	let showSettingsDialog = $state(false);
	const isReady = $derived(wallet.isConnected && authKey.isLoaded);
	const statusText = $derived(channel.stage);
	const statusColor = $derived.by(() => {
		if (!isReady || channel.stage === 'opening' || channel.stage === 'ended') return 'red';
		else if (channel.stage === 'open') return 'green';
		else if (
			channel.stage === 'closing' ||
			channel.stage === 'closed' ||
			channel.stage === 'settled'
		)
			return 'yellow';
		else return 'red';
	});

	function formatDeadline(deadline: number): string {
		return new Date(deadline).toLocaleString();
	}

	function formatRelativeTime(timestamp: number): string {
		const seconds = Math.floor((Date.now() - timestamp) / 1000);
		if (seconds < 60) return `${seconds}s ago`;
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		return `${Math.floor(minutes / 60)}h ago`;
	}

	function formatTimeRemaining(ms: number | null): string | null {
		if (ms === null || ms <= 0) return null;
		const hours = Math.floor(ms / 3_600_000);
		const minutes = Math.floor((ms % 3_600_000) / 60_000);
		if (hours > 0) return `${hours}h ${minutes}m`;
		return `${minutes}m`;
	}

	// Poll on-chain state while closing/closed
	$effect(() => {
		if (channel.stage !== 'closed' && channel.stage !== 'closing') return;

		channel.sync().catch(() => {});

		const interval = setInterval(() => {
			channel.sync().catch(() => {});
		}, 60_000);

		return () => clearInterval(interval);
	});
</script>

<Field.Field>
	<Field.Content>
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<StatusIndicator color={statusColor} size="md" />
				<div class="flex items-center gap-1">
					<Field.Label>Channel</Field.Label>
					<span class="text-muted-foreground text-xs font-medium">{statusText}</span>
				</div>
			</div>
			<button
				class="text-muted-foreground hover:text-foreground rounded-md p-1 transition-colors"
				onclick={() => (showSettingsDialog = true)}
				aria-label="Channel settings"
			>
				<SettingsIcon class="h-4 w-4" />
			</button>
		</div>

		{#if channel.error}
			<div
				class="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950"
			>
				<AlertCircleIcon class="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
				<p class="text-xs text-red-700 dark:text-red-300">{channel.error}</p>
			</div>
		{/if}

		{#if !isReady}
			<div class="space-y-3 px-2 py-2">
				<div class="flex flex-col items-center justify-center py-8 text-center">
					<p class="text-muted-foreground text-sm">
						{#if !wallet.isConnected && !authKey.isLoaded}
							Connect your wallet and load an auth key to access your channel.
						{:else if !wallet.isConnected}
							Connect your wallet to access your channel.
						{:else if !authKey.isLoaded}
							Load an auth key to access your channel.
						{/if}
					</p>
				</div>
			</div>
		{:else if channel.stage === 'opening'}
			<div class="space-y-3 px-2 py-2">
				{#if channel.error}
					<p class="text-muted-foreground text-sm">
						Failed to restore channel. The channel may no longer exist on-chain.
					</p>
					<Button
						class="h-9 w-full"
						variant="outline"
						disabled={channel.syncing}
						onclick={() => {
							channel.retrySync().catch(() => {});
						}}
					>
						{channel.syncing ? 'Retrying...' : 'Retry Sync'}
					</Button>
				{:else}
					<div class="flex flex-col items-center justify-center py-8 text-center">
						<p class="text-muted-foreground text-sm">Open a channel to get started.</p>
					</div>
				{/if}
			</div>
		{:else if channel.isOpen}
			<!-- Channel is open, show details -->
			<div class="space-y-3 px-2 py-2">
				<!-- Locked / Reserved -->
				<div class="grid grid-cols-2 gap-2">
					<div class="space-y-1">
						<div class="text-muted-foreground text-xs font-medium">Total Locked</div>
						<div class="text-lg font-semibold">
							{formatAda.format(channel.subbitAmtInAda)} ADA
						</div>
					</div>
					<div class="space-y-1">
						<div class="text-muted-foreground text-xs font-medium">Reserved</div>
						<div class="text-muted-foreground text-xs font-semibold">
							{formatAda.format(channel.channelReserveAda)} ADA
						</div>
					</div>
				</div>

				<!-- Available / Spent -->
				<div class="grid grid-cols-2 gap-2">
					<div class="space-y-1">
						<div class="text-muted-foreground text-xs font-medium">Available</div>
						<div class="text-sm font-semibold">
							{formatAda.format(channel.simpleAvailableInAda)} ADA
						</div>
					</div>
					<div class="space-y-1">
						<div class="text-muted-foreground text-xs font-medium">Spent</div>
						<div class="text-muted-foreground text-xs font-semibold">
							{formatAda.format(channel.costInAda)} ADA
						</div>
					</div>
				</div>

				<hr class="border-border" />

				<!-- Cost per Request -->
				<div class="space-y-1">
					<div class="text-muted-foreground text-xs font-medium">Request Costs</div>
					<div class="space-y-0.5 text-xs">
						<div class="flex items-center gap-4">
							<span class="text-muted-foreground inline-flex items-center gap-1">
								<RefreshCcwDotIcon class="h-3 w-3" />
								Fetch
							</span>
							<span class="font-medium">{PRICE_REQUEST_COST_ADA} ADA</span>
						</div>
						<div class="flex items-center gap-4">
							<span class="text-muted-foreground inline-flex items-center gap-1">
								<PackagePlus class="h-3 w-3" />
								Publish
							</span>
							<span class="font-medium">{PUBLISH_REQUEST_COST_ADA} ADA</span>
						</div>
					</div>
				</div>

				<!-- Terms of Service -->
				<div class="flex">
					<a
						href="/tos"
						class="text-muted-foreground hover:text-foreground flex items-center gap-2 py-1.5 text-xs transition-colors"
					>
						<FileTextIcon class="h-3.5 w-3.5" />
						Terms of Service
					</a>
				</div>

				<!-- Action buttons -->
				<div class="space-y-2">
					<Button
						class="h-9 w-full bg-green-600 hover:bg-green-700"
						onclick={() => (showAddFundsDialog = true)}
						disabled={!channel.canAddFunds}
					>
						Add Funds
					</Button>
					<Button
						class="h-9 w-full"
						variant="outline"
						onclick={() => (showCloseDialog = true)}
						disabled={!channel.canClose}
					>
						Close Channel
					</Button>
				</div>
			</div>
		{:else if channel.stage === 'closed' || channel.stage === 'closing'}
			<!-- Channel is closed / closing -->
			<div class="space-y-3 px-2 py-2">
				<div class="text-sm">
					{#if channel.canExpire}
						<p class="font-medium text-yellow-600">Settlement period expired</p>
						<p class="text-muted-foreground mt-1">
							The provider didn't settle in time. You can withdraw the full locked amount.
						</p>
						<div class="mt-2 flex items-center justify-between">
							<span class="text-muted-foreground text-xs">Amount to reclaim</span>
							<span class="font-mono text-sm font-semibold">
								{formatAda.format(channel.subbitAmtInAda)} ADA
							</span>
						</div>
					{:else if channel.deadline}
						<p class="text-muted-foreground">
							Settlement window ends: {formatDeadline(channel.deadline)}
						</p>
						{@const remaining = formatTimeRemaining(channel.timeRemainingMs)}
						{#if remaining}
							<p class="text-muted-foreground text-xs">({remaining} remaining)</p>
						{/if}
						<div class="mt-2 flex items-center justify-between">
							<span class="text-muted-foreground text-xs">Est. return</span>
							<span class="font-mono text-sm font-semibold">
								~{formatAda.format(channel.simpleAvailableInAda)} ADA
							</span>
						</div>
						<p class="text-muted-foreground mt-1 text-xs">Waiting for provider to settle...</p>
					{:else}
						<p class="text-muted-foreground">Closing in progress...</p>
					{/if}
				</div>

				{#if channel.lastSynced}
					<p class="text-muted-foreground text-xs">
						Last updated: {formatRelativeTime(channel.lastSynced)}
					</p>
				{/if}

				{#if channel.canExpire}
					<Button class="h-9 w-full" onclick={() => (showWithdrawDialog = true)}>
						Withdraw Funds
					</Button>
				{/if}
			</div>
		{:else if channel.stage === 'settled'}
			<!-- Channel is settled -->
			<div class="space-y-3 px-2 py-2">
				<p class="text-sm font-medium text-green-600">
					Provider has settled. You can withdraw your remaining funds.
				</p>

				<div class="flex items-center justify-between">
					<span class="text-muted-foreground text-xs">Withdrawal amount</span>
					<span class="font-mono text-sm font-semibold">
						~{formatAda.format(channel.simpleAvailableInAda)} ADA
					</span>
				</div>

				<Button
					class="h-9 w-full"
					onclick={() => (showWithdrawDialog = true)}
					disabled={!channel.canWithdraw}
				>
					Withdraw Funds
				</Button>
			</div>
		{:else if channel.stage === 'ended'}
			<!-- Channel is fully ended -->
			<div class="space-y-3 px-2 py-2">
				<p class="text-muted-foreground text-sm">This channel has been fully withdrawn.</p>
				<Button
					class="h-9 w-full"
					variant="outline"
					onclick={() => {
						if (channel.keytag) deleteCachedKey(channel.keytag).catch(() => {});
						channel.clear();
						authKey.clear();
					}}
				>
					Open New Channel
				</Button>
			</div>
		{/if}
	</Field.Content>
</Field.Field>

<!-- Dialogs -->
<AddFundsDialog bind:open={showAddFundsDialog} />
<CloseChannelDialog bind:open={showCloseDialog} />
<WithdrawDialog bind:open={showWithdrawDialog} />
<ChannelSettingsDialog bind:open={showSettingsDialog} />
