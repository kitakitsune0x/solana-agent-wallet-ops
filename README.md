# solana-agent-wallet-ops

`solana-agent-wallet-ops` is a CLI-first local toolkit for agent-driven Solana wallet operations. It is built for automation workflows, coding agents, and local scripts that need repeatable wallet-set storage, visibility into balances, and guarded bulk transfers.

This is not a consumer wallet app, not a GUI, and not tied to a single host such as OpenClaw, Codex, Claude Code, or Cursor. It is intended to be a reusable local primitive that those systems can wrap.

## Who It Is For

- Local automation and scripting workflows
- Agent/tool adapters that need wallet creation and transfer utilities
- Operators testing wallet batches on devnet before mainnet-beta use
- Teams that want a simple filesystem-backed wallet-set format

## Features

- Bulk create Solana wallets and save them as named wallet sets
- List wallet sets or inspect wallets inside a set
- Check balances in bulk
  - SOL by default
  - SPL token balances when `--mint <TOKEN_MINT>` is provided
- Export wallet addresses to CSV
- Bulk transfers with preview-first behavior
  - SOL transfers by default
  - SPL token transfers when `--mint <TOKEN_MINT>` is provided
- Devnet and mainnet-beta support
- Explicit `--execute` guard for real sends
- Dry-run friendly planning output

## Install

Requirements:

- Node.js 20+
- `pnpm`

Install dependencies:

```bash
pnpm install
```

## Command Examples

Create a wallet set:

```bash
pnpm tsx src/cli/create-wallets.ts --set test-set --count 25 --network devnet
```

List all wallet sets:

```bash
pnpm tsx src/cli/list-wallets.ts
```

Inspect one wallet set:

```bash
pnpm tsx src/cli/list-wallets.ts --set test-set
```

Check SOL balances:

```bash
pnpm tsx src/cli/balances.ts --set test-set
```

Check SPL balances for a mint:

```bash
pnpm tsx src/cli/balances.ts --set test-set --mint <TOKEN_MINT>
```

Export addresses:

```bash
pnpm tsx src/cli/export-addresses.ts --set test-set --out ./exports/test-set.csv
```

Preview a SOL distribution from the first wallet in one set to every wallet in another:

```bash
pnpm tsx src/cli/bulk-transfer.ts --from-set treasury --to-set campaign --amount 0.01 --dry-run
```

Execute that SOL distribution:

```bash
pnpm tsx src/cli/bulk-transfer.ts --from-set treasury --to-set campaign --amount 0.01 --execute
```

Preview a CSV-based SOL distribution from a single source wallet file:

```bash
pnpm tsx src/cli/bulk-transfer.ts --from ./wallet.json --to-csv ./recipients.csv --amount 0.01 --network devnet --dry-run
```

Preview an SPL token distribution:

```bash
pnpm tsx src/cli/bulk-transfer.ts --from-set treasury --to-csv ./token-recipients.csv --mint <TOKEN_MINT> --dry-run
```

Notes for CSV recipient input:

- If the CSV includes an `amount` column, per-row amounts are used.
- If the CSV omits `amount`, pass a global `--amount`.
- CSV columns:
  - required: `public_key`
  - optional: `label`
  - optional: `amount`

## Storage Format

Wallet sets live under:

```text
data/wallet-sets/
```

Each wallet-set JSON file stores:

- `set_name`
- `created_at`
- `network`
- `wallets`

Each wallet entry stores:

- `label`
- `public_key`
- `secret_key_base58`

Address exports are intentionally safer and only write:

- `label`
- `public_key`

See [docs/storage-format.md](docs/storage-format.md) for examples.

## Safety Warnings

- Secrets are stored locally in JSON for v1. Treat `data/wallet-sets/` as sensitive material.
- Commands do not print secret keys unless `--show-secrets` is explicitly passed.
- CSV exports never contain secrets.
- Real transfers require `--execute`.
- Transfer commands print a plan before sending.
- Use devnet first.
- For SPL transfers, the sender still needs SOL to pay transaction fees and any associated token account creation rent for recipients that do not already have one.

More detail: [docs/safety.md](docs/safety.md)

## Architecture Choices

- CLI-first TypeScript with `commander` keeps the toolkit scriptable and easy to wrap from different agents.
- Filesystem JSON storage keeps state local and inspectable without introducing a database.
- Wallet-set storage is asset-agnostic; SOL and SPL behavior is chosen at command time.
- SPL support is intentionally mint-driven instead of symbol-driven. The CLI fetches mint decimals on-chain and derives associated token accounts deterministically.
- Transfer execution is serial in v1 so failures are easier to reason about and partial completion is visible.

## End-to-End Test Flow

1. Create a devnet wallet set:

```bash
pnpm tsx src/cli/create-wallets.ts --set test-set --count 3 --network devnet
```

2. Inspect the wallets:

```bash
pnpm tsx src/cli/list-wallets.ts --set test-set
```

3. Export addresses:

```bash
pnpm tsx src/cli/export-addresses.ts --set test-set --out ./exports/test-set.csv
```

4. Fund the first wallet in `test-set` with devnet SOL, then preview a distribution:

```bash
pnpm tsx src/cli/bulk-transfer.ts --from-set test-set --to-csv ./exports/test-set.csv --amount 0.001 --dry-run
```

5. Check balances:

```bash
pnpm tsx src/cli/balances.ts --set test-set
```

6. For SPL testing, mint or obtain a devnet token, then preview token balances and a distribution:

```bash
pnpm tsx src/cli/balances.ts --set test-set --mint <DEVNET_TOKEN_MINT>
pnpm tsx src/cli/bulk-transfer.ts --from-set test-set --to-csv ./token-recipients.csv --mint <DEVNET_TOKEN_MINT> --dry-run
```

## Future Improvements

- Optional at-rest encryption for local wallet storage
- Adapter packages for Codex, Claude Code, Cursor, and OpenClaw
- Configurable concurrency for read-only RPC calls
- Better structured output modes for automation (`json`, exit codes by failure class)
- SPL token account discovery beyond the associated token account path
