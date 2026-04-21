#!/usr/bin/env node

import { Command } from "commander";

import {
  addStorageOptions,
  printSecretsReminder,
  renderWalletTable,
  runCli,
  SHOW_SECRETS_OPTION_DESCRIPTION,
  toStorageOptions,
} from "../lib/cli.js";
import { formatTimestamp, renderTable } from "../lib/format.js";
import { listWalletSetSummaries, loadWalletSet, type StorageOptions } from "../lib/storage.js";

interface Options extends StorageOptions {
  set?: string;
  showSecrets?: boolean;
}

async function main(): Promise<void> {
  const program = new Command();
  addStorageOptions(
    program
      .name("list-wallets")
      .description("List wallet sets or wallets inside a set.")
      .option("--set <name>", "Wallet set name")
      .option("--show-secrets", SHOW_SECRETS_OPTION_DESCRIPTION),
  );

  program.parse(process.argv);
  const options = program.opts<Options>();
  const storageOptions: StorageOptions = toStorageOptions(options);

  if (!options.set) {
    const walletSets = await listWalletSetSummaries(storageOptions);

    if (walletSets.length === 0) {
      console.log("No wallet sets found.");
      return;
    }

    const rows = walletSets.map((walletSet) => [
      walletSet.set_name,
      walletSet.network,
      String(walletSet.wallet_count),
      formatTimestamp(walletSet.created_at),
    ]);

    console.log(renderTable(["Set", "Network", "Wallets", "Created At"], rows));
    return;
  }

  const walletSet = await loadWalletSet(options.set, storageOptions);
  console.log(`Set: ${walletSet.set_name}`);
  console.log(`Network: ${walletSet.network}`);
  console.log(`Wallets: ${walletSet.wallets.length}`);
  console.log(`Created At: ${formatTimestamp(walletSet.created_at)}`);
  console.log("");
  console.log(renderWalletTable(walletSet.wallets, options.showSecrets));
  printSecretsReminder(options.showSecrets);
}

runCli(main);
