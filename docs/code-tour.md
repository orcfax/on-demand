# Code Tour: Orcfax On-Demand

A narrative walkthrough of the Orcfax On-Demand codebase — how the pieces fit together, why we made the choices we did, and where it could go from here.

This is the reflective companion to the [Architecture Reference](architecture.md), which covers the same system in a more factual, reference-oriented style. Where that document says *what*, this one tries to say *why*.

If you've just cloned the repo and run `pnpm dev`, this piece will orient you. If you're evaluating the project or considering building on the Subbit protocol, it will explain the trade-offs we navigated. It assumes basic familiarity with web development and Cardano, but not with payment channels or the Subbit protocol specifically.

## What Is This?

Orcfax On-Demand is a web application for buying oracle price data from an Orcfax validator node, one request at a time, without submitting a blockchain transaction for every call.

The problem it solves is economic. A Cardano transaction costs roughly 0.2 ADA in fees and takes about 20 seconds to confirm. If you want to fetch a price update that costs 0.01 ADA, paying on-chain per request means the fee alone is 20x the service cost — and you'd wait half a minute for each data point. That's not a viable product.

The solution is a payment channel. You lock some ADA in an on-chain escrow once, sign lightweight IOUs for each request off-chain, and settle the balance when you're done. The escrow (a "Subbit") is enforced by a smart contract, so neither party needs to trust the other. The consumer's safety net: if the provider disappears, the consumer can reclaim all their funds after a deadline.

## The Big Picture

Three tiers, five processes:

```
Browser (Svelte 5)  ──►  SvelteKit Server  ──►  SubbitMan (L2 state)
                                           ──►  Orcfax Validator (data source)
                                           ──►  Subbit.xyz / Cardano (L1)
```

The **browser** handles wallet connection, key management, IOU signing, and the data display. The **SvelteKit server** is a middleware proxy: it validates credentials with SubbitMan, fetches data from the validator, charges the cost, and returns results. It never holds private keys. **[SubbitMan](https://github.com/kompact-io/subbit-man-js)** is the L2 accounting engine that tracks how much each consumer has spent and authorized. The **Orcfax Validator Node** is the upstream data source — it knows nothing about payments. And **[Subbit.xyz](https://github.com/kompact-io/subbit-xyz)** is the L1 — an Aiken smart contract on Cardano that enforces the payment channel rules: escrow, settlement, deadlines. Blockfrost is the chain indexer SubbitMan uses to read L1 state.

For the full system diagram and data flow details, see [architecture.md](architecture.md).

## Code Tour: The Client

The entire app runs as a client-side SPA. A single line in the root layout ([`src/routes/+layout.ts`](https://github.com/orcfax/on-demand/blob/main/src/routes/+layout.ts)) disables server-side rendering:

```ts
export const ssr = false;
```

This is a deliberate choice, not a shortcut. The app needs browser APIs at startup — CIP-30 wallet extensions, IndexedDB, `crypto.getRandomValues()` — and can't render anything meaningful without them. With SSR off, the SvelteKit server only handles API routes and serves the static shell; all rendering happens in the browser.

The app layout also uses Svelte 5's `<svelte:boundary>` to isolate crashes. Each major UI panel — wallet info, channel info, and the main content area — is wrapped in an error boundary with a recovery snippet ([`src/routes/app/+layout.svelte:65-136`](https://github.com/orcfax/on-demand/blob/main/src/routes/app/+layout.svelte#L65)). A crash in the channel panel can't take down the feeds table; the user gets a "Try Again" button instead of a white screen.

Within this SPA shell, the client is built around four reactive singletons — class instances that hold state, expose derived values, and persist to browser storage. They form a dependency chain that mirrors the user journey.

### The Four Singletons

**Wallet** ([`src/lib/wallet/wallet.svelte.ts:12`](https://github.com/orcfax/on-demand/blob/main/src/lib/wallet/wallet.svelte.ts#L12)) — wraps a CIP-30 Cardano browser wallet (Eternl, Nami, Lace, etc.) via the Mesh SDK. Handles connection, auto-reconnect from localStorage, and transaction signing. This is the entry point: nothing else works without a connected wallet.

**AuthKey** ([`src/lib/subbit/authKey.svelte.ts:14`](https://github.com/orcfax/on-demand/blob/main/src/lib/subbit/authKey.svelte.ts#L14)) — an Ed25519 keypair used to sign IOUs. Generated client-side with `@noble/ed25519`, never sent to the server. The private key lives in the browser (IndexedDB cache + downloadable JSON keyfile). This is *not* the wallet's signing key — it's a separate, disposable hot key whose only power is authorizing payments to the provider.

**Channel** ([`src/lib/subbit/channel.svelte.ts:58`](https://github.com/orcfax/on-demand/blob/main/src/lib/subbit/channel.svelte.ts#L58)) — the active Subbit payment channel. Manages the full lifecycle: open, add funds, close, settle, withdraw. Tracks the accounting fields synced from SubbitMan (stage, cost, iouAmt, sub, subbitAmt, sig). This is the most complex class — it handles L1 transaction building, L2 state sync, retry logic, pending-open crash recovery, and deadline countdown for the close period.

**ODAPI** ([`src/lib/odapi/odapi.svelte.ts:57`](https://github.com/orcfax/on-demand/blob/main/src/lib/odapi/odapi.svelte.ts#L57)) — the data layer. Fetches available feeds, requests prices, publishes on-chain, and persists price history to IndexedDB. Each request creates an IOU credential from the AuthKey, sends it through a remote function, and syncs the channel accounting afterward.

These four (plus NetworkState and ChannelStore) are instantiated in the app layout and injected into the component tree using Svelte's `createContext` ([`src/routes/app/+layout.svelte:26-31`](https://github.com/orcfax/on-demand/blob/main/src/routes/app/+layout.svelte#L26)). Any child component calls `getWalletState()`, `getChannelState()`, etc. to access the singleton. The classes themselves use these getters internally — `Channel` reads from `Wallet` and `AuthKey`, `ODAPI` reads from `Channel` and `AuthKey`. This gives us the dependency injection of a DI container with the simplicity of module-level singletons — no providers, no stores, no subscriptions, just classes with `$state` fields that Svelte tracks automatically.

### The User Journey in Code

1. **Connect wallet** — `Wallet.connect()` calls `BrowserWallet.enable()` via the Mesh SDK. The connection object, network ID, and wallet name are stored in `$state` fields. localStorage remembers the wallet name for auto-reconnect.

2. **Generate keys** — `AuthKey.create()` generates a random Ed25519 private key and derives the public key. Both are stored as hex strings in `$state`. When the channel opens, the key is cached in IndexedDB and offered as a downloadable JSON keyfile.

3. **Open channel** — `Channel.openChannel()` orchestrates a multi-step process: generate keys, build an Open transaction via the `buildOpenTx` remote function, sign it with the wallet, submit it, poll for on-chain confirmation, sync with SubbitMan, and fetch the initial channel state. If any post-submission step fails, a `pendingSync` flag enables retry without re-submitting the transaction.

4. **Fetch a price** — `ODAPI.updateFeedPrice("ADA-USD")` calculates the next IOU amount (`Channel.getNextIouAmount`), signs an IOU credential, calls the `getPrices` remote function, stores the price in IndexedDB, and syncs the channel to update accounting.

5. **Close & withdraw** — `Channel.close()` builds and submits a Close transaction, starting the settlement window. The provider settles (claiming authorized funds) or the deadline expires. Then `Channel.withdraw()` dispatches to either End (post-settlement) or Expire (deadline passed) to reclaim remaining funds.

### Channel Persistence: Two Layers

Behind the `Channel` singleton sits a two-layer persistence system that handles the "returning user" problem.

**ChannelStore** ([`src/lib/subbit/channelStore.svelte.ts`](https://github.com/orcfax/on-demand/blob/main/src/lib/subbit/channelStore.svelte.ts)) is a localStorage-backed registry of every channel the user has opened. It stores enough metadata — tag, public key, transaction hash, network, ToS version, last-used timestamp — to populate the channel selector without any server calls. When you refresh the page, ChannelStore tells the app which channels exist; then `Channel.restore()` syncs the selected one with SubbitMan to get live accounting data.

**keyCache** ([`src/lib/subbit/keyCache.ts`](https://github.com/orcfax/on-demand/blob/main/src/lib/subbit/keyCache.ts)) is an opt-in IndexedDB store for Ed25519 private keys. When the user checks "Remember this key on this device" during channel setup, the private key is cached under the channel's keytag. On return visits, the restore flow skips the keyfile upload entirely and shows a one-click unlock. The cache is deliberately unencrypted — it mirrors the security posture of the downloadable JSON keyfile.

The separation matters: ChannelStore is always populated (it's just metadata), but keyCache is opt-in. A cautious user can require keyfile upload on every session. A convenience-oriented user can cache locally and get one-click access.

## Code Tour: The Server Boundary

### Remote Functions as the RPC Layer

SvelteKit's experimental [remote functions](https://svelte.dev/docs/kit/remote-functions) let us write server-side TypeScript functions that the client calls directly — no API routes, no fetch wrappers, no manual serialization.

The configuration is minimal ([`svelte.config.js:9`](https://github.com/orcfax/on-demand/blob/main/svelte.config.js#L9)):

```js
kit: {
  experimental: { remoteFunctions: true }
}
```

Files named `*.remote.ts` in `src/lib/` export functions wrapped in `query()` (for reads) or `command()` (for writes), imported from `$app/server`. On the client side, you import and call them like normal async functions. SvelteKit handles the HTTP transport.

For example, `getFeeds` ([`src/lib/odapi/feeds.remote.ts:14`](https://github.com/orcfax/on-demand/blob/main/src/lib/odapi/feeds.remote.ts#L14)) is eight lines of code that fetch from the validator and parse with Zod:

```ts
export const getFeeds = query(async () => {
  const res = await fetch(`${env.PRIVATE_ODAPI_VALIDATOR_URL}/feeds`, {
    method: 'GET',
    headers: { accept: 'application/json' }
  });
  if (!res.ok) throw error(res.status, await extractErrorMessage(res));
  return FeedsResponseSchema.parse(await res.json());
});
```

Without remote functions, this would require a `+server.ts` route file, a fetch call from the client, response parsing, and error handling on both sides. Remote functions collapse that into a single function definition.

### The Credential Flow

The more interesting remote functions are `getPrices` ([`src/lib/odapi/prices.remote.ts:100`](https://github.com/orcfax/on-demand/blob/main/src/lib/odapi/prices.remote.ts#L100)) and `publishPrices` ([`src/lib/odapi/publish.remote.ts:98`](https://github.com/orcfax/on-demand/blob/main/src/lib/odapi/publish.remote.ts#L98)). They follow the same three-step pattern:

1. **Validate credential** — forward the base64url credential to SubbitMan's `/l2/tot` endpoint. If it's an IOU, SubbitMan records the new authorized amount.
2. **Serve data** — fetch from (or publish to) the Orcfax validator. The validator is "dumb" — it doesn't know about payments.
3. **Charge cost** — call SubbitMan's `/l2/mod` to increase the consumer's cost by the service price.

The validate-then-serve-then-charge ordering matters. If validation fails, no data is served and no cost is charged. If the data fetch succeeds but the cost update fails, the data is still returned (the consumer already has it) and the cost failure is logged. This is a deliberate choice: better to under-charge occasionally than to charge for undelivered data.

### The REST API: A Parallel Surface

Remote functions serve the portal UI, but there's a full parallel REST API at `src/routes/api/` for external clients — scripts, SDKs, anything that speaks HTTP.

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/feeds` | None | List available feeds |
| `GET /api/prices?feed_id=...` | `X-Credential` header | Fetch prices (charges IOU) |
| `POST /api/publish?feed_id=...` | `X-Credential` header | Publish on-chain (charges IOU) |
| `GET /api/channel` | `X-Credential` header | Query channel state |
| `GET /api/tos` | None | Terms of service metadata |

All credential validation and error mapping flows through a shared server module ([`src/lib/server/subbitProxy.ts`](https://github.com/orcfax/on-demand/blob/main/src/lib/server/subbitProxy.ts)), which wraps SubbitMan's HTTP API with typed helpers: `validateCredential()`, `chargeCost()`, `getChannelInfo()`. A companion `SubbitError` class carries structured error codes (`InsufficientAmount`, `BadSignature`, `Suspended`) that map to HTTP statuses — 402 for insufficient funds, 403 for auth failures.

The two API surfaces exist by design, not accident. Remote functions are the internal RPC for the portal UI — tightly coupled, type-safe, zero-config. The REST API is the public contract for external integrators — stable URLs, standard HTTP semantics, documented in `examples/`.

## Code Tour: SubbitMan

SubbitMan (`services/subbit-man-js/`) is the provider's L2 accounting engine. Its [design document](https://github.com/orcfax/on-demand/blob/main/services/subbit-man-js/docs/design.md) covers the full specification; here's what matters for understanding the portal.

The upstream SubbitMan is a focused L2 accounting service: it stores IOUs, validates credentials, and tracks channel balances in LevelDB. It has no opinion about blockchains — it's a ledger with an HTTP API.

For Orcfax On-Demand, we forked it and added everything needed to interact with Cardano directly. Three additions turn it from "a thing you build around" into "a thing you deploy":

**`lucid.js`** — a Fastify plugin that initializes Lucid Evolution with Blockfrost, loads the Subbit validator contract and reference script, and configures the provider's signing key. All Cardano-specific configuration is centralized here. This keeps every WASM dependency and signing key server-side; the browser never touches Lucid.

**`l1Routes.js`** — L1 endpoints for building unsigned transactions (Open, Add, Close, End, Expire), syncing on-chain state, and processing settlements. The portal's remote functions call these to construct transactions that the consumer's wallet signs. The key design choice: the server *builds* transactions but the consumer *signs* them — the server never has custody.

**`liaison.js`** — an automated background worker that runs the provider's housekeeping on a configurable interval (default 15 minutes): sync chain state, process closed channels, batch-settle accumulated IOUs. This is what makes SubbitMan hands-off — the provider doesn't need to manually trigger settlements.

For channel accounting details, credential validation rules, and the liaison loop internals, see the [SubbitMan design document](https://github.com/orcfax/on-demand/blob/main/services/subbit-man-js/docs/design.md).

## Code Tour: The Subbit Protocol

The on-chain layer is [Subbit.xyz](https://github.com/kompact-io/subbit-xyz) — a trustless L2 payment channel protocol for Cardano, implemented as a single Aiken validator ([`services/subbit-xyz/aik/validators/subbit.ak`](https://github.com/orcfax/on-demand/blob/main/services/subbit-xyz/aik/validators/subbit.ak)).

A channel is a single Cardano UTxO whose inline datum encodes its stage:

```
Open ──► Opened ◄──► Add/Sub ──► Close ──► Closed ──► Settle ──► Settled ──► End
                                                    └──► Expire (if provider doesn't settle)
```

Each transition is a Cardano transaction that spends the current UTxO and produces a new one with an updated datum (or destroys it, for End/Expire). The validator enforces the rules: only the consumer can Close, only the provider can Settle, settlements require a valid IOU signature, Expire is only allowed after the deadline.

The IOU mechanism is the protocol's core. On-chain, an IOU is a cumulative `amount` and a `signature`. The signature covers a `(tag, amount)` pair — the **tag** prevents cross-channel replay, and the **cumulative amount** means each IOU supersedes the previous one. On the client side, the credential is CBOR-encoded and signed ([`src/lib/subbit/credential.ts`](https://github.com/orcfax/on-demand/blob/main/src/lib/subbit/credential.ts)), then travels as a base64url string through the SvelteKit server to SubbitMan for validation. When the provider settles on-chain, the validator verifies the same signature against the datum's IOU verification key.

The protocol also supports efficient multi-channel settlement through a batching mechanism — a provider managing hundreds of channels can settle many in a single transaction, reducing the marginal cost per channel significantly.

For the full protocol specification, validator source, and architectural decision records, see the [Subbit.xyz repository](https://github.com/kompact-io/subbit-xyz).

## Code Tour: Terms of Service as Code

An unusual aspect of this system: the Terms of Service are not a legal page bolted on at the end — they're a first-class data structure that drives pricing and protocol behavior.

The canonical ToS lives in a JSON file ([`src/lib/tos/tos.json`](https://github.com/orcfax/on-demand/blob/main/src/lib/tos/tos.json)) bundled at build time. It specifies the version, effective date, pricing (update cost, publish cost, minimum deposit), channel parameters (close period), and the human-readable terms clauses. Pricing is *derived from* the ToS, not configured separately — the pricing module ([`src/lib/odapi/pricing.ts`](https://github.com/orcfax/on-demand/blob/main/src/lib/odapi/pricing.ts)) returns the current ToS pricing, or the *previous version's* pricing if a grace period is active.

The grace period mechanism ([`src/lib/tos/index.ts`](https://github.com/orcfax/on-demand/blob/main/src/lib/tos/index.ts)) handles ToS transitions without breaking existing channels. When a new version is deployed, clients using the old version continue to work at old pricing until the grace period expires. On the client side, a `TosChangeDialog` component renders a diff table of changed values and requires explicit acceptance — outside the grace period, the dialog is non-dismissable.

This design reflects a core principle of the Subbit protocol: **subscriber sovereignty**. The provider can change terms, but the consumer is never surprised.

## Design Decisions

These are the trade-offs we weighed and the reasoning behind the choices we made. Protocol-level decisions (cumulative IOUs, mono-asset channels, datum-stored constants) are documented in the Subbit project's [ADRs](https://github.com/orcfax/on-demand/tree/main/services/subbit-xyz/docs/adrs); here we focus on the application-level choices specific to this portal.

### Why Svelte 5 Runes Over Stores, Signals, or Other Frameworks

Svelte 5's runes (`$state`, `$derived`, `$effect`) let us write reactive classes that look like plain TypeScript. Each of the four singletons is a class with `$state` fields and `$derived` getters — no wrappers, no subscription boilerplate, no `get()` / `set()` / `update()` ceremony.

The alternative we considered was Svelte 4 stores. Stores work well for simple values, but our state objects are deeply interconnected: `Channel` needs to read from `Wallet` and `AuthKey`, `ODAPI` needs to read from `Channel`. With stores, you end up with a tangle of derived stores or manual subscriptions. With runes, `Channel` just calls `getWalletState()` and reads `this.#wallet.isConnected` — Svelte tracks the dependency automatically.

The class-based pattern also means each module encapsulates its own persistence (localStorage, IndexedDB), error handling, and loading states. Components are thin — they read state and call methods.

### Why SvelteKit Remote Functions Over tRPC, REST, or GraphQL

Remote functions are experimental, and that's a real risk. We chose them anyway because:

1. **Zero boilerplate.** A remote function is one file with one exported function. The equivalent tRPC setup would need a router, a procedure, client initialization, and type generation. REST would need a `+server.ts` route, a client-side fetch wrapper, and manual type alignment.

2. **Natural colocation.** `feeds.remote.ts` sits next to `odapi.svelte.ts` in the same directory. The client imports `getFeeds` like any other function. There's no mental context switch between "client code" and "API route."

3. **The REST API exists as a fallback.** We also provide traditional `/api/*` endpoints for programmatic access. If remote functions break in a future SvelteKit release, migrating the portal UI to use the REST API is straightforward — the same server-side logic powers both.

The risk is that the feature may change or be removed. We're comfortable with that trade-off for a prototype that will evolve with the framework.

### Why Ed25519 (Not Wallet-Native Signing) for IOUs

Cardano wallets use Ed25519 keys for transaction signing, so why not reuse the wallet key for IOUs?

Two reasons. First, **security isolation**. The IOU key is a disposable hot key. Its only power is authorizing payments to the provider — if compromised, the worst case is the attacker lets the provider claim more of the consumer's already-escrowed funds. The wallet key controls the channel closure and fund withdrawal. Separating these keys means a compromised IOU key can't drain the wallet or close the channel.

Second, **CIP-30 limitations**. The CIP-30 wallet standard provides `signData()` for arbitrary message signing, but wallet implementations vary in their support and UX. Some wallets show confusing confirmation dialogs for non-transaction signatures. Generating a separate Ed25519 key with `@noble/ed25519` gives us deterministic, silent signing with no wallet interaction per request.

This decision is documented in the Subbit protocol's [auth ADR](https://github.com/orcfax/on-demand/blob/main/services/subbit-xyz/docs/adrs/auth.md).

### Why CBOR Encoding for Credentials

Credentials are CBOR-encoded because the Cardano Plutus validator expects CBOR. The on-chain IOU signature is verified against the CBOR-encoded IOU body. By using CBOR end-to-end — client signs CBOR, server forwards CBOR, SubbitMan verifies CBOR, validator verifies the same CBOR — we eliminate an entire category of serialization bugs.

This was not without pain. Plutus uses indefinite-length CBOR arrays, and different CBOR libraries produce different encodings. We had to use `cbor2` specifically and manually construct the byte sequences to match what the Aiken validator expects.

### Why Mesh SDK on Client + Lucid Evolution on Server

Two different Cardano libraries, used in two different contexts:

- **Mesh SDK** on the client — because it provides the best CIP-30 wallet integration. `BrowserWallet.enable()`, `signTx()`, `submitTx()` — the wallet interaction surface is Mesh's strength.

- **Lucid Evolution** on the server (in SubbitMan) — because it provides the best transaction building API for script interactions. Building transactions that spend from validators, attach redeemers, and handle Plutus datums is Lucid's strength.

We tried using Mesh for everything, but its transaction builder struggled with the Subbit validator's specific requirements (inline datums, partial signing, script witnesses). Lucid handles these natively. The split means the client never needs Lucid (saving ~500KB of bundle size) and the server never needs Mesh (avoiding CIP-30 browser dependencies).

## Alternatives and Extensions

### Multi-Currency Channels

The Subbit validator already supports native asset channels (ByHash and ByClass currency types). The portal currently only supports ADA channels. Extending it to support stablecoin channels (e.g., pay in DJED or iUSD) would require UI changes for currency selection and SubbitMan configuration for the accepted asset.

### Subscription Tiers and Time-Based Billing

The current model is pure pay-per-request. An alternative is time-based access — pay X ADA for 24 hours of unlimited queries. This could be implemented as a "Stamp" credential mode where SubbitMan validates access based on a time window rather than per-request IOUs. The protocol supports this; the portal would need a different billing UI.

### SDK/CLI Client for Headless Access

The REST API (`/api/*`) already supports programmatic access, and the `examples/` directory includes working curl and Node.js examples. A dedicated SDK (TypeScript/Python) would wrap the credential creation, IOU signing, and API calls into a clean interface for automated data pipelines.

### Custom Feed Registration

An upcoming feature: consumers registering their own data feeds (beyond the default Orcfax price feeds). This would allow arbitrary data sources — weather, sports, custom financial instruments — to be published through the same pay-per-use infrastructure.

### Multi-Provider Support

The current portal connects to a single provider (Orcfax). The Subbit protocol is provider-agnostic — any service could accept Subbit payments. A multi-provider portal would let users browse providers, compare pricing, and manage channels across different services.

## Getting Involved

- **Repository**: [github.com/orcfax/on-demand](https://github.com/orcfax/on-demand)
- **Contributing guide**: [CONTRIBUTING.md](https://github.com/orcfax/on-demand/blob/main/CONTRIBUTING.md)
- **Subbit protocol**: [github.com/kompact-io/subbit-xyz](https://github.com/kompact-io/subbit-xyz)
- **Orcfax**: [orcfax.io](https://orcfax.io)
