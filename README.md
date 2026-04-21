# solana-agent-wallet-ops

`solana-agent-wallet-ops` is a CLI-first local toolkit for agent-driven Solana wallet operations. It is built for automation workflows, coding agents, and local scripts that need repeatable wallet-set storage, visibility into balances, and guarded bulk transfers.

This is not a consumer wallet app, not a GUI, and not tied to a single host such as OpenClaw, Codex, Claude Code, or Cursor. It is intended to be a reusable local primitive that those systems can wrap.

## Who It Is For

- Local automation and scripting workflows
- Agent/tool adapters that need wallet creation and transfer utilities
- Operators testing wallet batches on devnet before mainnet-beta use
- Teams that want local, scriptable wallet storage without adding external infrastructure

## Features

- Bulk create Solana wallets and save them as named wallet sets
- List wallet sets or inspect wallets inside a set
- Store wallet sets in local SQLite with indexed lookups
- Check balances in bulk
  - SOL by default
  - SPL token balances when `--mint <TOKEN_MINT>` is provided
- Export wallet addresses to CSV
- Bulk transfers with preview-first behavior
  - SOL transfers by default
  - SPL token transfers when `--mint <TOKEN_MINT>` is provided
- SplitNOW integration for multi-wallet quote, order, and status workflows
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

Optional local build:

```bash
pnpm build
```

## Command Examples

Create a wallet set:

```bash
pnpm tsx src/cli/create-wallets.ts --set test-set --count 25 --network devnet
```

Create a wallet set with an explicit external DB path:

```bash
pnpm tsx src/cli/create-wallets.ts --set test-set --count 25 --network devnet --db-path ~/.solana-agent-wallet-ops/wallets.sqlite
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

Create a SplitNOW quote for splitting SOL across Solana wallets:

```bash
export SPLITNOW_API_KEY="YOUR_SPLITNOW_API_KEY"
pnpm tsx src/cli/splitnow-quote.ts --from-amount 10 --from-asset-id sol --from-network-id solana
```

Preview a SplitNOW order from an existing quote into a wallet set:

```bash
pnpm tsx src/cli/splitnow-order.ts --quote-id QUOTE123 --to-set campaign
```

Create the real SplitNOW order after review:

```bash
pnpm tsx src/cli/splitnow-order.ts --quote-id QUOTE123 --to-set campaign --execute
```

Track SplitNOW order status:

```bash
pnpm tsx src/cli/splitnow-status.ts --order-id ABC123
```

Notes for CSV recipient input:

- If the CSV includes an `amount` column, per-row amounts are used.
- If the CSV omits `amount`, pass a global `--amount`.
- CSV columns:
  - required: `public_key`
- optional: `label`
- optional: `amount`

Storage path overrides:

- default DB path: `~/.solana-agent-wallet-ops/wallets.sqlite`
- CLI override: `--db-path <path>`
- env override: `SAWO_DB_PATH=/path/to/wallets.sqlite`
- repo-local DBs are rejected unless you pass `--allow-repo-db` or set `SAWO_ALLOW_REPO_DB=1`
- SplitNOW API key: `SPLITNOW_API_KEY=...`

## Storage Format

Primary wallet storage lives in a local SQLite database:

```text
~/.solana-agent-wallet-ops/wallets.sqlite
```

The DB contains:

- `wallet_sets`
- `wallets`

Each stored wallet entry includes:

- `label`
- `public_key`
- `secret_key_base58`

For portability, `bulk-transfer --from <file>` still accepts:

- a standalone wallet JSON object
- a one-wallet wallet-set JSON object

Address exports remain safer and only write:

- `label`
- `public_key`

See [docs/storage-format.md](docs/storage-format.md) for examples.

## Safety Warnings

- Secret-bearing storage defaults outside the repo at `~/.solana-agent-wallet-ops/wallets.sqlite`.
- Repo-local DB paths are blocked unless you opt in with `--allow-repo-db` or `SAWO_ALLOW_REPO_DB=1`.
- SQLite improves structure and performance. It does not encrypt private keys.
- SplitNOW API keys should stay in environment variables or untracked local files, not in the repo or shell history.
- Commands do not print secret keys unless `--show-secrets` is explicitly passed.
- CSV exports never contain secrets.
- Real transfers require `--execute`.
- Transfer commands print a plan before sending.
- Use devnet first.
- For SPL transfers, the sender still needs SOL to pay transaction fees and any associated token account creation rent for recipients that do not already have one.
- SplitNOW order creation only becomes funded after you send the requested deposit. Review the quote, exchanger, and recipient split first.

More detail: [docs/safety.md](docs/safety.md)

## Architecture Choices

- CLI-first TypeScript with `commander` keeps the toolkit scriptable and easy to wrap from different agents.
- Local SQLite storage keeps state queryable, atomic, and scalable without adding an external service.
- Secret-bearing storage defaults outside the repo because `gitignore` is not a security boundary.
- Wallet-set storage is asset-agnostic; SOL and SPL behavior is chosen at command time.
- SPL support is intentionally mint-driven instead of symbol-driven. The CLI fetches mint decimals on-chain and derives associated token accounts deterministically.
- SplitNOW integration is isolated in its own client and CLI commands so agent workflows can use quotes/orders without coupling the core wallet-storage path to a third-party exchange.
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

7. For SplitNOW testing, create a quote, preview the order payload, then create the order:

```bash
export SPLITNOW_API_KEY="YOUR_SPLITNOW_API_KEY"
pnpm tsx src/cli/splitnow-quote.ts --from-amount 10 --from-asset-id sol --from-network-id solana
pnpm tsx src/cli/splitnow-order.ts --quote-id <QUOTE_ID> --to-set test-set
pnpm tsx src/cli/splitnow-order.ts --quote-id <QUOTE_ID> --to-set test-set --execute
pnpm tsx src/cli/splitnow-status.ts --order-id <ORDER_ID>
```

## Future Improvements

- Optional at-rest encryption for local wallet storage
- Adapter packages for Codex, Claude Code, Cursor, and OpenClaw
- Configurable concurrency for read-only RPC calls
- Better structured output modes for automation (`json`, exit codes by failure class)
- SPL token account discovery beyond the associated token account path
- SplitNOW quote caching and exchanger-selection strategies beyond `best`
