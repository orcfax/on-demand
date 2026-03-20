<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Accordion from '$lib/components/ui/accordion/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import Spinner from '$lib/components/ui/spinner/spinner.svelte';
	import { getWalletState } from '$lib/wallet/wallet.svelte';
	import { getChannelState } from '$lib/subbit/channel.svelte';
	import { track } from '$lib/analytics';
	import { notify } from '$lib/toast';
	import { getErrorMessage } from '$lib/errors';

	interface Props {
		open?: boolean;
	}

	let { open = $bindable(false) }: Props = $props();

	const wallet = getWalletState();
	const channel = getChannelState();

	const formatAda = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });

	let activeStep = $state('step-1');
	let confirmed = $state(false);
	let success = $state(false);

	const isExpire = $derived(channel.canExpire);

	const stepStatus = $derived({
		review: confirmed ? 'complete' : 'active',
		transaction: !confirmed
			? 'pending'
			: channel.withdrawing
				? 'active'
				: success
					? 'complete'
					: 'active'
	});

	async function handleWithdraw() {
		try {
			await channel.withdraw(wallet);
			success = true;
			notify.success('Funds withdrawn successfully');
			track('channel-withdraw');
		} catch (err) {
			notify.error(getErrorMessage(err, 'Failed to withdraw funds'));
			confirmed = false;
			activeStep = 'step-1';
		}
	}

	function handleOpenChange(newOpen: boolean) {
		if (!newOpen && channel.withdrawing) return;
		open = newOpen;
		if (!newOpen) {
			setTimeout(() => {
				confirmed = false;
				success = false;
				channel.error = null;
				channel.syncStatus = '';
				activeStep = 'step-1';
			}, 300);
		}
	}
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
	<Dialog.Overlay class="bg-black/80" />
	<Dialog.Content
		class="max-h-[90vh] max-w-2xl overflow-y-auto"
		interactOutsideBehavior={channel.withdrawing ? 'ignore' : 'close'}
		escapeKeydownBehavior={channel.withdrawing ? 'ignore' : 'close'}
	>
		<Dialog.Header>
			<Dialog.Title>Withdraw Funds</Dialog.Title>
			<Dialog.Description>
				{#if isExpire}
					The settlement period has expired. You can reclaim all channel funds.
				{:else}
					The provider has settled outstanding charges. You can withdraw your remaining funds.
				{/if}
			</Dialog.Description>
		</Dialog.Header>

		<div class="py-4">
			<Accordion.Root type="single" bind:value={activeStep}>
				<!-- Step 1: Review Withdrawal -->
				<Accordion.Item value="step-1">
					<Accordion.Trigger
						class="hover:no-underline data-[state=open]:pb-0"
						disabled={channel.withdrawing || confirmed}
					>
						<div class="flex items-center gap-3">
							<div
								class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
								class:bg-green-500={stepStatus.review === 'complete'}
								class:text-white={stepStatus.review === 'complete' ||
									stepStatus.review === 'active'}
								class:bg-blue-500={stepStatus.review === 'active'}
								class:bg-gray-300={stepStatus.review === 'pending'}
								class:text-gray-600={stepStatus.review === 'pending'}
							>
								{#if stepStatus.review === 'complete'}
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
							<span class="text-base font-semibold">Review Withdrawal</span>
						</div>
					</Accordion.Trigger>
					<Accordion.Content class="pb-4 pl-10">
						<div class="space-y-4">
							{#if isExpire}
								<Alert class="border-yellow-500/40 bg-yellow-50 text-yellow-700">
									<AlertDescription class="text-sm">
										The settlement period has expired without provider action. You can reclaim all
										channel funds.
									</AlertDescription>
								</Alert>
							{:else}
								<Alert class="border-blue-500/40 bg-blue-50 text-blue-700">
									<AlertDescription class="text-sm">
										The provider has settled outstanding charges. You can withdraw your remaining
										funds.
									</AlertDescription>
								</Alert>
							{/if}

							<div class="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-4">
								<div class="flex items-center justify-between text-sm">
									<span class="text-muted-foreground">
										{isExpire ? 'Funds to reclaim:' : 'Estimated return:'}
									</span>
									<span class="font-semibold">
										{formatAda.format(channel.subbitAmtInAda)} ADA
									</span>
								</div>
								{#if !isExpire}
									<p class="text-muted-foreground text-xs">
										Exact amount depends on settlement deductions.
									</p>
								{/if}
							</div>

							<Button
								class="w-full"
								onclick={() => {
									confirmed = true;
									setTimeout(() => {
										activeStep = 'step-2';
									}, 0);
								}}
								disabled={channel.withdrawing || confirmed}
							>
								Withdraw Funds
							</Button>
						</div>
					</Accordion.Content>
				</Accordion.Item>

				<!-- Step 2: Sign & Submit -->
				<Accordion.Item value="step-2">
					<Accordion.Trigger
						class="hover:no-underline data-[state=open]:pb-4"
						disabled={channel.withdrawing}
					>
						<div class="flex items-center gap-3">
							<div
								class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
								class:bg-green-500={stepStatus.transaction === 'complete' && !channel.withdrawing}
								class:text-white={stepStatus.transaction === 'complete' ||
									stepStatus.transaction === 'active'}
								class:bg-blue-500={stepStatus.transaction === 'active'}
								class:bg-gray-300={stepStatus.transaction === 'pending'}
								class:text-gray-600={stepStatus.transaction === 'pending'}
							>
								{#if stepStatus.transaction === 'complete' && !channel.withdrawing}
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
								{:else if channel.withdrawing}
									<Spinner class="h-4 w-4" />
								{:else}
									2
								{/if}
							</div>
							<span class="text-base font-semibold">Sign & Submit Transaction</span>
						</div>
					</Accordion.Trigger>
					<Accordion.Content class="pb-4 pl-10">
						<div class="space-y-4">
							{#if success && !channel.error}
								<Alert class="border-green-500/40 bg-green-50 text-green-700">
									<AlertDescription class="text-sm">
										<strong>Funds withdrawn!</strong> ADA returned to your wallet.
									</AlertDescription>
								</Alert>
							{:else if !channel.error}
								<Button class="w-full" onclick={handleWithdraw} disabled={channel.withdrawing}>
									{#if channel.withdrawing}
										<Spinner class="mr-2 h-4 w-4" />
										{#if channel.syncStatus}
											{channel.syncStatus}
										{:else}
											Withdrawing...
										{/if}
									{:else}
										Start Transaction
									{/if}
								</Button>
							{/if}

							{#if channel.error}
								<Alert class="border-red-500/40 bg-red-50 text-red-700">
									<AlertTitle class="font-bold">Error</AlertTitle>
									<AlertDescription class="text-sm">
										{channel.error}
									</AlertDescription>
								</Alert>

								<Button
									class="w-full"
									onclick={() => {
										channel.error = null;
										confirmed = false;
										success = false;
										activeStep = 'step-1';
									}}
								>
									Try Again
								</Button>
							{/if}
						</div>
					</Accordion.Content>
				</Accordion.Item>
			</Accordion.Root>
		</div>

		<Dialog.Footer>
			{#if success && !channel.error}
				<Button onclick={() => handleOpenChange(false)} class="w-full">Done</Button>
			{:else if channel.withdrawing}
				<p class="text-muted-foreground text-sm">
					Please wait while the transaction is being processed...
				</p>
			{:else if !confirmed}
				<Button variant="outline" onclick={() => handleOpenChange(false)} class="w-full">
					Cancel
				</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
