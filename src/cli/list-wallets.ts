#!/usr/bin/env node

import { Command } from "commander";

import { formatError, formatTimestamp, renderTable } from "../lib/format.js";
import { listWalletSets, loadWalletSet } from "../lib/storage.js";

interface Options {
  set?: string;
  showSecrets?: boolean;
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("list-wallets")
    .description("List wallet sets or wallets inside a set.")
    .option("--set <name>", "Wallet set name")
    .option("--show-secrets", "Display secret keys");

  program.parse(process.argv);
  const options = program.opts<Options>();

  if (!options.set) {
    const walletSets = await listWalletSets();

    if (walletSets.length === 0) {
      console.log("No wallet sets found.");
      return;
    }

    const rows = walletSets.map((walletSet) => [
      walletSet.set_name,
      walletSet.network,
      String(walletSet.wallets.length),
      formatTimestamp(walletSet.created_at),
    ]);

    console.log(renderTable(["Set", "Network", "Wallets", "Created At"], rows));
    return;
  }

  const walletSet = await loadWalletSet(options.set);
  console.log(`Set: ${walletSet.set_name}`);
  console.log(`Network: ${walletSet.network}`);
  console.log(`Wallets: ${walletSet.wallets.length}`);
  console.log(`Created At: ${formatTimestamp(walletSet.created_at)}`);
  console.log("");

  const headers = options.showSecrets
    ? ["Label", "Public Key", "Secret Key (base58)"]
    : ["Label", "Public Key"];
  const rows = walletSet.wallets.map((wallet) =>
    options.showSecrets
      ? [wallet.label, wallet.public_key, wallet.secret_key_base58]
      : [wallet.label, wallet.public_key],
  );
  console.log(renderTable(headers, rows));

  if (!options.showSecrets) {
    console.log("");
    console.log("Secrets were not printed. Pass --show-secrets to display them explicitly.");
  }
}

main().catch((error) => {
  console.error(`Error: ${formatError(error)}`);
  process.exit(1);
});
