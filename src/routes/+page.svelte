<script lang="ts">
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import Button from '$lib/components/ui/button/button.svelte';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import TermsOfService from '$lib/components/TermsOfService.svelte';
	import { getEffectivePricing } from '$lib/tos';

	const pricing = getEffectivePricing();
	const updateCostAda = pricing.updateCostLovelace / 1_000_000;
	const publishCostAda = pricing.publishCostLovelace / 1_000_000;
</script>

<div class="bg-background text-foreground relative min-h-screen">
	<div
		class="`bg-[radial-gradient(circle_at_top,hsla(var(--primary),0.18),transparent_55%),radial-gradient(circle_at_30%_30%,hsla(var(--foreground),0.08),transparent_45%)] pointer-events-none absolute inset-0"
	></div>
	<div class="relative mx-auto flex max-w-6xl flex-col gap-10 px-6 pt-12 pb-14">
		<header class="grid gap-6 lg:grid-cols-[1.3fr,0.9fr]">
			<div class="space-y-4">
				<p class="text-muted-foreground text-xs font-semibold tracking-[0.3em] uppercase">
					Orcfax On-Demand
				</p>
				<h1 class="text-foreground text-4xl leading-tight font-semibold md:text-5xl">
					On-Demand Blockchain Oracle Data
				</h1>
				<p class="text-muted-foreground text-base md:text-lg">
					Access realtime price feeds and fact statements from Orcfax validators, then publish them
					on-chain with a single request.
				</p>
			</div>
		</header>

		<Card class="bg-card text-card-foreground">
			<CardHeader>
				<CardTitle class="text-2xl">How it works (Subbit)</CardTitle>
				<CardDescription class="text-muted-foreground text-sm">
					<a href="https://subbit.xyz/" class="font-bold underline">Subbit</a> is a lightweight, secure,
					and fast Cardano L2 that enables trustless pay-per-use blockchain oracle data access.
				</CardDescription>
			</CardHeader>
			<CardContent class="grid gap-4 text-sm md:grid-cols-3">
				<div class="bg-background rounded-lg border p-4">
					<p class="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
						Step 1
					</p>
					<p class="mt-2 font-semibold">Open a Subbit escrow</p>
					<p class="text-muted-foreground mt-1">
						Connect your wallet and lock ADA in a smart contract. Funds stay under your control.
					</p>
				</div>
				<div class="bg-background rounded-lg border p-4">
					<p class="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
						Step 2
					</p>
					<p class="mt-2 font-semibold">Request and publish data</p>
					<p class="text-muted-foreground mt-1">
						Each request is authorized off-chain with IOUs signed by you, verified by the provider.
					</p>
				</div>
				<div class="bg-background rounded-lg border p-4">
					<p class="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
						Step 3
					</p>
					<p class="mt-2 font-semibold">Settle on-chain, reclaim unused funds</p>
					<p class="text-muted-foreground mt-1">
						Providers batch settlements on-chain. You can close anytime and withdraw the rest.
					</p>
				</div>
			</CardContent>
			<div
				class="w-full px-4
			"
			>
				<Button href="/app" class="w-full">Get Started →</Button>
			</div>
		</Card>

		<Card>
			<CardHeader>
				<CardTitle class="text-2xl">Pricing</CardTitle>
				<CardDescription class="text-muted-foreground text-sm">
					Simple, transparent, and trustless. Only pay for what you use.
				</CardDescription>
			</CardHeader>
			<CardContent class="grid gap-6 text-sm">
				<div class="grid gap-4">
					<div
						class="bg-background flex w-fit items-center justify-between gap-6 rounded-lg border px-4 py-3"
					>
						<span>Fetch (off-chain)</span>
						<span class="font-semibold">{updateCostAda} ADA</span>
					</div>
					<div
						class="bg-background flex w-fit items-center justify-between gap-6 rounded-lg border px-4 py-3"
					>
						<span>Publish (on-chain)</span>
						<span class="font-semibold">{publishCostAda} ADA</span>
					</div>
				</div>
				<Alert class="border-primary/40 shadow-[0_18px_40px_-28px_hsla(var(--primary),0.9)]">
					<AlertTitle
						class="text-primary mb-3 flex items-center gap-2 text-xs font-semibold tracking-[0.35em] uppercase"
					>
						<ShieldCheckIcon class="h-4 w-4" />
						Trust Guarantees
					</AlertTitle>
					<AlertDescription class="text-foreground">
						<ul class="space-y-2 text-sm">
							<li>- Funds are escrowed before any publication happens.</li>
							<li>- Providers cannot overcharge or change pricing.</li>
							<li>- Unused funds can always be recovered.</li>
						</ul>
					</AlertDescription>
				</Alert>
				<details class="group grid gap-3">
					<summary class="cursor-pointer text-xs font-semibold tracking-[0.2em] uppercase">
						Terms of Service
					</summary>
					<div class="bg-background rounded-lg border p-4">
						<TermsOfService showHeader={false} compact />
					</div>
				</details>

				<Button href="/app">Get Started →</Button>
			</CardContent>
		</Card>
	</div>
</div>
