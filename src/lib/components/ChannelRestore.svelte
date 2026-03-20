<script lang="ts">
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge';
	import LockOpenIcon from '@lucide/svelte/icons/lock-open';
	import LoaderIcon from '@lucide/svelte/icons/loader';
	import { getChannelState } from '$lib/subbit/channel.svelte';
	import { getChannelStoreState, type StoredChannelEntry } from '$lib/subbit/channelStore.svelte';
	import { getODAPIState } from '$lib/odapi/odapi.svelte';
	import { notify } from '$lib/toast';
	import { getErrorMessage } from '$lib/errors';
	import { track, identify } from '$lib/analytics';
	import { getNetworkState } from '$lib/network.svelte';
	import { getWalletState } from '$lib/wallet/wallet.svelte';
	import { hasCachedKey, deleteCachedKey, cacheKey, isCacheSupported } from '$lib/subbit/keyCache';
	import { getAuthKeyState } from '$lib/subbit/authKey.svelte';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	interface Props {
		storedChannels: StoredChannelEntry[];
		onRestore: () => void;
	}

	const { storedChannels, onRestore }: Props = $props();

	const channel = getChannelState();
	const channelStore = getChannelStoreState();
	const odapi = getODAPIState();
	const authKey = getAuthKeyState();
	const wallet = getWalletState();
	const network = getNetworkState();

	const defaultKeytag = $derived(storedChannels[0]?.keytag ?? null);
	let keytagOverride = $state<string | null>(null);
	const selectedKeytag = $derived(keytagOverride ?? defaultKeytag);
	let validationError = $state<string | null>(null);

	const selectedEntry = $derived(
		selectedKeytag ? (storedChannels.find((e) => e.keytag === selectedKeytag) ?? null) : null
	);

	const isTerminal = $derived(
		selectedEntry?.stage === 'settled' || selectedEntry?.stage === 'ended'
	);

	// Cache state
	let cachedKeyExists = $state(false);
	let unlocking = $state(false);
	let showFileUpload = $state(false);
	let rememberKey = $state(false);

	// Check cache whenever selection changes
	$effect(() => {
		const keytag = selectedKeytag;
		if (!keytag || !isCacheSupported()) {
			cachedKeyExists = false;
			return;
		}
		hasCachedKey(keytag).then((exists) => {
			cachedKeyExists = exists;
			showFileUpload = false;
		});
	});

	function stageColor(stage?: string) {
		if (!stage || stage === 'opening') return 'secondary';
		if (stage === 'open') return 'default';
		return 'outline';
	}

	async function handleUnlock() {
		if (!selectedKeytag) return;
		unlocking = true;
		try {
			await channel.restoreFromCache(selectedKeytag);
			notify.success('Channel restored');
			track('channel-restore', { method: 'cache' });
			const changeAddress = await wallet.connection!.getChangeAddress();
			identify(changeAddress, {
				wallet: wallet.name!,
				network: network.current,
				keytag: channel.keytag!
			});
			track('onboarding-step', { step: 'channel-restore' });
			onRestore();
		} catch (err) {
			notify.error(getErrorMessage(err, 'Failed to unlock'));
		} finally {
			unlocking = false;
		}
	}

	async function handleDelete() {
		if (!selectedKeytag) return;
		channelStore.remove(selectedKeytag);
		deleteCachedKey(selectedKeytag).catch(() => {});
		await odapi.clearStoredUpdates();
		notify.success('Channel deleted');
		keytagOverride = null;
	}
</script>

{#if storedChannels.length === 0}
	<div class="space-y-4">
		<p class="text-muted-foreground text-sm">
			No stored channels found. If you have a key file, you can restore your channel below.
		</p>
		<!-- Key file upload (no stored channel) -->
		<Field.Field data-invalid={channel.error !== null || validationError !== null}>
			<Field.Label for="authKeyFileEmpty">Restore Key File</Field.Label>
			<Field.Content>
				<p class="text-muted-foreground mb-1 text-xs">
					Load the key file you downloaded when you first set up your account. Example: <code
						class="text-xs">orcfax-on-demand-key-YYYY-MM-DD.json</code
					>
				</p>
				<Input
					id="authKeyFileEmpty"
					type="file"
					accept=".json"
					onchange={async (e) => {
						validationError = null;
						const input = e.currentTarget as HTMLInputElement;
						try {
							await channel.restore(input.files?.[0]);

							if (rememberKey && channel.keytag) {
								await cacheKey(channel.keytag, authKey.privateKey);
								track('key-cache', { context: 'restore' });
							}
							notify.success('Channel restored');
							track('channel-restore', { method: 'file' });
							const changeAddress = await wallet.connection!.getChangeAddress();
							identify(changeAddress, {
								wallet: wallet.name!,
								network: network.current,
								keytag: channel.keytag!
							});
							track('onboarding-step', { step: 'channel-restore' });
							onRestore();
						} catch (err) {
							notify.error(getErrorMessage(err, 'Failed to restore'));
						}
					}}
					aria-invalid={channel.error !== null || validationError !== null}
					title="Load key file"
				/>
				{#if validationError}
					<Field.Error>{validationError}</Field.Error>
				{:else if channel.error}
					<Field.Error>{channel.error}</Field.Error>
				{/if}
			</Field.Content>
			<Field.Description class="text-muted-foreground flex flex-col text-xs">
				<span>• File is read locally in your browser</span>
				<span>• Never uploaded or stored on any server</span>
			</Field.Description>
		</Field.Field>
		{#if isCacheSupported()}
			<div class="flex items-center gap-2">
				<Checkbox id="remember-key-empty" bind:checked={rememberKey} />
				<Label class="text-sm" for="remember-key-empty">Remember this key on this device</Label>
			</div>
			<p class="text-muted-foreground pl-6 text-xs">
				Skip the file upload next time. Only use on devices you trust.
			</p>
		{/if}
	</div>
{:else}
	<div class="space-y-4">
		<!-- Channel selector -->
		{#if storedChannels.length === 1}
			<div class="space-y-1">
				<p class="text-md pt-2 font-bold">Stored channel found:</p>
				<div class="flex items-center gap-2">
					<span class="text-sm font-medium">{storedChannels[0].tag}</span>
					<Badge variant={stageColor(storedChannels[0].stage)}>
						{storedChannels[0].stage ?? 'unknown'}
					</Badge>
				</div>
			</div>
		{:else}
			<Field.Field>
				<Field.Label>Select Channel</Field.Label>
				<Field.Content>
					<Select.Root
						type="single"
						value={selectedKeytag ?? undefined}
						onValueChange={(val) => {
							keytagOverride = val ?? null;
							validationError = null;
						}}
					>
						<Select.Trigger class="w-full">
							{#if selectedEntry}
								{selectedEntry.tag}
								— {selectedEntry.stage ?? 'unknown'}
							{:else}
								Select a channel
							{/if}
						</Select.Trigger>
						<Select.Content>
							{#each storedChannels as entry (entry.keytag)}
								<Select.Item value={entry.keytag}>
									{entry.tag} — {entry.stage ?? 'unknown'}
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</Field.Content>
			</Field.Field>
		{/if}

		<!-- Delete button for terminal channels -->
		{#if isTerminal && selectedKeytag}
			<Button variant="destructive" size="sm" onclick={handleDelete}>Delete Channel</Button>
		{/if}

		<!-- Cache-based unlock (primary when cached key exists) -->
		{#if cachedKeyExists && !showFileUpload}
			<div class="space-y-3">
				<Button class="w-full" onclick={handleUnlock} disabled={unlocking}>
					{#if unlocking}
						<LoaderIcon class="mr-2 h-4 w-4 animate-spin" />
						Unlocking...
					{:else}
						<LockOpenIcon class="mr-2 h-4 w-4" />
						Unlock
					{/if}
				</Button>
				<button
					class="text-muted-foreground hover:text-foreground w-full text-center text-xs underline"
					onclick={() => (showFileUpload = true)}
				>
					Or restore from file instead
				</button>
			</div>
		{:else}
			<!-- Key file upload -->
			<Field.Field data-invalid={channel.error !== null || validationError !== null}>
				<Field.Label for="authKeyFile">Restore Key File</Field.Label>
				<Field.Content>
					<p class="text-muted-foreground mb-1 text-xs">
						Load the key file you downloaded when you first set up your account. Example: <code
							class="text-xs">orcfax-on-demand-key-YYYY-MM-DD.json</code
						>
					</p>
					<Input
						id="authKeyFile"
						type="file"
						accept=".json"
						onchange={async (e) => {
							validationError = null;
							const input = e.currentTarget as HTMLInputElement;
							try {
								await channel.restore(input.files?.[0]);

								// Validate keytag matches selected entry
								if (selectedKeytag && channel.keytag !== selectedKeytag) {
									channel.error = 'This keyfile belongs to a different channel.';
									validationError = channel.error;
									channel.clear();
									return;
								}

								if (rememberKey && channel.keytag) {
									await cacheKey(channel.keytag, authKey.privateKey);
									track('key-cache', { context: 'restore' });
								}
								notify.success('Channel restored');
								track('channel-restore', { method: 'file' });
								const changeAddress = await wallet.connection!.getChangeAddress();
								identify(changeAddress, {
									wallet: wallet.name!,
									network: network.current,
									keytag: channel.keytag!
								});
								track('onboarding-step', { step: 'channel-restore' });
								onRestore();
							} catch (err) {
								notify.error(getErrorMessage(err, 'Failed to restore'));
							}
						}}
						aria-invalid={channel.error !== null || validationError !== null}
						title="Load key file"
					/>
					{#if validationError}
						<Field.Error>{validationError}</Field.Error>
					{:else if channel.error}
						<Field.Error>{channel.error}</Field.Error>
					{/if}
				</Field.Content>
				<Field.Description class="text-muted-foreground flex flex-col text-xs">
					<span>• File is read locally in your browser</span>
					<span>• Never uploaded or stored on any server</span>
				</Field.Description>
			</Field.Field>
			{#if isCacheSupported()}
				<div class="flex items-center gap-2">
					<Checkbox id="remember-key-restore" bind:checked={rememberKey} />
					<Label class="text-sm" for="remember-key-restore">Remember this key on this device</Label>
				</div>
				<p class="text-muted-foreground pl-6 text-xs">
					Skip the file upload next time. Only use on devices you trust.
				</p>
			{/if}
			{#if cachedKeyExists && showFileUpload}
				<button
					class="text-muted-foreground hover:text-foreground w-full text-center text-xs underline"
					onclick={() => (showFileUpload = false)}
				>
					Back to one-click unlock
				</button>
			{/if}
		{/if}
	</div>
{/if}
