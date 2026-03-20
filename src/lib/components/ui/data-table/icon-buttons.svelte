<script module>
	import Replace from '@lucide/svelte/icons/replace';
	import RefreshCcwDot from '@lucide/svelte/icons/refresh-ccw-dot';
	export const icons = { getPriceIcon, publishPriceIcon };
</script>

{#snippet getPriceIcon()}
	<RefreshCcwDot />
{/snippet}

{#snippet publishPriceIcon()}
	<Replace />
{/snippet}
