import type { Command } from "commander";

import { formatError, renderTable } from "./format.js";
import type { StorageOptions } from "./storage.js";
import type { WalletEntry } from "./wallet.js";

export const DB_PATH_OPTION_DESCRIPTION = "SQLite DB path (default: ~/.solana-agent-wallet-ops/wallets.sqlite)";
export const ALLOW_REPO_DB_OPTION_DESCRIPTION = "Allow repo-local SQLite storage for secrets";
export const SHOW_SECRETS_OPTION_DESCRIPTION = "Display secret keys";

export function addStorageOptions(program: Command): Command {
  return program
    .option("--db-path <path>", DB_PATH_OPTION_DESCRIPTION)
    .option("--allow-repo-db", ALLOW_REPO_DB_OPTION_DESCRIPTION);
}

export function toStorageOptions(options: StorageOptions): StorageOptions {
  return {
    dbPath: options.dbPath,
    allowRepoDb: options.allowRepoDb,
  };
}

export function renderWalletTable(wallets: WalletEntry[], showSecrets = false): string {
  const headers = showSecrets
    ? ["Label", "Public Key", "Secret Key (base58)"]
    : ["Label", "Public Key"];
  const rows = wallets.map((wallet) =>
    showSecrets
      ? [wallet.label, wallet.public_key, wallet.secret_key_base58]
      : [wallet.label, wallet.public_key],
  );

  return renderTable(headers, rows);
}

export function printSecretsReminder(showSecrets?: boolean): void {
  if (showSecrets) {
    return;
  }

  console.log("");
  console.log("Secrets were not printed. Pass --show-secrets to display them explicitly.");
}

export function runCli(main: () => Promise<void>): void {
  void main().catch((error) => {
    console.error(`Error: ${formatError(error)}`);
    process.exit(1);
  });
}
