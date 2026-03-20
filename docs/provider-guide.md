# Provider / Operator Guide

This guide covers running your own Orcfax On-Demand instance as a service provider — serving oracle data to consumers via Subbit payment channels.

## Overview

As a provider, you run two services:

1. **Orcfax On-Demand Web** — the SvelteKit app that consumers interact with (portal UI + REST API)
2. **SubbitMan** — the backend service that manages payment channels, validates credentials, and handles settlement

You also need:

- A **Blockfrost API key** for the target Cardano network
- An **Orcfax validator node** endpoint (the upstream data source)
- A **provider Ed25519 keypair** for signing settlement transactions
- The **Subbit reference script UTxO** on-chain

## Provider Identity

The provider is identified on-chain by an Ed25519 key hash. This key hash is embedded in every channel's datum, and the corresponding signing key is used by SubbitMan to sign settlement transactions.

### Generating provider keys

SubbitMan includes a key generation script that produces an Ed25519 keypair with all the formats you need:

```bash
cd services/subbit-man-js
node scripts/mk-key.js
```

This outputs:

```json
{
	"skeyHex": "abc123...",
	"skeyBech": "ed25519_sk1...",
	"vkeyHex": "def456...",
	"vkeyBech": "ed25519_vk1...",
	"vkhHex": "789abc..."
}
```

Save this output somewhere safe (not in version control). If you lose the signing key, any channels opened with this provider identity become unrecoverable on-chain.

Set these in SubbitMan's environment:

```
SUBBIT_MAN_PROVIDER_SIGNING_KEY=<skeyBech value, ed25519_sk1...>
SUBBIT_MAN_PROVIDER_KEY_HASH=<vkhHex value>
```

These values are used by SubbitMan for:

- Identifying which channels belong to this provider (datum contains the provider key hash)
- Signing settlement transactions to claim authorized funds
- Building open channel transactions with the correct provider identity

### Deriving the provider wallet address

To fund your provider wallet, you need its Cardano bech32 address. Derive it using Lucid (already installed in the project):

```bash
node -e "
import('@lucid-evolution/lucid').then(async ({ Lucid, Blockfrost }) => {
  const l = await Lucid(
    new Blockfrost('https://cardano-preview.blockfrost.io/api/v0', 'YOUR_BLOCKFROST_KEY'),
    'Preview'
  );
  l.selectWallet.fromPrivateKey('YOUR_SKEY_BECH32_HERE');
  console.log(await l.wallet().address());
});
"
```

Replace `YOUR_SKEY_BECH32_HERE` with the `skeyBech` value from the key generation step, and `YOUR_BLOCKFROST_KEY` with your Blockfrost API key. This prints an `addr_test1...` address (Preview) or `addr1...` address (Mainnet).

### Funding the provider wallet

The provider wallet needs ADA to pay transaction fees for settlement operations.

**Preview testnet:** Request tADA from the [Cardano Testnet Faucet](https://docs.cardano.org/cardano-testnets/tools/faucet/). Select the Preview network and paste your `addr_test1...` address.

**Mainnet:** Send ADA to your `addr1...` address from any Cardano wallet.

## Subbit Reference Script

The Subbit smart contract must be deployed on-chain as a reference script. The reference UTxO allows transactions to reference the script without including it in the transaction body (saving fees and size).

SubbitMan's `SUBBIT_REFERENCE_UTXO` env var points to this UTxO:

```
SUBBIT_REFERENCE_UTXO=<txHash>#<outputIndex>
```

The script source is in `services/subbit-xyz/aik/`. If deploying to a new network, you'll need to publish the compiled script to a UTxO.

## SubbitMan Configuration

SubbitMan (`services/subbit-man-js`) is configured via environment variables. When running with `pnpm dev`, it inherits from the root `.env`.

Key SubbitMan configuration:

| Variable                           | Description                                                        |
| ---------------------------------- | ------------------------------------------------------------------ |
| `SUBBIT_MAN_BLOCKFROST_API_KEY`    | Blockfrost API key for the target network                          |
| `SUBBIT_MAN_BLOCKFROST_NETWORK`    | `Preview` or `Mainnet` (default: `Preview`)                        |
| `SUBBIT_MAN_PROVIDER_KEY_HASH`     | Provider payment key hash, hex (from `mk-key.js` `vkhHex`)         |
| `SUBBIT_MAN_PROVIDER_SIGNING_KEY`  | Provider Ed25519 signing key, bech32 (from `mk-key.js` `skeyBech`) |
| `SUBBIT_MAN_SUBBIT_REFERENCE_UTXO` | Reference script UTxO (`txHash#outputIndex`)                       |
| `SUBBIT_MAN_DB_PATH`               | LevelDB database path (default: `./db`)                            |
| `SUBBIT_MAN_LIAISON_ENABLED`       | Enable automated liaison cycle (default: `false`)                  |
| `SUBBIT_MAN_CLOSE_PERIOD`          | Channel close period in ms (default: `86400000` / 24h)             |

All SubbitMan env vars use the `SUBBIT_MAN_` prefix. The service port (default 7822) is set via the Fastify CLI `--port` flag in the start script, not an env var.

### LevelDB storage

SubbitMan stores channel state in LevelDB at the configured `DB_PATH`. This includes:

- Channel records (keytag, stage, accounting fields)
- IOU history
- Sync state

Back up this directory if you need to preserve state across redeployments.

### The liaison loop

SubbitMan runs an automated background process (the "liaison loop") that:

1. **Syncs chain state** — periodically scans on-chain UTxOs to discover new channels and detect state changes
2. **Settles closed channels** — when a consumer closes a channel, the liaison detects it and submits a settlement transaction to claim authorized funds
3. **Processes IOUs** — batches pending IOUs for efficient on-chain settlement

This loop runs automatically. No manual intervention is needed for normal operations.

## Connecting to a Validator Node

The `PRIVATE_ODAPI_VALIDATOR_URL` env var points to the Orcfax validator node that provides price feed data. The SvelteKit server proxies requests to this endpoint.

The validator must implement:

| Endpoint                    | Method | Description                               |
| --------------------------- | ------ | ----------------------------------------- |
| `/feeds`                    | GET    | Returns a JSON array of feed ID strings   |
| `/subbit/request?feed_id=X` | GET    | Returns price data for the specified feed |
| `/subbit/request?feed_id=X` | POST   | Publishes a price datum on-chain          |

Multiple `feed_id` query params are supported for batch operations.

## Deployment

### Two-service architecture

In production, the web app and SubbitMan should run as separate services:

```
Internet → Reverse Proxy → Orcfax On-Demand Web (port 3000)
                                    ↓
                            SubbitMan (port 7822, internal only)
```

SubbitMan should **not** be exposed to the public internet. The web app communicates with it via `PRIVATE_SUBBIT_MAN_URL`.

### Docker

Both services have Dockerfiles. The root `Dockerfile` builds the web app:

```bash
docker build -t orcfax-express-web .
docker run -p 3000:3000 --env-file .env orcfax-express-web
```

SubbitMan has its own Dockerfile at `services/subbit-man-js/Dockerfile`:

```bash
docker build -t subbit-man -f services/subbit-man-js/Dockerfile services/subbit-man-js
docker run -p 7822:7822 --env-file .env.subbitman subbit-man
```

## Monitoring

### What to watch

- **SubbitMan logs** — connection errors, settlement failures, liaison loop activity
- **Channel states** — channels stuck in "closing" for longer than the close period may indicate a liaison issue
- **LevelDB size** — grows with channel/IOU history; consider periodic cleanup for long-running instances
- **Blockfrost API usage** — both the web app and SubbitMan make Blockfrost calls; monitor your plan limits

### Health checks

- SubbitMan: `GET http://localhost:7822/` should respond
- Web app: `GET http://localhost:3000/api/feeds` should return a feed list (no auth needed)

### Settlement flow

When a consumer closes a channel:

1. The web app fires a settle request to SubbitMan (fire-and-forget)
2. SubbitMan's liaison loop also detects closed channels during periodic sync
3. SubbitMan builds and submits a settlement transaction claiming up to the latest IOU amount
4. If settlement fails (e.g., insufficient collateral, timing), it retries on the next liaison loop cycle

## Security Considerations

### Private keys

- `PROVIDER_SIGNING_KEY` (SubbitMan env) grants full control over settlement. Protect it like a wallet key.
- Never commit `.env` files to version control (`.gitignore` already excludes them)
- In production, use a secrets manager rather than environment files

### Network exposure

- SubbitMan should only be accessible from the web app server, not the public internet
- The REST API validates all credentials server-side via SubbitMan before serving data
- The password gate is a convenience measure, not a security boundary — the real auth is credential-based

### Credential validation

All paid requests go through this flow:

1. Extract `X-Credential` header
2. Forward to SubbitMan `/l2/tot` for signature verification and balance check
3. If valid, proceed with the request
4. After serving data, charge the cost via SubbitMan `/l2/mod`

Invalid signatures, insufficient balances, and expired stamps are rejected with appropriate HTTP status codes (402, 403).

## Terms of Service Updates

To update the ToS:

1. Edit `src/lib/tos/tos.json` — update `version`, `effectiveDate`, pricing, clauses as needed
2. Set `previousVersion` to the old version and its pricing (enables grace period)
3. Add entries to `changelog`
4. Rebuild and redeploy

During the grace period (`gracePeriodDays`), previous pricing applies. Consumers using the REST API will see `X-ToS-Grace-Deadline` response headers. After the grace period, requests without `X-ToS-Accepted: <new-version>` receive a 409 error.
