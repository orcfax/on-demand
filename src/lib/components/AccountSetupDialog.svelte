<script lang="ts">
	import { browser } from '$app/environment';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Accordion from '$lib/components/ui/accordion/index.js';
	import { getWalletState } from '$lib/wallet/wallet.svelte';
	import { getAuthKeyState } from '$lib/subbit/authKey.svelte';
	import { getChannelState } from '$lib/subbit/channel.svelte';
	import { getODAPIState } from '$lib/odapi/odapi.svelte';
	import { getChannelStoreState } from '$lib/subbit/channelStore.svelte';
	import { getNetworkState } from '$lib/network.svelte';
	import { hasCachedKey } from '$lib/subbit/keyCache';
	import { track, identify } from '$lib/analytics';
	import WalletSetup from './WalletSetup.svelte';
	import ChannelSetup from './ChannelSetup.svelte';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import ChannelRestore from './ChannelRestore.svelte';

	const walletState = getWalletState();
	const authKey = getAuthKeyState();
	const channel = getChannelState();
	const odapi = getODAPIState();
	const channelStore = getChannelStoreState();
	const network = getNetworkState();

	const storedChannels = $derived(channelStore.entriesForNetwork(network.current));
	let newOrReturning = $derived<'new' | 'returning'>(
		browser && storedChannels.length > 0 ? 'returning' : 'new'
	);

	// Compute what's missing
	const isWalletSetup = $derived(walletState.isConnected);

	// Auto-restore: skip dialog entirely for returning users with cached keys
	const hasStoredWallet = browser && localStorage.getItem('orcfax_connected_wallet') !== null;
	const mayAutoRestore = $derived(hasStoredWallet && storedChannels.length > 0);
	let autoRestoreStarted = $state(false);
	let autoRestoreDone = $state(false);

	async function tryAutoRestore() {
		for (const entry of storedChannels) {
			if (await hasCachedKey(entry.keytag)) {
				await channel.restoreFromCache(entry.keytag);
				const changeAddress = await walletState.connection!.getChangeAddress();
				identify(changeAddress, {
					wallet: walletState.name!,
					network: network.current,
					keytag: channel.keytag!
				});
				track('channel-restore', { method: 'auto' });
				return;
			}
		}
	}

	// Check for interrupted channel opening (browser crash during post-submit sync).
	// Synchronous localStorage check prevents auto-restore from racing ahead.
	const hasPendingOpen = browser && localStorage.getItem('orcfax_pending_open') !== null;
	let pendingOpenStarted = $state(false);
	$effect(() => {
		if (!hasPendingOpen || pendingOpenStarted || !isWalletSetup) return;
		pendingOpenStarted = true;
		channel.resumePendingOpen().catch(() => {});
	});

	$effect(() => {
		if (autoRestoreStarted || !mayAutoRestore || !isWalletSetup) return;
		// Don't auto-restore if a pending open exists — it takes priority
		if (hasPendingOpen) {
			autoRestoreDone = true;
			return;
		}
		autoRestoreStarted = true;
		tryAutoRestore().finally(() => {
			autoRestoreDone = true;
		});
	});
	const isKeySetup = $derived(authKey.isLoaded);
	const isChannelSetup = $derived(channel.isOpen);
	const isKeyDownloaded = $derived(authKey.isDownloaded);

	const isFullySetup = $derived(
		isWalletSetup &&
			((newOrReturning === 'returning' && isKeySetup && (authKey.isRestored || isKeyDownloaded)) ||
				(newOrReturning === 'new' && isChannelSetup && isKeySetup && isKeyDownloaded))
	);

	// Guard: keep the "New User" tab visible during the opening flow so the user
	// can download their freshly-created key before the dialog closes.
	// Also stay on 'new' during pendingSync (post-submit recovery) since the
	// recovery UI lives in ChannelSetup.
	const effectiveTab = $derived<'new' | 'returning'>(
		(channel.isOpen && authKey.isLoaded && !authKey.isRestored && !authKey.isDownloaded) ||
			channel.pendingSync
			? 'new'
			: newOrReturning
	);

	// Determine which step we're on
	const currentStep = $derived.by(() => {
		if (!isWalletSetup) return 1;
		if (!isChannelSetup) return 2;
		return 2;
	});

	// Auto-expand the current step (single mode uses string, not array)
	let activeStep = $state('step-1');

	// Watch for step changes and auto-expand next step
	$effect(() => {
		const stepValue = `step-${currentStep}`;
		if (currentStep <= 3) {
			activeStep = stepValue;
		}
	});

	const stepStatus = $derived({
		wallet: isWalletSetup ? 'complete' : currentStep === 1 ? 'active' : 'pending',
		channel: isChannelSetup ? 'complete' : currentStep === 2 ? 'active' : 'pending'
	});

	// Initialize ODAPI each time setup completes (including after network switch)
	$effect(() => {
		if (isFullySetup) {
			void odapi.initialize();
		}
	});
</script>

{#if mayAutoRestore && !autoRestoreDone && !isFullySetup}
	<div class="bg-background fixed inset-0 z-50 flex items-center justify-center">
		<div class="flex flex-col items-center gap-3">
			<svg
				class="text-muted-foreground h-8 w-8 animate-spin"
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
			>
				<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
				></circle>
				<path
					class="opacity-75"
					fill="currentColor"
					d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
				></path>
			</svg>
			<p class="text-muted-foreground text-sm">Connecting...</p>
		</div>
	</div>
{/if}

<Dialog.Root open={!isFullySetup && (!mayAutoRestore || autoRestoreDone)}>
	<Dialog.Overlay class="bg-black/80" />
	<Dialog.Content
		class="max-h-[90vh] max-w-2xl overflow-y-auto"
		interactOutsideBehavior="ignore"
		escapeKeydownBehavior="ignore"
		showCloseButton={false}
	>
		<Dialog.Header>
			<Dialog.Title>Connect to Orcfax On-Demand</Dialog.Title>
			<Dialog.Description>
				Please complete the following steps to access the service.
			</Dialog.Description>
		</Dialog.Header>

		<div class="py-4">
			<Accordion.Root type="single" bind:value={activeStep}>
				<!-- Step 1: Wallet -->
				<Accordion.Item
					value="step-1"
					disabled={stepStatus.wallet === 'pending' || channel.opening}
				>
					<Accordion.Trigger
						class="hover:no-underline focus-visible:border-transparent focus-visible:ring-0 data-[state=open]:pb-2"
						disabled={stepStatus.wallet === 'pending' || channel.opening}
					>
						<div class="flex items-center gap-3">
							<div
								class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
								class:bg-green-500={stepStatus.wallet === 'complete'}
								class:text-white={stepStatus.wallet === 'complete' ||
									stepStatus.wallet === 'active'}
								class:bg-blue-500={stepStatus.wallet === 'active'}
								class:bg-gray-300={stepStatus.wallet === 'pending'}
								class:text-gray-600={stepStatus.wallet === 'pending'}
							>
								{#if stepStatus.wallet === 'complete'}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 20 20"
										fill="currentColor"
										class="h-4 w-4"
									>
										<path
											fill-rule="evenodd"
											d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
											clip-rule="evenodd"
										/>
									</svg>
								{:else}
									1
								{/if}
							</div>
							<span class="text-base font-semibold">Connect Wallet</span>
						</div>
					</Accordion.Trigger>
					<Accordion.Content class="pt-2 pb-4 pl-10">
						<WalletSetup />
					</Accordion.Content>
				</Accordion.Item>

				<!-- Step 2: Channel -->
				<Accordion.Item value="step-2" disabled={stepStatus.channel === 'pending'}>
					<Accordion.Trigger
						class="hover:no-underline data-[state=open]:pb-4"
						disabled={stepStatus.channel === 'pending'}
					>
						<div class="flex items-center gap-3">
							<div
								class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
								class:bg-green-500={stepStatus.channel === 'complete'}
								class:text-white={stepStatus.channel === 'complete' ||
									stepStatus.channel === 'active'}
								class:bg-blue-500={stepStatus.channel === 'active'}
								class:bg-gray-300={stepStatus.channel === 'pending'}
								class:text-gray-600={stepStatus.channel === 'pending'}
							>
								{#if stepStatus.channel === 'complete'}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 20 20"
										fill="currentColor"
										class="h-4 w-4"
									>
										<path
											fill-rule="evenodd"
											d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
											clip-rule="evenodd"
										/>
									</svg>
								{:else}
									2
								{/if}
							</div>
							<span class="text-base font-semibold">Channel</span>
						</div>
					</Accordion.Trigger>
					<Accordion.Content class="pb-4 pl-10">
						<Tabs.Root
							disabled={isChannelSetup}
							value={effectiveTab}
							onValueChange={(tab) => {
								newOrReturning = tab as 'new' | 'returning';
								authKey.clear();
								channel.clear();
							}}
							class="w-full"
						>
							<Tabs.List class="grid w-full grid-cols-2">
								<Tabs.Trigger value="new">New User</Tabs.Trigger>
								<Tabs.Trigger value="returning" disabled={channel.opening}
									>Returning User</Tabs.Trigger
								>
							</Tabs.List>

							<Tabs.Content value="new" class="space-y-4">
								<ChannelSetup />
							</Tabs.Content>

							<Tabs.Content value="returning" class="space-y-4">
								<ChannelRestore {storedChannels} onRestore={() => {}} />
							</Tabs.Content>
						</Tabs.Root>
					</Accordion.Content>
				</Accordion.Item>
			</Accordion.Root>
		</div>

		<Dialog.Footer>
			{#if !isFullySetup}
				<p class="text-muted-foreground text-sm">Complete all steps above to access the service.</p>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
