<script lang="ts">
	import { tos, getEffectivePricing, isInGracePeriod, getGraceDeadline } from '$lib/tos';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import AlertTriangleIcon from '@lucide/svelte/icons/alert-triangle';

	let {
		showHeader = true,
		compact = false,
		showGraceAlert = true
	}: { showHeader?: boolean; compact?: boolean; showGraceAlert?: boolean } = $props();

	const pricing = getEffectivePricing();
	const updateCostAda = pricing.updateCostLovelace / 1_000_000;
	const publishCostAda = pricing.publishCostLovelace / 1_000_000;
	const closePeriodHours = tos.channel.closePeriodMs / 3_600_000;
	const inGrace = isInGracePeriod();
	const graceDeadline = getGraceDeadline();
</script>

<div class="space-y-4 text-sm">
	{#if showHeader}
		<div>
			<h3 class="text-lg font-semibold">
				{tos.provider.service} Terms of Service
			</h3>
			<p class="text-muted-foreground text-xs">
				Version {tos.version} &middot; Effective {tos.effectiveDate}
			</p>
		</div>
	{/if}

	{#if showGraceAlert && inGrace && tos.previousVersion && graceDeadline}
		<Alert class="border-yellow-500/40">
			<AlertTriangleIcon class="h-4 w-4 text-yellow-500" />
			<AlertTitle class="text-yellow-500">Terms Updated</AlertTitle>
			<AlertDescription>
				Updated from v{tos.previousVersion.version} to v{tos.version}. Previous terms remain in
				effect until {graceDeadline.toLocaleDateString()}.
			</AlertDescription>
		</Alert>
	{/if}

	{#if !compact}
		<div class="space-y-2">
			<h4 class="text-xs font-semibold tracking-[0.2em] uppercase">Pricing</h4>
			<div class="grid grid-cols-2 gap-2">
				<div class="bg-background rounded-lg border px-3 py-2">
					<span class="text-muted-foreground">Fetch (off-chain)</span>
					<span class="ml-2 font-semibold">{updateCostAda} ADA</span>
				</div>
				<div class="bg-background rounded-lg border px-3 py-2">
					<span class="text-muted-foreground">Publish (on-chain)</span>
					<span class="ml-2 font-semibold">{publishCostAda} ADA</span>
				</div>
			</div>
		</div>

		<div class="space-y-2">
			<h4 class="text-xs font-semibold tracking-[0.2em] uppercase">Channel Parameters</h4>
			<div class="grid grid-cols-2 gap-2">
				<div class="bg-background rounded-lg border px-3 py-2">
					<span class="text-muted-foreground">Close period</span>
					<span class="ml-2 font-semibold">{closePeriodHours} hour</span>
				</div>
				<div class="bg-background rounded-lg border px-3 py-2">
					<span class="text-muted-foreground">Min deposit</span>
					<span class="ml-2 font-semibold">{tos.channel.minDepositAda} ADA</span>
				</div>
			</div>
		</div>
	{/if}

	<div class={compact ? 'space-y-2' : 'space-y-3'}>
		{#each tos.clauses as clause (clause.id)}
			{#if compact}
				<p><span class="font-medium">{clause.title}.</span> {clause.text}</p>
			{:else}
				<div>
					<h4 class="font-semibold">{clause.title}</h4>
					<p class="text-muted-foreground mt-0.5">{clause.text}</p>
				</div>
			{/if}
		{/each}
	</div>

	{#if tos.changelog.length > 0 && !compact}
		<div class="space-y-2">
			<h4 class="text-xs font-semibold tracking-[0.2em] uppercase">Changelog</h4>
			{#each tos.changelog as entry (entry.version)}
				<div class="bg-background rounded-lg border px-3 py-2">
					<p class="font-medium">v{entry.version} — {entry.date}</p>
					<ul class="text-muted-foreground mt-1 list-disc pl-4">
						{#each entry.changes as change (change)}
							<li>{change}</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	{/if}
</div>
