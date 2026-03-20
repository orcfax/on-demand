# Orcfax On-Demand API — Examples

Programmatic access to the Orcfax On-Demand price feed service using Subbit payment channels on Cardano.

## Prerequisites

- **Node.js 20+**
- An **open Subbit channel** on the configured Cardano network (Preview or Mainnet)
- A **keyfile** downloaded from the Orcfax On-Demand portal (`orcfax-on-demand-key` format)

## curl Examples

All examples assume the server is running at `http://localhost:5173`. Replace with your deployment URL.

### List feeds (no auth)

```bash
curl http://localhost:5173/api/feeds
```

### Get Terms of Service (no auth)

```bash
curl http://localhost:5173/api/tos
```

### Get channel info (Stamp credential)

```bash
curl -H "X-Credential: $CRED" http://localhost:5173/api/channel
```

### Get price (IOU credential)

```bash
curl -H "X-Credential: $CRED" -H "X-ToS-Accepted: 1.0.0" \
  "http://localhost:5173/api/prices?feed_id=ADA-USD"
```

Multiple feeds:

```bash
curl -H "X-Credential: $CRED" -H "X-ToS-Accepted: 1.0.0" \
  "http://localhost:5173/api/prices?feed_id=ADA-USD&feed_id=ADA-DJED"
```

### Publish on-chain (IOU credential)

```bash
curl -X POST -H "X-Credential: $CRED" -H "X-ToS-Accepted: 1.0.0" \
  "http://localhost:5173/api/publish?feed_id=ADA-USD"
```

Publish all feeds:

```bash
curl -X POST -H "X-Credential: $CRED" -H "X-ToS-Accepted: 1.0.0" \
  "http://localhost:5173/api/publish?all_feeds=true"
```

## Node.js Example Script

The `orcfax-on-demand.mjs` script demonstrates the full API flow: load keyfile, fetch ToS, list feeds, check channel state, and get a price with automatic retry on insufficient balance.

### Install dependencies

```bash
cd examples
pnpm add @noble/ed25519 @noble/hashes cbor2
```

### Run

```bash
node orcfax-on-demand.mjs ./path-to-keyfile.json
```

Set `ODAPI_URL` to point at a different server:

```bash
ODAPI_URL=https://express.orcfax.io node orcfax-on-demand.mjs ./keyfile.json
```

## API Reference

| Endpoint       | Method | Auth  | Query Params                               | Response                                                     |
| -------------- | ------ | ----- | ------------------------------------------ | ------------------------------------------------------------ |
| `/api/feeds`   | GET    | None  | —                                          | `string[]` of feed IDs                                       |
| `/api/tos`     | GET    | None  | —                                          | ToS JSON (version, pricing, clauses)                         |
| `/api/channel` | GET    | Stamp | —                                          | `{ keytag, stage, cost, iouAmt, sub, subbitAmt, sig }`       |
| `/api/prices`  | GET    | IOU   | `feed_id` (repeatable)                     | `{ status, invalid, manifest, prices }`                      |
| `/api/publish` | POST   | IOU   | `feed_id` (repeatable) or `all_feeds=true` | `{ status, message, invalid, manifest, unavailable, datum }` |

### Headers

| Header                   | Direction | Required                         | Description                       |
| ------------------------ | --------- | -------------------------------- | --------------------------------- |
| `X-Credential`           | Request   | Yes (paid + channel endpoints)   | Base64url-encoded CBOR credential |
| `X-ToS-Accepted`         | Request   | Yes (paid endpoints, post-grace) | ToS version string (e.g. `1.0.0`) |
| `X-ToS-Version`          | Response  | Always (paid endpoints)          | Current ToS version               |
| `X-ToS-Hash`             | Response  | Always (paid endpoints)          | Blake2b hash of ToS JSON          |
| `X-ToS-Grace-Deadline`   | Response  | During grace period only         | ISO 8601 deadline                 |
| `X-ToS-Previous-Version` | Response  | During grace period only         | Previous ToS version              |

## Credential Format

Every authenticated request requires an `X-Credential` header containing a base64url-encoded CBOR payload: `[publicKey, message, signature]`.

There are two credential types:

### Stamp credential (for `/api/channel`)

Used to prove identity without payment. Contains the current timestamp:

- Message: `CBOR tag 122 [channelTag, timestampMs]`
- The server validates the signature and checks the timestamp is recent

### IOU credential (for `/api/prices`, `/api/publish`)

Authorizes payment. Contains a cumulative amount:

- Message: `CBOR tag 121 [channelTag, iouAmount]`
- `iouAmount` is the **cumulative total** you authorize the provider to claim (in lovelace)
- Each request should increment `iouAmount` by the service cost

## Error Handling

All errors return JSON with `error` and `message` fields.

| Status | Error                | Meaning                                                                |
| ------ | -------------------- | ---------------------------------------------------------------------- |
| 400    | `BadRequest`         | Missing or invalid query parameters                                    |
| 401    | `Unauthorized`       | Missing `X-Credential` header                                          |
| 402    | `InsufficientAmount` | IOU amount too low — sync channel state and retry                      |
| 403    | `Forbidden`          | Invalid credential (bad signature, expired stamp, no channel, etc.)    |
| 409    | `TosUpdateRequired`  | ToS updated — review at `/api/tos` and include `X-ToS-Accepted` header |
| 500    | `InternalError`      | Server error                                                           |
| 502    | `UpstreamError`      | Validator node unreachable or returned an error                        |

### The InsufficientAmount retry pattern

When you get a **402**, your IOU amount is stale. To recover:

1. Create a **Stamp** credential and call `GET /api/channel` to get the current `iouAmt`
2. Compute your new IOU: `newIouAmt = currentIouAmt + serviceCost`
3. Create an **IOU** credential with `newIouAmt` and retry the request

The example script (`orcfax-on-demand.mjs`) implements this pattern in the `getPriceWithRetry()` function.
