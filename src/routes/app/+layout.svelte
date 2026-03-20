<script lang="ts">
	import '../../app.css';
	import favicon from '$lib/assets/logo.png';
	import * as Field from '$lib/components/ui/field/index.js';
	import { setWalletState, Wallet } from '$lib/wallet/wallet.svelte';
	import { setAuthKeyState, AuthKey } from '$lib/subbit/authKey.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import WalletInfo from '$lib/components/WalletInfo.svelte';
	import ChannelInfo from '$lib/components/ChannelInfo.svelte';
	import ApiAccessInfo from '$lib/components/ApiAccessInfo.svelte';
	import TosChangeDialog from '$lib/components/TosChangeDialog.svelte';
	import { setChannelState, Channel } from '$lib/subbit/channel.svelte';
	import { setODAPIState, ODAPI } from '$lib/odapi/odapi.svelte';
	import { ChannelStore, setChannelStoreState } from '$lib/subbit/channelStore.svelte';
	import { env } from '$env/dynamic/public';
	import { NetworkState, setNetworkState } from '$lib/network.svelte';
	import NetworkSelector from '$lib/components/NetworkSelector.svelte';

	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button/index.js';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';

	let { children } = $props();

	const network = setNetworkState(new NetworkState(env.PUBLIC_MAINNET_ENABLED === 'true'));
	const walletState = setWalletState(new Wallet());
	const authKey = setAuthKeyState(new AuthKey());
	const channelStore = setChannelStoreState(new ChannelStore());
	const channel = setChannelState(new Channel());
	const odapi = setODAPIState(new ODAPI());
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<TosChangeDialog />
<Sidebar.Provider>
	<Sidebar.Root variant="sidebar" collapsible="icon">
		<Sidebar.Header>
			<a href="/" class="flex items-center gap-2 text-sm font-semibold">
				<img src={favicon} alt="Orcfax" class="h-8 w-8 shrink-0" />
				<span class="group-data-[collapsible=icon]:hidden">Orcfax On-Demand</span>
				<Badge
					variant="secondary"
					class="bg-primary text-primary-foreground group-data-[collapsible=icon]:hidden"
					>Beta</Badge
				>
			</a>
			<Sidebar.Separator />
			<div class="flex w-full justify-between gap-4">
				<div class="mb-2 px-2 pt-1 group-data-[collapsible=icon]:hidden">
					<NetworkSelector />
				</div>
				<div class="flex items-center gap-2 pb-2 group-data-[collapsible=icon]:hidden">
					<ThemeToggle />
				</div>
			</div>
		</Sidebar.Header>
		<Sidebar.Content class="group-data-[collapsible=icon]:hidden">
			<Sidebar.Separator />
			<Sidebar.Group>
				<Field.Group class="space-y-2 px-2">
					<svelte:boundary>
						<WalletInfo />
						{#snippet failed(error, reset)}
							<Alert variant="destructive" class="text-sm">
								<AlertDescription
									>{error instanceof Error
										? error.message
										: 'An unexpected error occurred'}</AlertDescription
								>
							</Alert>
							<Button variant="outline" size="sm" class="mt-2 w-full" onclick={reset}>
								Try Again
							</Button>
						{/snippet}
					</svelte:boundary>
				</Field.Group>
			</Sidebar.Group>
			<Sidebar.Separator />
			<Sidebar.Group>
				<svelte:boundary>
					<ChannelInfo />
					{#snippet failed(error, reset)}
						<div class="px-2">
							<Alert variant="destructive" class="text-sm">
								<AlertDescription
									>{error instanceof Error
										? error.message
										: 'An unexpected error occurred'}</AlertDescription
								>
							</Alert>
							<Button variant="outline" size="sm" class="mt-2 w-full" onclick={reset}>
								Try Again
							</Button>
						</div>
					{/snippet}
				</svelte:boundary>
			</Sidebar.Group>
			<Sidebar.Separator />
			<Sidebar.Group>
				<Field.Group class="space-y-2 px-2">
					<ApiAccessInfo />
				</Field.Group>
			</Sidebar.Group>
		</Sidebar.Content>
		<Sidebar.Rail />
		<Sidebar.Footer>
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton size="sm" variant="outline" class="justify-center">
						{#snippet child({ props })}
							<Sidebar.Trigger {...props} />
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		</Sidebar.Footer>
	</Sidebar.Root>

	<Sidebar.Inset>
		<main class="bg-background mx-auto w-full max-w-7xl flex-1 py-6 sm:px-6 lg:px-8">
			<svelte:boundary>
				{@render children?.()}
				{#snippet failed(error, reset)}
					<div class="flex flex-col items-center justify-center gap-4 py-12 text-center">
						<h2 class="text-xl font-semibold">Something went wrong</h2>
						<p class="text-destructive text-sm">
							{error instanceof Error ? error.message : 'An unexpected error occurred'}
						</p>
						<Button onclick={reset}>Try Again</Button>
					</div>
				{/snippet}
			</svelte:boundary>
		</main>
	</Sidebar.Inset>
</Sidebar.Provider>
