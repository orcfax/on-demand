<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { getChannelState } from '$lib/subbit/channel.svelte';
	import { getAuthKeyState } from '$lib/subbit/authKey.svelte';
	import { getODAPIState } from '$lib/odapi/odapi.svelte';
	import { getChannelStoreState } from '$lib/subbit/channelStore.svelte';
	import { getNetworkState } from '$lib/network.svelte';
	import { hasCachedKey, cacheKey, deleteCachedKey } from '$lib/subbit/keyCache';
	import { notify } from '$lib/toast';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import CheckIcon from '@lucide/svelte/icons/check';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import { getWalletState } from '$lib/wallet/wallet.svelte';
	import { StoredPriceUpdateExportSchema } from '$lib/odapi/types';
	import LogOutIcon from '@lucide/svelte/icons/log-out';

	interface Props {
		open?: boolean;
	}

	let { open = $bindable(false) }: Props = $props();

	const wallet = getWalletState();
	const channel = getChannelState();
	const authKey = getAuthKeyState();
	const odapi = getODAPIState();
	const channelStore = getChannelStoreState();
	const network = getNetworkState();

	// State
	let copiedField = $state('');
	let isCached = $state(false);
	let confirmingClear = $state(false);
	let confirmingForce = $state(false);
	let importInputEl: HTMLInputElement | undefined = $state();
	let importing = $state(false);

	// Helpers
	const truncate = (s: string, n = 8) =>
		s.length > n * 2 ? s.slice(0, n) + '...' + s.slice(-n) : s;

	function copyToClipboard(text: string, field: string) {
		navigator.clipboard.writeText(text);
		notify.success('Copied');
		copiedField = field;
		setTimeout(() => {
			if (copiedField === field) copiedField = '';
		}, 2000);
	}

	// Check cache status when dialog opens
	$effect(() => {
		if (open && channel.keytag) {
			hasCachedKey(channel.keytag).then((v) => {
				isCached = v;
			});
		}
	});

	// Reset confirmation states when dialog closes
	$effect(() => {
		if (!open) {
			confirmingClear = false;
			confirmingForce = false;
		}
	});

	// Derived data
	const storeEntry = $derived(channel.keytag ? channelStore.get(channel.keytag) : null);
	const totalHistoryCount = $derived(
		Array.from(odapi.feedHistoryCounts.values()).reduce((sum, n) => sum + n, 0)
	);
	const otherChannels = $derived(
		channelStore.entriesForNetwork(network.current).filter((e) => e.keytag !== channel.keytag)
	);

	const stageVariant = (stage?: string) => {
		switch (stage) {
			case 'open':
				return 'default' as const;
			case 'closed':
			case 'closing':
				return 'secondary' as const;
			case 'settled':
			case 'ended':
				return 'outline' as const;
			default:
				return 'secondary' as const;
		}
	};

	const formatDate = (iso: string) =>
		new Date(iso).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});

	// Actions
	async function handleCacheToggle(checked: boolean) {
		if (!channel.keytag) return;
		try {
			if (checked) {
				await cacheKey(channel.keytag, authKey.skeyHex);
				isCached = true;
				notify.success('Key cached in browser');
			} else {
				await deleteCachedKey(channel.keytag);
				isCached = false;
				notify.success('Cached key removed');
			}
		} catch {
			notify.error('Failed to update key cache');
		}
	}

	async function handleExport() {
		if (!channel.tag || !channel.keytag) return;
		try {
			const updates = await odapi.getStoredUpdatesForChannel(channel.tag);
			if (updates.length === 0) {
				notify.info('No history to export');
				return;
			}
			const blob = new Blob([JSON.stringify(updates, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `history-${truncate(channel.keytag, 6)}.json`;
			document.body.appendChild(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(url);
			notify.success(`Exported ${updates.length} records`);
		} catch {
			notify.error('Failed to export history');
		}
	}

	async function handleImport(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		// Reset input so the same file can be re-selected
		input.value = '';

		if (!channel.tag) {
			notify.error('No active channel');
			return;
		}

		importing = true;
		try {
			const text = await file.text();
			let parsed: unknown;
			try {
				parsed = JSON.parse(text);
			} catch {
				notify.error('Invalid JSON file');
				return;
			}

			const result = StoredPriceUpdateExportSchema.safeParse(parsed);
			if (!result.success) {
				notify.error('Invalid history file format');
				return;
			}

			// Verify every record belongs to the current channel
			const mismatch = result.data.some((r) => r.channelTag !== channel.tag);
			if (mismatch) {
				notify.error('This history file belongs to a different channel');
				return;
			}

			const { added, skipped } = await odapi.importStoredUpdates(result.data);
			if (added === 0 && skipped > 0) {
				notify.info(`All ${skipped} records already exist`);
			} else if (skipped > 0) {
				notify.success(`Imported ${added} new records (${skipped} duplicates skipped)`);
			} else {
				notify.success(`Imported ${added} records`);
			}
		} catch {
			notify.error('Failed to import history');
		} finally {
			importing = false;
		}
	}

	async function handleClearHistory() {
		if (!confirmingClear) {
			confirmingClear = true;
			return;
		}
		try {
			await odapi.clearStoredUpdatesForChannel(channel.tag);
			notify.success('Request history cleared');
			confirmingClear = false;
		} catch {
			notify.error('Failed to clear history');
		}
	}

	function handleForceClear() {
		if (!confirmingForce) {
			confirmingForce = true;
			return;
		}
		channel.clearFromStore();
		channel.clear();
		authKey.clear();
		open = false;
		notify.success('Channel state cleared');
	}

	async function handleRemoveOtherChannel(keytag: string, tag: string) {
		channelStore.remove(keytag);
		await deleteCachedKey(keytag).catch(() => {});
		await odapi.clearStoredUpdatesForChannel(tag).catch(() => {});
		notify.success('Channel removed');
	}

	async function handleLogout() {
		if (channel.keytag) {
			await deleteCachedKey(channel.keytag).catch(() => {});
		}
		channelStore.activeKeytag = null;
		authKey.clear();
		channel.clear();
		wallet.disconnect();
		open = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Overlay class="bg-black/80" />
	<Dialog.Content class="max-h-[85vh] max-w-lg overflow-y-auto">
		<Dialog.Header>
			<Dialog.Title>Channel Settings</Dialog.Title>
			<Dialog.Description>View channel details and manage your session.</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-6 py-4">
			<!-- Section 1: Channel Information -->
			<div>
				<p class="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
					Channel Information
				</p>
				<div class="border-border bg-muted/30 space-y-3 rounded-md border p-4 text-sm">
					<div class="flex items-center justify-between">
						<span class="text-muted-foreground">Provider</span>
						<span>Orcfax Ltd.</span>
					</div>

					{#if channel.ref}
						<div class="flex items-center justify-between gap-2">
							<span class="text-muted-foreground shrink-0">UTxO Reference</span>
							<div class="flex items-center gap-1">
								<span class="font-mono text-xs">
									{truncate(channel.ref.txHash)}#{channel.ref.outputIndex}
								</span>
								<button
									class="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
									onclick={() =>
										copyToClipboard(`${channel.ref!.txHash}#${channel.ref!.outputIndex}`, 'utxo')}
								>
									{#if copiedField === 'utxo'}
										<CheckIcon class="h-3.5 w-3.5 text-green-500" />
									{:else}
										<CopyIcon class="h-3.5 w-3.5" />
									{/if}
								</button>
							</div>
						</div>
					{/if}

					<div class="flex items-center justify-between">
						<span class="text-muted-foreground">Channel Tag</span>
						<span class="font-mono text-xs">{channel.tag}</span>
					</div>

					{#if channel.keytag}
						<div class="flex items-center justify-between gap-2">
							<span class="text-muted-foreground shrink-0">Channel Keytag</span>
							<div class="flex items-center gap-1">
								<span class="font-mono text-xs">{truncate(channel.keytag)}</span>
								<button
									class="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
									onclick={() => copyToClipboard(channel.keytag!, 'keytag')}
								>
									{#if copiedField === 'keytag'}
										<CheckIcon class="h-3.5 w-3.5 text-green-500" />
									{:else}
										<CopyIcon class="h-3.5 w-3.5" />
									{/if}
								</button>
							</div>
						</div>
					{/if}

					{#if authKey.vkeyHex}
						<div class="flex items-center justify-between gap-2">
							<span class="text-muted-foreground shrink-0">Auth Key (Public)</span>
							<div class="flex items-center gap-1">
								<span class="font-mono text-xs">{truncate(authKey.vkeyHex)}</span>
								<button
									class="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
									onclick={() => copyToClipboard(authKey.vkeyHex, 'vkey')}
								>
									{#if copiedField === 'vkey'}
										<CheckIcon class="h-3.5 w-3.5 text-green-500" />
									{:else}
										<CopyIcon class="h-3.5 w-3.5" />
									{/if}
								</button>
							</div>
						</div>
					{/if}

					{#if storeEntry?.opened_at}
						<div class="flex items-center justify-between">
							<span class="text-muted-foreground">Opened</span>
							<span class="text-xs">{formatDate(storeEntry.opened_at)}</span>
						</div>
					{/if}

					{#if storeEntry?.tosVersion}
						<div class="flex items-center justify-between">
							<span class="text-muted-foreground">TOS</span>
							<span class="text-xs">
								v{storeEntry.tosVersion}
								{#if storeEntry.tosAcceptedAt}
									&middot; accepted {formatDate(storeEntry.tosAcceptedAt)}
								{/if}
							</span>
						</div>
					{/if}
				</div>
			</div>

			<!-- Section 2: Actions -->
			<div>
				<p class="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
					Actions
				</p>
				<div class="space-y-3">
					<!-- Remember My Key -->
					<div class="flex items-center justify-between rounded-md border p-3">
						<div>
							<p class="text-sm font-medium">Remember My Key</p>
							<p class="text-muted-foreground text-xs">
								Cache your private key in the browser for quick restore
							</p>
						</div>
						<Checkbox
							checked={isCached}
							onCheckedChange={(v) => handleCacheToggle(v === true)}
							disabled={!authKey.isLoaded || !authKey.privateKey}
						/>
					</div>

					<div class="flex flex-wrap gap-2">
						<!-- Export Request History -->
						<Button
							variant="outline"
							class="gap-2"
							onclick={handleExport}
							disabled={totalHistoryCount === 0}
						>
							<DownloadIcon class="h-4 w-4" />
							Export History
							{#if totalHistoryCount > 0}
								<span class="text-muted-foreground text-xs">
									({totalHistoryCount})
								</span>
							{/if}
						</Button>

						<!-- Import Request History -->
						<input
							bind:this={importInputEl}
							type="file"
							accept=".json"
							class="hidden"
							onchange={handleImport}
						/>
						<Button
							variant="outline"
							class="gap-2"
							onclick={() => importInputEl?.click()}
							disabled={importing || !channel.tag}
						>
							<UploadIcon class="h-4 w-4" />
							{importing ? 'Importing...' : 'Import History'}
						</Button>

						<!-- Log Out -->
						<Button variant="outline" class="gap-2" onclick={handleLogout}>
							<LogOutIcon class="h-4 w-4" />
							Log Out
						</Button>
					</div>
				</div>
			</div>

			<!-- Section: Danger Zone -->
			<div>
				<p class="text-destructive mb-3 text-xs font-semibold tracking-wider uppercase">
					Danger Zone
				</p>
				<div class="space-y-3">
					<div class="flex flex-wrap gap-2">
						<!-- Clear Request History -->
						<Button
							variant="destructive"
							class="gap-2"
							onclick={handleClearHistory}
							disabled={totalHistoryCount === 0 && !confirmingClear}
						>
							<TrashIcon class="h-4 w-4" />
							{#if confirmingClear}
								Confirm Clear History
							{:else}
								Clear Request History
							{/if}
						</Button>

						<!-- Force Clear Channel State -->
						<Button variant="destructive" class="gap-2" onclick={handleForceClear}>
							<TrashIcon class="h-4 w-4" />
							{#if confirmingForce}
								Confirm Force Clear
							{:else}
								Force Clear Channel
							{/if}
						</Button>
					</div>
					{#if confirmingForce}
						<p class="text-destructive text-xs">
							This will remove the channel from local storage and return you to the setup flow. Your
							on-chain funds are not affected.
						</p>
					{/if}
				</div>
			</div>

			<!-- Section 3: Other Channels -->
			<div>
				<p class="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
					Other Channels
				</p>
				{#if otherChannels.length === 0}
					<p class="text-muted-foreground text-sm">No other channels stored.</p>
				{:else}
					<div class="space-y-2">
						{#each otherChannels as entry (entry.keytag)}
							<div class="flex items-center justify-between rounded-md border p-3 text-sm">
								<div class="flex items-center gap-2">
									<span class="font-mono text-xs">{truncate(entry.keytag)}</span>
									<Badge variant={stageVariant(entry.stage)}>
										{entry.stage ?? 'unknown'}
									</Badge>
								</div>
								<div class="flex items-center gap-2">
									<span class="text-muted-foreground text-xs">
										{formatDate(entry.lastUsed)}
									</span>
									<Button
										variant="ghost"
										size="sm"
										class="text-destructive hover:text-destructive h-7 px-2 text-xs"
										onclick={() => handleRemoveOtherChannel(entry.keytag, entry.tag)}
									>
										Remove
									</Button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>
