# Contributing to Orcfax On-Demand

Thank you for your interest in contributing to the Orcfax On-Demand portal. This document covers how to set up a development environment, the code standards we follow, and how to submit changes.

## Getting Started

See the [Getting Started guide](docs/getting-started.md) for full setup instructions. The short version:

```bash
git clone --recurse-submodules https://github.com/orcfax/on-demand.git
cd on-demand
pnpm install
cp .env.example .env   # fill in your values
pnpm dev
```

**Prerequisites:** Node.js 20+, pnpm (via corepack), Git, a Blockfrost API key, and a CIP-30 Cardano wallet extension.

## Development Commands

| Command                   | Purpose                          |
| ------------------------- | -------------------------------- |
| `pnpm dev`                | Run full stack (web + SubbitMan) |
| `pnpm dev:only:web`       | Run web app only                 |
| `pnpm build`              | Production build                 |
| `pnpm test`               | Run tests (vitest)               |
| `pnpm test:watch`         | Run tests in watch mode          |
| `pnpm check`              | Type check (svelte-check)        |
| `pnpm eslint .`           | Lint                             |
| `pnpm prettier --write .` | Format                           |
| `pnpm prettier --check .` | Check formatting                 |

## Code Style

The project uses Prettier and ESLint. Configuration:

- **Tabs** for indentation
- **Single quotes**
- **No trailing commas**
- **100 character** print width
- Prettier plugins for Svelte and Tailwind class sorting

Before submitting a PR, make sure your code passes:

```bash
pnpm prettier --check .
pnpm eslint .
pnpm check
pnpm test
```

## Conventions

- **Svelte 5 runes only** — no legacy `$:` reactive statements or Svelte stores. Use `$state`, `$derived`, and `$effect`.
- **TypeScript** throughout — no `any` unless absolutely necessary.
- **pnpm** as the package manager — never npm or yarn.
- **Remote functions** (`*.remote.ts`) for client-server communication in the portal UI.
- **shadcn-svelte** for UI components — see `src/lib/components/ui/`.

## Reporting Issues

Open an issue on GitHub with:

- A clear description of the problem or suggestion
- Steps to reproduce (for bugs)
- Your environment (OS, Node version, browser, wallet extension)

## Submitting Changes

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes
4. Ensure all checks pass (`pnpm test`, `pnpm check`, `pnpm eslint .`, `pnpm prettier --check .`)
5. Open a pull request against `main` with a clear description of what changed and why

## Project Structure

For an overview of the codebase architecture, see [docs/architecture.md](docs/architecture.md).

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
