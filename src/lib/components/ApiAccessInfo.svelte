<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { getChannelState } from '$lib/subbit/channel.svelte';
	import { notify } from '$lib/toast';
	import { track } from '$lib/analytics';
	import TerminalIcon from '@lucide/svelte/icons/terminal';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import CheckIcon from '@lucide/svelte/icons/check';

	const channel = getChannelState();

	const baseUrl = $derived(typeof window !== 'undefined' ? window.location.origin : '');
	let open = $state(false);
	let copiedIndex = $state(-1);

	const curlExamples = $derived([
		{
			method: 'GET',
			label: 'List feeds (no auth)',
			curl: `curl ${baseUrl}/api/feeds`
		},
		{
			method: 'GET',
			label: 'Terms of service (no auth)',
			curl: `curl ${baseUrl}/api/tos`
		},
		{
			method: 'GET',
			label: 'Channel info (Stamp credential)',
			curl: `curl ${baseUrl}/api/channel \\
  -H "X-Credential: <stamp-credential>"`
		},
		{
			method: 'GET',
			label: 'Get prices (IOU credential)',
			curl: `curl "${baseUrl}/api/prices?feed_id=ADA-USD" \\
  -H "X-Credential: <iou-credential>" \\
  -H "X-ToS-Accepted: true"`
		},
		{
			method: 'POST',
			label: 'Publish price (IOU credential)',
			curl: `curl -X POST "${baseUrl}/api/publish?feed_id=ADA-USD" \\
  -H "X-Credential: <iou-credential>" \\
  -H "X-ToS-Accepted: true"`
		}
	]);

	function copyToClipboard(text: string, index: number) {
		navigator.clipboard.writeText(text);
		notify.success('Copied');
		track('api-copy', { item: index === -2 ? 'base-url' : curlExamples[index].label });
		copiedIndex = index;
		setTimeout(() => {
			if (copiedIndex === index) copiedIndex = -1;
		}, 2000);
	}
</script>

{#if channel.isOpen}
	<Field.Field>
		<Field.Content>
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2">
					<TerminalIcon class="text-muted-foreground h-4 w-4" />
					<Field.Label>API Access</Field.Label>
				</div>
				<Button
					variant="outline"
					size="sm"
					class="h-7 text-xs"
					onclick={() => {
						track('api-dialog-open');
						open = true;
					}}
				>
					View
				</Button>
			</div>
			<p class="text-muted-foreground truncate px-2 text-xs">{baseUrl}/api/</p>
		</Field.Content>
	</Field.Field>

	<Dialog.Root bind:open>
		<Dialog.Overlay class="bg-black/80" />
		<Dialog.Content class="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
			<Dialog.Header>
				<Dialog.Title>API Access</Dialog.Title>
				<Dialog.Description>
					REST endpoints for your Orcfax On-Demand channel. Copy and use these curl commands to
					interact with the API directly.
				</Dialog.Description>
			</Dialog.Header>

			<div class="space-y-2">
				<div class="flex items-center gap-2">
					<span class="text-muted-foreground text-xs font-medium">Base URL</span>
					<code class="bg-muted rounded px-2 py-0.5 text-xs">{baseUrl}/api</code>
					<button
						class="text-muted-foreground hover:text-foreground transition-colors"
						onclick={() => copyToClipboard(`${baseUrl}/api`, -2)}
					>
						{#if copiedIndex === -2}
							<CheckIcon class="h-3.5 w-3.5 text-green-500" />
						{:else}
							<CopyIcon class="h-3.5 w-3.5" />
						{/if}
					</button>
				</div>
			</div>

			<div class="mt-4 space-y-3">
				{#each curlExamples as example, i (example.label)}
					<div class="bg-muted/50 rounded-lg border p-3">
						<div class="mb-2 flex items-center justify-between">
							<div class="flex items-center gap-2">
								<span
									class="rounded px-1.5 py-0.5 text-[10px] font-bold {example.method === 'GET'
										? 'bg-blue-500/15 text-blue-500'
										: 'bg-orange-500/15 text-orange-500'}"
								>
									{example.method}
								</span>
								<span class="text-sm font-medium">{example.label}</span>
							</div>
							<button
								class="text-muted-foreground hover:text-foreground transition-colors"
								onclick={() => copyToClipboard(example.curl, i)}
							>
								{#if copiedIndex === i}
									<CheckIcon class="h-3.5 w-3.5 text-green-500" />
								{:else}
									<CopyIcon class="h-3.5 w-3.5" />
								{/if}
							</button>
						</div>
						<pre class="overflow-x-auto text-xs leading-relaxed">{example.curl}</pre>
					</div>
				{/each}
			</div>

			<div class="bg-muted/30 mt-4 rounded-lg border p-3">
				<p class="text-muted-foreground text-xs leading-relaxed">
					The <code class="bg-muted rounded px-1 text-[11px]">X-Credential</code> header carries a
					CBOR-encoded credential. Use a <strong>Stamp</strong> credential (free, proves channel
					ownership) for channel info, or an <strong>IOU</strong> credential (signed payment increment)
					for priced endpoints like prices and publish.
				</p>
			</div>
		</Dialog.Content>
	</Dialog.Root>
{/if}
