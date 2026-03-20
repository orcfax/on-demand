<script lang="ts">
	import DownloadIcon from '@lucide/svelte/icons/download';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { getAuthKeyState } from '$lib/subbit/authKey.svelte';
	import { getChannelState } from '$lib/subbit/channel.svelte';
	import { notify } from '$lib/toast';
	import { track } from '$lib/analytics';
	import { cacheKey, deleteCachedKey, isCacheSupported } from '$lib/subbit/keyCache';

	const authKey = getAuthKeyState();
	const channel = getChannelState();

	let keypairAcknowledge = $state(false);
	let rememberKey = $state(false);

	async function toggleRemember(checked: boolean) {
		rememberKey = checked;
		if (!channel.keytag) return;
		if (checked) {
			await cacheKey(channel.keytag, authKey.privateKey);
			track('key-cache', { context: 'setup' });
		} else {
			await deleteCachedKey(channel.keytag);
		}
	}
</script>

<Alert class="mb-4 border-yellow-500/40 text-yellow-500">
	<AlertTitle class="pb-2 font-bold">Warning</AlertTitle>
	<AlertDescription class="flex flex-col gap-2">
		<p class="text-sm">Your key is used to sign and make data requests.</p>
		<p class="text-sm">Keep it secure and accessible:</p>
		<ul class="ml-4 list-disc space-y-1 text-sm">
			<li>Store the downloaded file in a safe location</li>
			<li>Never share your private key with anyone</li>
			<li>Back up the file - it cannot be regenerated</li>
			<li>Never reuse this key in other unrelated services</li>
			<li>Never edit the file</li>
		</ul>
		<div class="my-2 flex items-center gap-2">
			<Checkbox id="keypair-ack" bind:checked={keypairAcknowledge} />
			<Label class="text-foreground text-sm" for="keypair-ack">I understand</Label>
		</div>
	</AlertDescription>
</Alert>

<Button
	class="w-full"
	onclick={() => {
		authKey.cacheAndDownloadKey(channel.tag);
		notify.success('Key downloaded successfully');
		track('key-download');
		track('onboarding-step', { step: 'key-download' });
	}}
	disabled={!keypairAcknowledge}
>
	<DownloadIcon class="mr-2 h-4 w-4" />
	Download Key
</Button>

{#if authKey.isDownloaded && isCacheSupported()}
	<div class="space-y-1">
		<div class="flex items-center gap-2">
			<Checkbox
				id="remember-key"
				checked={rememberKey}
				onCheckedChange={(v) => toggleRemember(v === true)}
			/>
			<Label class="text-sm" for="remember-key">Remember this key on this device</Label>
		</div>
		<p class="text-muted-foreground pl-6 text-xs">
			Your key will be stored in this browser. Only use on devices you trust.
		</p>
	</div>
{/if}
