# Storage Format

## Wallet Set JSON

Wallet sets are stored under `data/wallet-sets/` as one JSON file per set.

Example:

```json
{
  "set_name": "test-set",
  "created_at": "2026-04-21T10:00:00.000Z",
  "network": "devnet",
  "wallets": [
    {
      "label": "test-set-001",
      "public_key": "7kSm7y6d8P2Vv9r8J1u3K8Y6r7p9N5R2X4L6Q8c1M2n",
      "secret_key_base58": "4f7x...replace-with-real-base58-secret..."
    },
    {
      "label": "test-set-002",
      "public_key": "B4tW3J5d6k9Y2Q1x8N7m4R6p2V5L1c8S3g7H2z9F6dQ",
      "secret_key_base58": "3c9q...replace-with-real-base58-secret..."
    }
  ]
}
```

Fields:

- `set_name`: wallet-set name, also used as the filename
- `created_at`: ISO-8601 timestamp
- `network`: `devnet` or `mainnet-beta`
- `wallets`: array of wallet entries

Wallet entry fields:

- `label`: human-readable label used in CLI output
- `public_key`: wallet public key
- `secret_key_base58`: base58-encoded Solana secret key

## Standalone Wallet File

`bulk-transfer.ts --from <file>` also accepts a standalone wallet JSON object:

```json
{
  "label": "treasury-001",
  "public_key": "7kSm7y6d8P2Vv9r8J1u3K8Y6r7p9N5R2X4L6Q8c1M2n",
  "secret_key_base58": "4f7x...replace-with-real-base58-secret..."
}
```

If you pass a wallet-set JSON file to `--from`, it must contain exactly one wallet. For multi-wallet sources, use `--from-set`.

## Address Export CSV

Address exports intentionally exclude secrets.

Example:

```csv
label,public_key
test-set-001,7kSm7y6d8P2Vv9r8J1u3K8Y6r7p9N5R2X4L6Q8c1M2n
test-set-002,B4tW3J5d6k9Y2Q1x8N7m4R6p2V5L1c8S3g7H2z9F6dQ
```

## Recipient CSV Input

Bulk transfer recipient CSV supports:

- required: `public_key`
- optional: `label`
- optional: `amount`

Examples:

Fixed amount mode:

```csv
label,public_key
alpha,7kSm7y6d8P2Vv9r8J1u3K8Y6r7p9N5R2X4L6Q8c1M2n
beta,B4tW3J5d6k9Y2Q1x8N7m4R6p2V5L1c8S3g7H2z9F6dQ
```

Per-row amount mode:

```csv
label,public_key,amount
alpha,7kSm7y6d8P2Vv9r8J1u3K8Y6r7p9N5R2X4L6Q8c1M2n,0.25
beta,B4tW3J5d6k9Y2Q1x8N7m4R6p2V5L1c8S3g7H2z9F6dQ,1.75
```

Notes:

- Without an `amount` column, pass a global `--amount`.
- With an `amount` column, each row controls its own amount.
- For SPL transfers, amounts are interpreted using the mint decimals fetched from chain.
