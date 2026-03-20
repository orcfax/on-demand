# Getting Started

This guide covers everything needed to clone, configure, run, and deploy the Orcfax On-Demand web application.

## Prerequisites

- **Node.js 20+**
- **pnpm** (enabled via corepack: `corepack enable && corepack prepare pnpm@latest --activate`)
- **Git** (with submodule support)
- **Blockfrost account** — sign up at [blockfrost.io](https://blockfrost.io) and create a project for Preview or Mainnet
- A **CIP-30 Cardano wallet** browser extension for using the app (Eternl, Nami, Lace, etc.)

## Clone

The repository uses two git submodules under `services/`. You must initialize them when cloning:

```bash
git clone --recurse-submodules https://github.com/orcfax/odapi-portal-prototype.git
cd odapi-portal-prototype
```

If you already cloned without `--recurse-submodules`:

```bash
git submodule update --init --recursive
```

Verify the submodules are populated:

```bash
ls services/subbit-man-js/package.json   # should exist
ls services/subbit-xyz/js/               # should exist
```

### What the submodules are

- **`services/subbit-man-js`** — a Fastify-based Node.js service that manages Subbit payment channels on the provider side. It handles L2 accounting (tracking IOUs, balances, costs) in LevelDB and L1 blockchain interactions (building transactions, syncing chain state, auto-settling channels) via Lucid Evolution. Runs on port 7822.

- **`services/subbit-xyz`** — the Subbit protocol implementation. Contains the Aiken smart contract source (`aik/`) and JavaScript packages (`js/`) including `@subbit-tx/tx` (validator contract bindings and transaction builders) and `@subbit-tx/kio`. The web app and SubbitMan both depend on `@subbit-tx/tx` via pnpm workspace `link:` references.

## Install

```bash
pnpm install
```

This also runs a `postinstall` script that:

- Syncs SvelteKit types (`svelte-kit sync`)
- Fixes a pnpm strict isolation issue with `libsodium-wrappers-sumo` by creating a symlink

## Environment

Copy the example environment file and fill in the values:

```bash
cp .env.example .env
```

### Network and data provider

| Variable                     | Example            | Description                                                 |
| ---------------------------- | ------------------ | ----------------------------------------------------------- |
| `PUBLIC_NODE_ENV`            | `development`      | `development`, `test`, or `production`                      |
| `PUBLIC_BLOCKFROST_NETWORK`  | `Preview`          | `Preview` or `Mainnet` — must match your Blockfrost API key |
| `PRIVATE_BLOCKFROST_API_KEY` | `previewAbCdEf...` | Your Blockfrost project API key                             |
| `PUBLIC_MAINNET_ENABLED`     | `false`            | Whether the Mainnet option appears in the network selector  |

### Backend services

| Variable                      | Example                       | Description                                               |
| ----------------------------- | ----------------------------- | --------------------------------------------------------- |
| `PRIVATE_ODAPI_VALIDATOR_URL` | `https://validator.orcfax.io` | Orcfax validator node endpoint (the data source)          |
| `PRIVATE_SUBBIT_MAN_URL`      | `http://localhost:7822`       | SubbitMan service URL. Default works for local `pnpm dev` |

### Subbit channel

| Variable                   | Example | Description                                                                 |
| -------------------------- | ------- | --------------------------------------------------------------------------- |
| `PUBLIC_CHANNEL_INIT_COST` | `1000`  | Channel initialization cost in lovelace (deducted from deposit by provider) |

Provider identity keys and the Subbit reference script UTxO are configured in SubbitMan's own environment (see the [Provider Guide](./provider-guide.md)).

### SvelteKit variable conventions

- `PUBLIC_*` variables are exposed to the browser (available in client-side code)
- `PRIVATE_*` variables are server-only (available in `*.remote.ts` files, `+server.ts` routes, and hooks)

## Running

### Full stack (recommended for development)

```bash
pnpm dev
```

This uses `concurrently` to start both:

- **SvelteKit dev server** — the web application (default: `http://localhost:5173`)
- **SubbitMan** — the Subbit channel manager backend (`http://localhost:7822`)

Both services run side by side. The terminal labels output with `[web]` and `[subbit]` prefixes.

### Web only

If SubbitMan is running separately (e.g. deployed remotely or in another terminal):

```bash
pnpm dev:only:web
```

Set `PRIVATE_SUBBIT_MAN_URL` to point at the remote SubbitMan instance.

### What should happen

1. Both services start without errors
2. Open `http://localhost:5173` in a browser
3. Navigate to `/app` to see the main application
4. The app will prompt you to connect a wallet, generate keys, and open a channel

## Type Checking

```bash
# One-off check
pnpm check

# Watch mode (re-checks on file changes)
pnpm check:watch
```

## Formatting and Linting

The project uses Prettier with tabs, single quotes, no trailing commas, and a 100-character print width. Plugins for Svelte and Tailwind class sorting are included.

```bash
# Format all files
pnpm prettier --write .

# Lint
pnpm eslint .
```

## Building for Production

```bash
pnpm build
```

This produces a Node.js build in the `build/` directory using `@sveltejs/adapter-node`.

To run the production build locally:

```bash
node build
```

The server starts on port 3000 (configurable via the `PORT` environment variable).

## Docker

The Dockerfile uses a multi-stage build:

1. **Build stage** — installs dependencies and runs `pnpm build` with a 4 GB heap (`NODE_OPTIONS=--max-old-space-size=4096`) to handle the Mesh SDK bundling
2. **Run stage** — copies only the production artifacts into a clean `node:20-alpine` image

```bash
# Build the image
docker build -t orcfax-express .

# Run (pass environment variables)
docker run -p 3000:3000 --env-file .env orcfax-express
```

The container runs `node build` and listens on port 3000.

### Note on build resources

The build requires ~4 GB of memory due to the Mesh SDK's dependency tree (@cardano-sdk/\*). The `NODE_OPTIONS` setting in the Dockerfile handles this. If building locally with `pnpm build` and hitting memory issues, set the same flag:

```bash
NODE_OPTIONS="--max-old-space-size=4096" pnpm build
```

## Deployment

The project includes Dockerfiles for both services. Build and deploy using any Docker-compatible platform:

```bash
# Build and run the web app
docker build -t odapi-web .
docker run -p 3000:3000 --env-file .env odapi-web

# Build and run SubbitMan
docker build -t subbit-man -f services/subbit-man-js/Dockerfile services/subbit-man-js
docker run -p 7822:7822 --env-file .env.subbitman subbit-man
```

Set the required environment variables (see [Environment Variables](#environment-variables)) via your deployment platform's configuration.

## Preview vs Mainnet

To switch between Cardano networks:

1. Update `PUBLIC_BLOCKFROST_NETWORK` to `Preview` or `Mainnet`
2. Use a `PRIVATE_BLOCKFROST_API_KEY` that matches the network
3. Update SubbitMan's `SUBBIT_MAN_SUBBIT_REFERENCE_UTXO` to the reference script UTxO on that network
4. Update SubbitMan's provider keys (`PROVIDER_KEY_HASH`, `PROVIDER_SIGNING_KEY`) if they differ per network
5. Set `PUBLIC_MAINNET_ENABLED=true` if you want users to see the Mainnet option in the UI

Users must also have their wallet browser extension set to the matching network — the app detects mismatches and shows a warning.

## Troubleshooting

### Submodules are empty

```
Error: services/subbit-man-js appears empty
```

Run `git submodule update --init --recursive` from the repo root.

### libsodium symlink error

The `postinstall` script handles this automatically. If you see errors about `libsodium-sumo.mjs` not being found, run:

```bash
node scripts/fix-libsodium.mjs
```

This creates a symlink to work around pnpm's strict package isolation.

### Build runs out of memory

The Mesh SDK dependency tree is large. Increase the Node.js heap:

```bash
NODE_OPTIONS="--max-old-space-size=4096" pnpm build
```

### Wallet not detected

- Make sure you have a CIP-30 compatible wallet extension installed (Eternl, Nami, Lace)
- Some wallets require a page refresh after installation
- Check that the wallet is set to the same network (Preview/Mainnet) as the app

### SubbitMan connection refused

If the web app can't reach SubbitMan:

- Verify SubbitMan is running (`pnpm dev` starts it automatically)
- Check `PRIVATE_SUBBIT_MAN_URL` in `.env` (default: `http://localhost:7822`)
- For deployed environments, make sure the SubbitMan URL is reachable from the web server

## Architecture Overview

For a deeper understanding of the system, here's how the pieces fit together:

```
                          ┌─────────────────────┐
                          │   Cardano (L1)       │
                          │  Subbit smart contract│
                          │  (escrowed ADA)      │
                          └──────────┬───────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                 │
              ┌─────▼──────┐  ┌─────▼──────┐   ┌─────▼──────┐
              │  Blockfrost │  │  SubbitMan  │   │  Orcfax    │
              │  (indexer)  │  │  (L2 state) │   │  Validator │
              └─────┬──────┘  └─────┬──────┘   └─────┬──────┘
                    │               │                 │
                    └───────┬───────┴────────┬────────┘
                            │                │
                     ┌──────▼────────────────▼──────┐
                     │      SvelteKit Server         │
                     │  Remote functions + REST API  │
                     └──────────────┬────────────────┘
                                    │
                     ┌──────────────▼────────────────┐
                     │        Browser (Svelte 5)      │
                     │  Wallet + Keys + Channel + UI  │
                     └────────────────────────────────┘
```

- **Browser**: Svelte 5 reactive UI. Manages wallet connection (Mesh SDK), Ed25519 keypairs, channel state, and price history. Stores keys in IndexedDB, preferences in localStorage.
- **SvelteKit Server**: Middleware layer using experimental remote functions. Validates credentials against SubbitMan, fetches data from the Orcfax validator, and charges costs. Also serves REST API endpoints for programmatic access.
- **SubbitMan**: Fastify service that tracks L2 channel accounting in LevelDB. Builds Cardano transactions via Lucid Evolution. Runs an automated liaison loop that syncs chain state, settles closed channels, and claims owed funds.
- **Orcfax Validator**: The upstream data source providing real-time price feeds and on-chain publication capabilities.
- **Cardano / Blockfrost**: The L1 blockchain where Subbit channels are opened, settled, and closed. Blockfrost provides chain indexing.

## Key Concepts

**Subbit** — an L2 payment channel protocol on Cardano. ADA is locked in a smart contract (escrow), and the consumer signs IOUs off-chain to authorize incremental payments without requiring a blockchain transaction per request.

**IOU** — a signed payment authorization. Each IOU specifies a cumulative total the provider may claim. IOUs are monotonically increasing — a new IOU for 500,000 lovelace replaces (not adds to) a previous IOU for 490,000 lovelace.

**Stamp** — a signed proof of channel ownership used for free informational queries (e.g., checking channel state). Contains a timestamp instead of a payment amount.

**Channel lifecycle** — Open (lock ADA) -> Use (sign IOUs per request) -> Close (start settlement window) -> Settle (provider claims authorized amount) -> End (consumer reclaims remainder). If the provider doesn't settle within the window, the consumer can Expire the channel and reclaim everything.

**Remote functions** — a SvelteKit experimental feature that lets client code call server-side functions directly, without manually defining API routes. Files named `*.remote.ts` contain these functions.

See [examples/README.md](../examples/README.md) for the full API reference and credential format documentation.
