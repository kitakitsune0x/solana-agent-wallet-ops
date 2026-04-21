---
name: solana-agent-wallet-ops
description: Use this repo to create Solana wallet sets, inspect balances, export addresses, preview or execute bulk SOL/SPL transfers, and run SplitNOW quote/order/status flows. Trigger when a user wants agent-driven Solana wallet operations, repeatable local wallet storage, or guarded batch transfers on devnet or mainnet-beta.
---

# Solana Agent Wallet Ops

Use this skill when the user wants this repository to act as the execution layer for Solana wallet work.

## First Moves

1. Read [README.md](./README.md) for the current command surface.
2. Read [docs/safety.md](./docs/safety.md) before touching live funds.
3. Use the default external SQLite path unless the user explicitly overrides it:
   `~/.solana-agent-wallet-ops/wallets.sqlite`

## Safety Rules

- Prefer `devnet` unless the user explicitly asks for `mainnet-beta`.
- Never print secret keys unless the user explicitly asks for them.
- Keep wallet storage and API keys outside the repo.
- For live transfers, always run a preview first, then execute only after clear user confirmation.
- For SOL transfers, leave the sender rent-exempt. The current planner accounts for fees plus the sender reserve.
- Treat SplitNOW as third-party external state: quote first, preview the order, then execute.

## Command Pattern

Use the repo-local CLIs:

- `create-wallets.ts`
- `import-wallets.ts`
- `list-wallets.ts`
- `balances.ts`
- `export-addresses.ts`
- `bulk-transfer.ts`
- `splitnow-quote.ts`
- `splitnow-order.ts`
- `splitnow-status.ts`

Prefer `pnpm tsx src/cli/<command>.ts ...` in normal local use.

If `tsx` IPC is blocked in the execution environment, fall back to:

```bash
node --import tsx src/cli/<command>.ts ...
```

## Workflow

### Wallet management

1. Create a set with `create-wallets`.
2. Import existing wallet JSON with `import-wallets` when the user already has keys.
3. Inspect with `list-wallets`.
4. Check balances with `balances`.
5. Export public addresses only with `export-addresses`.

### Bulk transfers

1. Resolve the sender from `--from-set` or `--from`.
2. Resolve recipients from `--to-set` or `--to-csv`.
3. Run `bulk-transfer --dry-run` first.
4. Confirm network, recipient list, amount, estimated fees, and remaining balance.
5. Use `bulk-transfer --execute` only after user approval.

### SplitNOW flow

1. Confirm `SPLITNOW_API_KEY` is available.
2. Create a quote with `splitnow-quote`.
3. Preview the wallet distribution with `splitnow-order`.
4. Execute the order only after the user approves the exchanger and recipient split.
5. Track progress with `splitnow-status`.

## What to Load Next

- For exact commands and examples: [README.md](./README.md)
- For storage layout and JSON/CSV shapes: [docs/storage-format.md](./docs/storage-format.md)
- For live-fund precautions: [docs/safety.md](./docs/safety.md)
