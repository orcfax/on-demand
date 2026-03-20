<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button/index.js';
</script>

<div class="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
	<h1 class="text-6xl font-bold">{page.status}</h1>
	<p class="text-muted-foreground text-lg">{page.error?.message}</p>
	<Button href="/">Go Home</Button>
</div>
