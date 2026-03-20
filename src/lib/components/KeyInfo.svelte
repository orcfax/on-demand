<script lang="ts">
	import { getAuthKeyState } from '$lib/subbit/authKey.svelte';
	import { getChannelState } from '$lib/subbit/channel.svelte';
	import ClearIcon from '@lucide/svelte/icons/circle-x';
	import LockKeyholeIcon from '@lucide/svelte/icons/lock-keyhole';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import StatusIndicator from '$lib/components/StatusIndicator.svelte';
	import { hasCachedKey, deleteCachedKey, isCacheSupported } from '$lib/subbit/keyCache';

	const authKey = getAuthKeyState();
	const channel = getChannelState();

	let cachedKeyExists = $state(false);

	$effect(() => {
		const keytag = channel.keytag;
		if (!keytag || !isCacheSupported()) {
			cachedKeyExists = false;
			return;
		}
		hasCachedKey(keytag).then((exists) => {
			cachedKeyExists = exists;
		});
	});

	async function handleRemoveCache() {
		if (!channel.keytag) return;
		await deleteCachedKey(channel.keytag);
		cachedKeyExists = false;
	}
</script>

<Field.Field>
	<Field.Content>
		<Field.Label>
			<div class="flex items-center gap-2">
				<StatusIndicator color="green" size="md" />
				<div class="flex items-center gap-1">
					<span>Auth Key</span>
					<span class="text-muted-foreground text-xs font-medium">loaded</span>
				</div>
			</div>
		</Field.Label>

		<div class="space-y-2">
			<div class="text-muted-foreground text-xs font-medium">Public Key</div>
			<div class="flex items-center gap-2">
				<Input
					type="text"
					value={authKey.vkeyHex}
					readonly
					class="font-mono text-xs"
					title="Public key"
				/>
				<Button
					variant="outline"
					size="icon"
					title="Clear key"
					onclick={() => {
						authKey.clear();
					}}
				>
					<ClearIcon class="h-4 w-4" />
				</Button>
			</div>
		</div>

		{#if cachedKeyExists}
			<div class="mt-2 flex items-center gap-2">
				<LockKeyholeIcon class="text-muted-foreground h-3 w-3" />
				<span class="text-muted-foreground text-xs">Key saved in browser</span>
				<button
					class="text-muted-foreground hover:text-destructive text-xs underline"
					onclick={handleRemoveCache}
				>
					Remove
				</button>
			</div>
		{/if}
	</Field.Content>
</Field.Field>
