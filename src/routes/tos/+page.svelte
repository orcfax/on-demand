<script lang="ts">
	import TermsOfService from '$lib/components/TermsOfService.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { tos, isInGracePeriod, getGraceDeadline } from '$lib/tos';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import AlertTriangleIcon from '@lucide/svelte/icons/alert-triangle';

	const inGrace = isInGracePeriod();
	const graceDeadline = getGraceDeadline();
</script>

<svelte:head>
	<title>Terms of Service — {tos.provider.service}</title>
</svelte:head>

<div class="bg-background text-foreground min-h-screen">
	<div class="mx-auto max-w-3xl px-6 py-12">
		<div class="space-y-8">
			<div class="space-y-4">
				<p class="text-muted-foreground text-xs font-semibold tracking-[0.3em] uppercase">
					{tos.provider.service}
				</p>
				<h1 class="text-3xl font-semibold">Terms of Service</h1>
				<p class="text-muted-foreground text-sm">
					{tos.provider.service} is a pay-per-use oracle data service built on
					<a href="https://subbit.xyz/" class="underline">Subbit</a>
					payment channels on Cardano. These terms are a good-faith agreement between you and the provider.
					They are not enforced by the on-chain smart contract — the Subbit validator only enforces escrow
					and settlement mechanics. Your funds cannot be taken without your signed authorization.
				</p>
			</div>

			{#if inGrace && tos.previousVersion && graceDeadline}
				<Alert class="border-yellow-500/40">
					<AlertTriangleIcon class="h-4 w-4 text-yellow-500" />
					<AlertTitle class="text-yellow-500">Terms Recently Updated</AlertTitle>
					<AlertDescription>
						<p>
							These terms were updated from v{tos.previousVersion.version} to v{tos.version}
							on {tos.effectiveDate}.
						</p>
						<p>
							Previous terms remains in effect until
							{graceDeadline.toLocaleDateString()}.
						</p>
						{#if tos.changelog.length > 0}
							<div class="mt-2">
								<p class="font-medium">What changed:</p>
								<ul class="mt-1 list-disc pl-4">
									{#each tos.changelog[0].changes as change}
										<li>{change}</li>
									{/each}
								</ul>
							</div>
						{/if}
					</AlertDescription>
				</Alert>
			{/if}

			<TermsOfService showGraceAlert={false} />

			<div class="text-muted-foreground space-y-3 border-t pt-6 text-xs">
				<p>
					For programmatic access, the ToS is available as JSON at
					<a href="/api/tos" class="underline">/api/tos</a>. Responses include
					<code class="bg-muted rounded px-1">X-ToS-Version</code> and
					<code class="bg-muted rounded px-1">X-ToS-Hash</code> headers.
				</p>
				<div class="flex gap-3">
					<Button href="/app" variant="outline" size="sm">Go to App</Button>
					<Button href="/" variant="ghost" size="sm">Back to Home</Button>
				</div>
			</div>
		</div>
	</div>
</div>
