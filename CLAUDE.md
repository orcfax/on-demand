# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ODAPI Portal Prototype — a SvelteKit web app for consuming (and publishing) Orcfax validator node price feed data through pay-per-use Subbit payment channels on Cardano. Users connect a Cardano wallet, generate Ed25519 signing keys, open a Subbit L2 payment channel, and make credentialed API calls to fetch or publish on-chain oracle price data.

### Commands

- **Package manager:** Always use `pnpm`, never npm or yarn
- **Dev (full stack):** `pnpm dev` — runs web app + subbit-man-js service concurrently
- **Dev (web only):** `pnpm dev:only:web`
- **Build:** `pnpm build`
- **Start production:** `node build` (after build, serves on port 3000)
- **Type check:** `pnpm check`
- **Type check (watch):** `pnpm check:watch`
- **Format:** `pnpm prettier --write .`
- **Lint:** `pnpm eslint .`

No test framework is currently configured.

### Architecture

#### Framework Stack

SvelteKit 2 + Svelte 5 (runes) + TypeScript, styled with Tailwind CSS 4 + shadcn-svelte. Node.js adapter for SSR deployment. Dockerized with Node 20-alpine.

#### Monorepo / Workspaces

pnpm workspace with two git submodules under `services/`:

- `services/subbit-man-js` — Subbit transaction manager backend (runs alongside the app in dev)
- `services/subbit-xyz` — Subbit protocol implementation; provides linked packages `@subbit-tx/kio` and `@subbit-tx/tx`

#### Key Experimental Features

- **Remote Functions** (`svelte.config.js` → `kit.experimental.remoteFunctions`): Server-side functions called directly from the client. Files named `*.remote.ts` in `src/lib/` contain these server functions (e.g., `feeds.remote.ts`, `prices.remote.ts`, `publish.remote.ts`, `sync.remote.ts`, `add.remote.ts`).
- **Async components** (`compilerOptions.experimental.async`): Svelte 5 async/await in components.

#### Core Modules (`src/lib/`)

| Module                      | Purpose                                                               |
| --------------------------- | --------------------------------------------------------------------- |
| `odapi/odapi.svelte.ts`     | Main ODAPI reactive class — manages feeds, prices, IndexedDB history  |
| `odapi/*.remote.ts`         | Server-side remote functions for ODAPI calls (feeds, prices, publish) |
| `subbit/channel.svelte.ts`  | Channel state management — open/close/add/withdraw lifecycle          |
| `subbit/authKey.svelte.ts`  | Ed25519 keypair generation, IndexedDB storage, IOU signing            |
| `subbit/credential.ts`      | CBOR-encoded credential creation for API requests                     |
| `subbit/server/*.remote.ts` | Server-side remote functions for Subbit operations                    |
| `wallet/wallet.svelte.ts`   | Mesh SDK wallet wrapper (CIP-30 Cardano wallets)                      |
| `localStore.svelte.ts`      | Generic localStorage-backed reactive state                            |
| `components/ui/`            | shadcn-svelte primitives (button, card, sidebar, tabs, etc.)          |

#### State Management Pattern

Svelte 5 runes (`$state`, `$derived`, `$effect`) with Svelte context API for dependency injection. The four main reactive objects — Wallet, AuthKey, Channel, ODAPI — are set as context in the app layout and consumed by child components. IndexedDB stores keypairs and price history. localStorage stores UI preferences.

#### Server Initialization (`hooks.server.ts`)

Custom error handler. All Lucid Evolution / Blockfrost / transaction building is handled by SubbitMan (a separate Fastify service), not the SvelteKit server.

#### Routing

- `/` — Landing/marketing page
- `/app` — Main application (feeds table, account setup, channel management)

### Environment Variables

Copy `.env.example` to `.env`. Key variables:

- `PUBLIC_NODE_ENV` — `development`, `test`, or `production`
- `PUBLIC_BLOCKFROST_NETWORK` — `Preview` or `Mainnet`
- `PRIVATE_BLOCKFROST_API_KEY` — Blockfrost API key matching the network
- `PRIVATE_ODAPI_VALIDATOR_URL` — Orcfax validator node endpoint
- `PRIVATE_SUBBIT_MAN_URL` — Subbit manager URL (default `http://localhost:7822`)
SvelteKit convention: `PUBLIC_*` vars are exposed to the client; `PRIVATE_*` are server-only.

### Code Conventions

- Svelte 5 runes only — no legacy `$:` reactive statements or Svelte stores
- shadcn-svelte components: refer to https://www.shadcn-svelte.com/docs/components when building UI
- Formatting: tabs, single quotes, no trailing commas, 100 char print width (see `.prettierrc`)
- Context files in `context/important/` contain domain knowledge about Subbit, IOUs, cryptography, and the ODAPI system

### Blockchain / Crypto Stack

- **Lucid Evolution** (`@lucid-evolution/lucid`) — Cardano transaction building (server-side)
- **Mesh SDK** (`@meshsdk/core`, `@meshsdk/svelte`) — CIP-30 wallet connection (client-side)
- **@noble/ed25519** + **@noble/hashes** — Ed25519 signing, Blake2b hashing for IOU credentials
- **cbor-x** / **cbor2** — CBOR encoding for credential canonicalization
- **@subbit-tx/tx** — Subbit validator contract and transaction builders

# CLAUDE INSTRUCTIONS:

## Workflow Orchestration

### 1. Plan Mode Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy

- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop

- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done

- Never mark a task complete without proving it works
- Diff your behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

---

# Svelte MCP Server

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here’s how to use the available tools effectively:

## Available Svelte MCP Tools:

1. list-sections
   Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths. When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

2. get-documentation
   Retrieves full documentation content for specific sections. Accepts single or multiple sections. After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user’s task.

3. svelte-autofixer
   Analyzes Svelte code and returns issues and suggestions. You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

4. playground-link
   Generates a Svelte Playground link with the provided code. After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.

If your MCP client supports it, we also recommend using the svelte-task prompt to instruct the LLM on the best way to use the MCP server.
