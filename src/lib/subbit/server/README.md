# Subbit L1 Liaison Service

## Overview

This is a **simple, standalone script** that acts as the L1 liaison for Subbit channels. It syncs channel state from the Cardano blockchain to subbit-man-js and processes pending IOUs by submitting "sub" transactions.

**Location:** `services/subbit-xyz/js/l1-liaison.ts`

## Why This Approach?

Instead of creating a separate service with its own package.json and dependencies, this is a single TypeScript file that:

- ✅ Runs directly with `tsx` (no build step needed)
- ✅ Uses the existing `@subbit-tx/tx` transaction builders
- ✅ Lives in the workspace so it can import packages directly
- ✅ ~450 lines of clean, simple code
- ✅ No manual Plutus encoding or transaction building

## Quick Start

### 1. Install Dependencies

```bash
cd services/subbit-xyz/js
pnpm install
```

**Note:** You don't need to build the packages! The script imports TypeScript directly.

### 2. Configure Environment

Create a `.env` file in `services/subbit-xyz/js/`:

```bash
# Blockfrost Configuration
BLOCKFROST_API_KEY=preview...your_key_here
BLOCKFROST_NETWORK=Preview  # or Mainnet

# Provider Configuration
PROVIDER_KEY_HASH=f06528ab43a2f7bdf24668e625f7bb82a82e1b2a24f957717491aff8
PROVIDER_SIGNING_KEY=your_signing_key_here  # hex or bech32 format

# Subbit-Man-JS URL
SUBBIT_MAN_URL=http://localhost:7822

# Optional: Reference Script (more efficient)
# SUBBIT_REFERENCE_UTXO=txHash#outputIndex

# Intervals
SYNC_INTERVAL_MS=300000          # 5 minutes
IOU_PROCESS_INTERVAL_MS=600000   # 10 minutes

```

### 3. Run the Service

```bash
# With tsx directly (no build needed!)
pnpm tsx l1-liaison.ts

# Or add to package.json scripts:
# "l1-liaison": "tsx l1-liaison.ts"
pnpm l1-liaison
```

That's it! The service will:

1. Sync channels every 5 minutes
2. Process pending IOUs every 10 minutes
3. Automatically submit transactions to claim funds

## How It Works

### Channel Sync

```typescript
// 1. Fetch all Subbit UTXOs using the validator utilities
const subbits = await tx.validator.getStates(l, validatorAddress);

// 2. Filter for opened channels matching our provider
const openedChannels = subbits
	.filter((subbit) => subbit.state.kind === 'Opened')
	.filter((subbit) => subbit.state.value.constants.provider === PROVIDER_KEY_HASH);

// 3. Sync with subbit-man-js
await fetch(`${SUBBIT_MAN_URL}/l1/sync`, {
	method: 'POST',
	body: JSON.stringify(channelsForSync)
});
```

### IOU Processing

```typescript
// 1. Fetch pending IOUs
const ious = await fetch(`${SUBBIT_MAN_URL}/l1/ious`).then((r) => r.json());

// 2. For each IOU, build and submit transaction
const subbit = tx.validator.utxo2Subbit(utxo);
const txBuilder = tx.txs.sub.step(
	l.newTx(),
	utxo,
	subbit.state.value,
	iouAmount,
	tx.validator.subRed(iouAmount, iouSignature)
);

// 3. Sign and submit
const unsignedTx = await txBuilder.complete();
const signedTx = await unsignedTx.sign.withWallet().complete();
const txHash = await signedTx.submit();

// 4. Wait for confirmation
await l.awaitTx(txHash);
```

## Configuration Options

| Variable                  | Required | Default                 | Description                                      |
| ------------------------- | -------- | ----------------------- | ------------------------------------------------ |
| `BLOCKFROST_API_KEY`      | ✅ Yes   | -                       | Your Blockfrost API key                          |
| `BLOCKFROST_NETWORK`      | ✅ Yes   | `Preview`               | Network: `Preview` or `Mainnet`                  |
| `PROVIDER_KEY_HASH`       | ✅ Yes   | -                       | Your provider's verification key hash            |
| `PROVIDER_SIGNING_KEY`    | ✅ Yes\* | -                       | Signing key (required if IOU processing enabled) |
| `SUBBIT_MAN_URL`          | No       | `http://localhost:7822` | URL of subbit-man-js instance                    |
| `SYNC_INTERVAL_MS`        | No       | `300000`                | How often to sync (5 minutes)                    |
| `IOU_PROCESS_INTERVAL_MS` | No       | `600000`                | How often to check IOUs (10 minutes)             |
| `SUBBIT_REFERENCE_UTXO`   | No       | -                       | Reference script UTXO for efficiency             |

## Monitoring

The service logs detailed information:

```
╔════════════════════════════════════════╗
║   Subbit L1 Liaison Service            ║
╚════════════════════════════════════════╝

Configuration:
  Subbit-Man URL: http://localhost:7822
  Network: Preview
  Provider Key Hash: f06528ab...
  Sync Interval: 300s
  IOU Process Interval: 600s

Lucid initialized
  Network: Preview
  Validator address: addr_test1...

=== Starting L1 Sync ===
Found 5 Subbit UTXOs
Found 2 opened channels for our provider

Channels to sync:
  1. Keytag: 082a074eb19bd633...
     UTXO: a1b2c3d4...#0
     Balance: 1005000000 lovelace
     Sub: 0

Sync successful
=== L1 Sync Complete ===

=== Fetching Pending IOUs ===
Found 1 channels with pending IOUs

=== Processing IOUs ===

Processing IOU for channel 082a074eb19bd633...
  IOU Amount: 1000
  Signature: 385fbd9938ce759c...
  UTXO: a1b2c3d4...#0
  Current sub: 0
  Channel balance: 1005000000
  Building sub transaction...
  Signing transaction...
  Submitting transaction...
  ✅ Transaction submitted: e5f6g7h8...
  Waiting for confirmation...
  ✅ Transaction confirmed

=== IOU Processing Summary ===
  Total IOUs: 1
  Successful: 1
  Failed: 0

  Triggering sync to update channel states...

Service is running. Press Ctrl+C to stop.
```

## Production Deployment

### Option 1: Run with tsx (Development)

```bash
cd services/subbit-xyz/js
pnpm tsx l1-liaison.ts
```

### Option 2: Build and Run (Production)

If you prefer a compiled version:

```bash
# Build the tx packages
cd services/subbit-xyz/js
pnpm install
pnpm -r --filter @subbit-tx/tx build
pnpm -r --filter @subbit-tx/kio build

# Compile the liaison
pnpm tsc l1-liaison.ts --outDir dist --module esnext --target esnext

# Run compiled version
node dist/l1-liaison.js
```

### Option 3: Docker

```dockerfile
FROM node:18

# Install tsx globally
RUN npm install -g tsx

# Copy workspace
COPY services/subbit-xyz/js /app
WORKDIR /app

# Install dependencies
RUN pnpm install

# Run the liaison
CMD ["tsx", "l1-liaison.ts"]
```

### Option 4: Systemd Service

```ini
[Unit]
Description=Subbit L1 Liaison Service
After=network.target

[Service]
Type=simple
User=subbit
WorkingDirectory=/opt/subbit-xyz/js
Environment="NODE_ENV=production"
EnvironmentFile=/opt/subbit-xyz/js/.env
ExecStart=/usr/bin/pnpm tsx l1-liaison.ts
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

## Troubleshooting

### "Cannot find module '@subbit-tx/tx'"

Make sure you're running from the correct directory:

```bash
cd services/subbit-xyz/js
pnpm tsx l1-liaison.ts
```

### "BLOCKFROST_API_KEY environment variable is required"

Create a `.env` file in `services/subbit-xyz/js/` with your configuration.

### "Channel is not in Opened state"

The channel might be closed or settled. Check the channel state in subbit-man-js.

### Transaction fails with script error

- Verify your `PROVIDER_SIGNING_KEY` is correct
- Ensure the IOU signature is valid
- Check that the channel has sufficient balance

### No channels found

- Verify `PROVIDER_KEY_HASH` matches your channels
- Check you're on the correct network (Preview vs Mainnet)
- Ensure channels exist on-chain

## Architecture

```
┌─────────────────┐
│   Cardano L1    │
│   (Blockchain)  │
└────────┬────────┘
         │
         │ Query UTXOs
         │ Submit Txs
         ↓
┌─────────────────┐
│  L1 Liaison     │  ← l1-liaison.ts (this script)
│  - Sync         │
│  - Process IOUs │
└────────┬────────┘
         │
         │ HTTP API
         ↓
┌─────────────────┐
│ Subbit-Man-JS   │
│ (L2 State)      │
└─────────────────┘
```

## Advantages

Compared to the standalone `services/subbit-l1-liaison/`:

| Feature           | Standalone Service    | This Script        |
| ----------------- | --------------------- | ------------------ |
| Setup Time        | 30 minutes            | 5 minutes          |
| Build Required    | Yes                   | No (tsx)           |
| Code              | 600 lines             | 450 lines          |
| Transaction Logic | Manual                | Uses `tx.txs.sub`  |
| Maintenance       | High                  | Low                |
| Dependencies      | Separate package.json | Workspace packages |

## Support

- **Source:** `services/subbit-xyz/js/l1-liaison.ts`
- **Tx Package:** `services/subbit-xyz/js/packages/tx`
- **Design Docs:** `services/subbit-xyz/docs/design/l1-spec.md`

## Next Steps

1. Copy `.env.example` to `.env` and configure
2. Run `pnpm tsx l1-liaison.ts`
3. Monitor logs for successful sync and IOU processing
4. Once confirmed working, set up as a system service

**That's it! Much simpler than the standalone approach.** 🎉
