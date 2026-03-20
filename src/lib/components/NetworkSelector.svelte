<script lang="ts">
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { getNetworkState, type Network } from '$lib/network.svelte';
	import { getWalletState } from '$lib/wallet/wallet.svelte';
	import { getAuthKeyState } from '$lib/subbit/authKey.svelte';
	import { getChannelState } from '$lib/subbit/channel.svelte';
	import { getODAPIState } from '$lib/odapi/odapi.svelte';

	const network = getNetworkState();
	const wallet = getWalletState();
	const authKey = getAuthKeyState();
	const channel = getChannelState();
	const odapi = getODAPIState();

	function handleChange(value: string | undefined) {
		if (!value || value === network.current) return;
		const next = value as Network;
		if (!network.isSelectable(next)) return;

		wallet.disconnect();
		authKey.clear();
		channel.clear();
		void odapi.clearStoredUpdates();

		network.current = next;
	}
</script>

<div>
	<Field.Label class="pb-2">Network</Field.Label>
	<Select.Root type="single" value={network.current} onValueChange={handleChange}>
		<Select.Trigger size="sm" class="w-fit">
			{network.current}
		</Select.Trigger>
		<Select.Content>
			{#each network.available as net (net)}
				<Select.Item value={net} disabled={!network.isSelectable(net)}>
					{net}{#if !network.isSelectable(net)}
						(coming soon){/if}
				</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>
</div>
