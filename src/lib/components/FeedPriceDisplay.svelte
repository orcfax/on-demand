<script lang="ts">
	import Replace from '@lucide/svelte/icons/replace';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { formatCurrencyValue } from '$lib/formatCurrency';

	interface Props {
		value?: number | null;
		feedId?: string;
		published?: boolean;
	}

	let { value = undefined, feedId = undefined, published = false }: Props = $props();

	const quoteTicker = $derived(feedId ? (feedId.split('-').at(-1) ?? '') : '');
	const formatted = $derived(value != null ? formatCurrencyValue(value) : null);
</script>

<div class="inline-flex items-center gap-2 font-medium">
	<span class="whitespace-nowrap">
		{#if formatted == null}
			—
		{:else if formatted.type === 'subscript'}
			{formatted.prefix}<sub class="align-middle" style="font-size: 0.7em;"
				>{formatted.subscript}</sub
			>{formatted.suffix}
			{quoteTicker}
		{:else}
			{formatted.text} {quoteTicker}
		{/if}
	</span>
	{#if published}
		<Tooltip.Root>
			<Tooltip.Trigger>
				<span class="inline-flex">
					<Replace class="h-4 w-4 text-emerald-500" aria-label="Published" />
				</span>
			</Tooltip.Trigger>
			<Tooltip.Content side="top" align="center">Published on-chain</Tooltip.Content>
		</Tooltip.Root>
	{/if}
</div>
