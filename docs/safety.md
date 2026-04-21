# Safety Notes

## Keep Secrets Out of Stdout

Wallet secrets are stored locally in wallet-set JSON files for v1. That makes the CLI easy to use from scripts and agents, but it also means stdout must stay clean by default.

Why this matters:

- agent transcripts can be logged
- terminals can be recorded
- shell history can leak arguments and pasted output
- CI logs and debugging sessions often persist longer than intended

Because of that, the toolkit:

- does not print secrets by default
- only reveals secrets when `--show-secrets` is explicitly passed
- never exports secrets to CSV

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

- keep wallet-set files out of shared repos and public artifacts
- review transfer plans before any `--execute`
- keep devnet and mainnet-beta sets clearly named
- use separate wallet sets for treasury, recipients, and experiments
- do not assume a token mint is correct; verify the mint address directly
- remember that SPL transfers still require SOL for fees, and sometimes for recipient associated token account creation

## SPL-Specific Notes

When `--mint` is provided, the toolkit operates on a specific SPL token mint.

Important consequences:

- balances are checked against the associated token account for that mint
- transfers use mint decimals fetched from chain
- the sender needs enough token balance and enough SOL for operational costs
- recipients without an associated token account may require rent to create one during execution

Dry-run output is there to make those costs visible before anything is sent.
