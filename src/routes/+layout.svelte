<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/logo.png';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import { ModeWatcher } from 'mode-watcher';
	import { dev } from '$app/environment';
	import { env } from '$env/dynamic/public';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	{#if !dev && env.PUBLIC_UMAMI_WEBSITE_ID}
		<script
			defer
			src="{env.PUBLIC_UMAMI_URL}/script.js"
			data-website-id={env.PUBLIC_UMAMI_WEBSITE_ID}
			data-domains="odapi-web.server.orcfax.io"
			data-tag={env.PUBLIC_BLOCKFROST_NETWORK}
		></script>
	{/if}
</svelte:head>

<ModeWatcher />
<Toaster richColors closeButton position="top-right" />

<main class="bg-background mx-auto w-full max-w-7xl flex-1 py-6 sm:px-6 lg:px-8">
	{@render children?.()}
</main>
