# Safety Notes

## Keep Secrets Out of Stdout

Wallet secrets are stored locally for v1, but they are stored in SQLite by default rather than repo-local JSON. The default DB path is:

```text
~/.solana-agent-wallet-ops/wallets.sqlite
```

That keeps secret-bearing state out of a public repo by default, but stdout still needs to stay clean.

Why this matters:

- agent transcripts can be logged
- terminals can be recorded
- shell history can leak arguments and pasted output
- CI logs and debugging sessions often persist longer than intended
- `gitignore` does not protect you if secrets are written into tracked locations elsewhere
- third-party API keys can be abused long before you notice a leak

Because of that, the toolkit:

- does not print secrets by default
- only reveals secrets when `--show-secrets` is explicitly passed
- never exports secrets to CSV
- rejects repo-local DB paths unless `--allow-repo-db` or `SAWO_ALLOW_REPO_DB=1` is set intentionally
- expects `SPLITNOW_API_KEY` to come from your local environment instead of a tracked file

SQLite is a storage engine, not encryption. If the DB file is compromised, the secrets inside it are compromised too.

## Bulk Sends Must Support Dry-Run

Bulk sends are where operational mistakes get expensive. A dry-run path is mandatory because it lets an operator or agent review:

- the selected network
- the sender
- the recipient set
- the per-recipient amounts
- the estimated fees
- the total required funds

Real sends require `--execute`. If that flag is not present, the command stays non-destructive.

## Test on Devnet First

Devnet is the safest place to validate:

- wallet-set generation
- CSV import shape
- amount formatting
- sender selection
- recipient count
- SPL mint handling
- associated token account creation behavior

Do not move to mainnet-beta until the same workflow has been proven on devnet.

## Operational Cautions for Agent Use

Agents are good at repetition, but repetition is exactly what makes wallet mistakes scale.

Recommended operating discipline:

- keep secret-bearing files and DBs out of shared repos and public artifacts
- review transfer plans before any `--execute`
- keep devnet and mainnet-beta sets clearly named
- use separate wallet sets for treasury, recipients, and experiments
- do not assume a token mint is correct; verify the mint address directly
- remember that SPL transfers still require SOL for fees, and sometimes for recipient associated token account creation
- do not put SplitNOW API keys on the command line if shell history is persisted on your machine
- confirm the selected SplitNOW exchanger and recipient percentages before creating an order
- remember that SplitNOW order creation is external state even before the deposit is funded

If you intentionally override storage into the repo, treat that as an exception that needs a deliberate reason, a short lifespan, and local cleanup.

## SPL-Specific Notes

When `--mint` is provided, the toolkit operates on a specific SPL token mint.

Important consequences:

- balances are checked against the associated token account for that mint
- transfers use mint decimals fetched from chain
- the sender needs enough token balance and enough SOL for operational costs
- recipients without an associated token account may require rent to create one during execution

Dry-run output is there to make those costs visible before anything is sent.
