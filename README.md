# Orcfax On-Demand

A web application for consuming and publishing Orcfax validator node price feed data through pay-per-use [Subbit](https://github.com/kompact-io/subbit-xyz) payment channels on [Cardano](https://cardano.org).

Users connect a Cardano wallet, open an L2 payment channel with escrowed ADA, and make credentialed API calls to fetch or publish on-chain oracle price data — paying per request without an on-chain transaction for every call.

## How It Works

```
  Browser (Svelte 5)          SvelteKit Server            Backend Services
 ──────────────────       ──────────────────────       ─────────────────────
 Connect CIP-30 wallet    Remote functions proxy       SubbitMan (port 7822)
 Generate Ed25519 keys    Validate credentials          ├─ L2 accounting
 Open payment channel     Fetch oracle data              ├─ L1 tx building
 Sign IOUs per request    Charge service costs           └─ Auto-settlement
 View price feeds         REST API (/api/*)            Orcfax Validator Node
                                                        └─ Price feed source
```

1. **Connect wallet** — link a CIP-30 Cardano wallet (Eternl, Nami, Lace, etc.)
2. **Open channel** — lock ADA in an on-chain Subbit smart contract as escrow
3. **Fetch data** — each request includes a signed IOU authorizing the provider to claim a cumulative amount from the escrow
4. **Close & withdraw** — close the channel, wait for a settlement window, then reclaim unspent funds

## Project Structure

```
on-demand/
├── src/
│   ├── routes/              # SvelteKit pages and API endpoints
│   │   ├── app/             # Main application (feeds table, account setup)
│   │   ├── api/             # REST endpoints (feeds, prices, publish, channel, tos)
│   │   ├── login/           # Password gate
│   │   └── tos/             # Terms of Service page
│   └── lib/
│       ├── odapi/           # ODAPI client, remote functions, pricing
│       ├── subbit/          # Channel lifecycle, auth keys, credentials
│       ├── wallet/          # CIP-30 wallet wrapper (Mesh SDK)
│       ├── tos/             # Terms of Service data and utilities
│       ├── server/          # Server-side proxy helpers
│       └── components/      # UI components (app + shadcn-svelte primitives)
├── services/
│   ├── subbit-man-js/       # Subbit channel manager backend (git submodule)
│   └── subbit-xyz/          # Subbit protocol implementation (git submodule)
├── examples/                # Standalone API client example (Node.js + curl)
└── scripts/                 # Build-time helpers
```

## Quick Start

See [docs/getting-started.md](docs/getting-started.md) for the full setup guide.

```bash
# Clone with submodules
git clone --recurse-submodules https://github.com/orcfax/on-demand.git
cd on-demand

# Install dependencies
pnpm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your Blockfrost API key and other settings

# Run full stack (web + SubbitMan)
pnpm dev
```

## Commands

| Command                   | Description                                         |
| ------------------------- | --------------------------------------------------- |
| `pnpm dev`                | Run full stack (SvelteKit + SubbitMan) concurrently |
| `pnpm dev:only:web`       | Run SvelteKit dev server only                       |
| `pnpm build`              | Production build                                    |
| `pnpm start`              | Start production server (port 3000)                 |
| `pnpm test`               | Run tests (vitest)                                  |
| `pnpm check`              | TypeScript type checking                            |
| `pnpm lint`               | Lint code                                           |
| `pnpm prettier --write .` | Format code                                         |

## Tech Stack

- **Framework**: SvelteKit 2 + Svelte 5 (runes) + TypeScript
- **Styling**: Tailwind CSS 4 + shadcn-svelte
- **Wallet**: Mesh SDK (CIP-30 Cardano wallets)
- **Crypto**: @noble/ed25519 + @noble/hashes (Ed25519 signing, Blake2b hashing)
- **Encoding**: cbor2 (CBOR credential serialization)
- **Validation**: Zod
- **Deployment**: Node.js adapter, Docker (node:20-alpine)

## API

The application exposes REST endpoints for programmatic access. See [examples/README.md](examples/README.md) for the full API reference, credential format, and working code examples.

| Endpoint       | Method | Auth  | Description                            |
| -------------- | ------ | ----- | -------------------------------------- |
| `/api/feeds`   | GET    | None  | List available price feed IDs          |
| `/api/tos`     | GET    | None  | Get Terms of Service                   |
| `/api/channel` | GET    | Stamp | Get channel state                      |
| `/api/prices`  | GET    | IOU   | Fetch price data (0.01 ADA/request)    |
| `/api/publish` | POST   | IOU   | Publish on-chain datum (5 ADA/request) |

## Documentation

- [Getting Started](docs/getting-started.md) — setup, configuration, running, and deployment
- [Architecture](docs/architecture.md) — system design, data flows, and technical decisions
- [User Guide](docs/user-guide.md) — using the portal (connect wallet, open channel, fetch data)
- [Provider Guide](docs/provider-guide.md) — running your own instance as a service provider
- [API Examples](examples/README.md) — REST API reference with curl and Node.js examples
- [Glossary](docs/glossary.md) — key terms and concepts

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and how to submit changes.

## License

[Apache License 2.0](LICENSE) — Copyright 2026 Orcfax Ltd.
