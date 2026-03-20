<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Accordion from '$lib/components/ui/accordion/index.js';
	import Button from '$lib/components/ui/button/button.svelte';
	import TermsOfService from './TermsOfService.svelte';
	import CloseChannelDialog from './CloseChannelDialog.svelte';
	import { tos, TOS_VERSION, computeTosHash, isInGracePeriod, getGraceDeadline } from '$lib/tos';
	import { getChannelStoreState } from '$lib/subbit/channelStore.svelte';
	import { getChannelState } from '$lib/subbit/channel.svelte';
	import AlertTriangleIcon from '@lucide/svelte/icons/alert-triangle';

	const channelStore = getChannelStoreState();
	const channel = getChannelState();

	const inGrace = isInGracePeriod();
	const graceDeadline = getGraceDeadline();

	const storedEntry = $derived(channel.keytag ? channelStore.get(channel.keytag) : null);
	const needsConsent = $derived(
		channel.isRestored && storedEntry !== null && storedEntry.tosVersion !== TOS_VERSION
	);

	let dismissed = $state(false);
	const sessionKey = `tos_reminded_${TOS_VERSION}`;
	const alreadyReminded =
		typeof sessionStorage !== 'undefined' && sessionStorage.getItem(sessionKey) === '1';

	const open = $derived(needsConsent && !dismissed && !alreadyReminded);

	let closeDialogOpen = $state(false);

	// Diff computation
	const prev = tos.previousVersion;
	type DiffRow = { label: string; old: string; current: string };

	const diffRows: DiffRow[] = (() => {
		if (!prev) return [];
		const rows: DiffRow[] = [];

		if (prev.pricing.updateCostLovelace !== tos.pricing.updateCostLovelace) {
			rows.push({
				label: 'Fetch price',
				old: `${prev.pricing.updateCostLovelace / 1_000_000} ADA`,
				current: `${tos.pricing.updateCostLovelace / 1_000_000} ADA`
			});
		}
		if (prev.pricing.publishCostLovelace !== tos.pricing.publishCostLovelace) {
			rows.push({
				label: 'Publish price',
				old: `${prev.pricing.publishCostLovelace / 1_000_000} ADA`,
				current: `${tos.pricing.publishCostLovelace / 1_000_000} ADA`
			});
		}
		if (prev.closePeriodMs !== tos.channel.closePeriodMs) {
			rows.push({
				label: 'Close period',
				old: `${prev.closePeriodMs / 3_600_000} hrs`,
				current: `${tos.channel.closePeriodMs / 3_600_000} hrs`
			});
		}
		if (prev.minDepositAda !== tos.channel.minDepositAda) {
			rows.push({
				label: 'Min deposit',
				old: `${prev.minDepositAda} ADA`,
				current: `${tos.channel.minDepositAda} ADA`
			});
		}

		return rows;
	})();

	function acceptTos() {
		if (!channel.keytag) return;
		channelStore.update(channel.keytag, {
			tosVersion: TOS_VERSION,
			tosHash: computeTosHash(),
			tosAcceptedAt: new Date().toISOString()
		});
		dismissed = true;
	}

	function remindLater() {
		if (typeof sessionStorage !== 'undefined') {
			sessionStorage.setItem(sessionKey, '1');
		}
		dismissed = true;
	}

	function handleCloseChannel() {
		dismissed = true;
		// Small delay so the ToS dialog unmounts before the close dialog opens
		setTimeout(() => {
			closeDialogOpen = true;
		}, 150);
	}
</script>

<Dialog.Root {open}>
	<Dialog.Content
		class="max-h-[90vh] max-w-2xl overflow-y-auto"
		interactOutsideBehavior={inGrace ? 'close' : 'ignore'}
		escapeKeydownBehavior={inGrace ? 'close' : 'ignore'}
	>
		<Dialog.Header>
			<Dialog.Title class={!inGrace ? 'flex items-center gap-2 text-amber-500' : ''}>
				{#if !inGrace}
					<AlertTriangleIcon class="h-5 w-5" />
				{/if}
				{#if inGrace}
					Terms of Service Updating
				{:else}
					Terms of Service Updated
				{/if}
			</Dialog.Title>
			<Dialog.Description>
				{#if storedEntry?.tosVersion}
					Updated from v{storedEntry.tosVersion} to v{TOS_VERSION}
				{:else}
					Version {TOS_VERSION}
				{/if}
				{#if inGrace && graceDeadline}
					&middot; Previous terms in effect until {graceDeadline.toLocaleString()}
				{/if}
			</Dialog.Description>
		</Dialog.Header>

		{#if !inGrace}
			<p class="text-muted-foreground text-sm">
				You must accept the updated terms to continue using your channel.
			</p>
		{/if}

		{#if diffRows.length > 0}
			<div class="bg-muted rounded-lg p-3 text-sm">
				<p class="mb-2 font-medium">What changed:</p>
				<div class="space-y-1">
					{#each diffRows as row (row.label)}
						<div class="flex items-center justify-between">
							<span class="text-muted-foreground">{row.label}</span>
							<span>
								<span class="text-muted-foreground line-through">{row.old}</span>
								<span class="mx-1">&rarr;</span>
								<span class="font-semibold">{row.current}</span>
							</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		{#if diffRows.length === 0 && tos.changelog.length > 0}
			<div class="bg-muted rounded-lg p-3 text-sm">
				<p class="mb-1 font-medium">What changed:</p>
				<ul class="list-disc pl-4">
					{#each tos.changelog[0].changes as change, i (i)}
						<li>{change}</li>
					{/each}
				</ul>
			</div>
		{/if}

		<Accordion.Root type="multiple">
			<Accordion.Item value="full-tos" class="border-b-0">
				<Accordion.Trigger>View Full Terms of Service</Accordion.Trigger>
				<Accordion.Content>
					<div class="max-h-[40vh] overflow-y-auto rounded-lg border p-4">
						<TermsOfService showGraceAlert={false} />
					</div>
				</Accordion.Content>
			</Accordion.Item>
		</Accordion.Root>

		<p class="text-muted-foreground text-xs">
			You can also <a href="/tos" class="underline">view the full terms</a> on a dedicated page.
		</p>

		<Dialog.Footer class="flex gap-2">
			{#if inGrace}
				<Button variant="ghost" onclick={remindLater}>Remind Me Later</Button>
				<Button variant="outline" onclick={handleCloseChannel}>Close My Channel</Button>
				<Button onclick={acceptTos}>Accept Now</Button>
			{:else}
				<Button variant="outline" onclick={handleCloseChannel}>Close My Channel</Button>
				<Button onclick={acceptTos}>I Accept</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<CloseChannelDialog bind:open={closeDialogOpen} />
