#!/usr/bin/env node

import path from "node:path";

import { Command } from "commander";

import {
  addStorageOptions,
  printSecretsReminder,
  renderWalletTable,
  runCli,
  SHOW_SECRETS_OPTION_DESCRIPTION,
  toStorageOptions,
} from "../lib/cli.js";
import { relativeFromCwd } from "../lib/format.js";
import { loadWalletSetFromFile, saveWalletSet, type StorageOptions } from "../lib/storage.js";
import { maybeNetwork } from "../lib/validation.js";

interface Options extends StorageOptions {
  from: string;
  set?: string;
  network?: string;
  showSecrets?: boolean;
}

async function main(): Promise<void> {
  const program = new Command();
  addStorageOptions(
    program
      .name("import-wallets")
      .description("Import wallet JSON into SQLite wallet-set storage.")
      .requiredOption("--from <path>", "Source wallet JSON, wallet-set JSON, or JSON array of wallet entries")
      .option("--set <name>", "Override wallet set name, or provide one for standalone wallet/array imports")
      .option(
        "--network <network>",
        "Override network, or provide one for standalone wallet/array imports: devnet or mainnet-beta",
      )
      .option("--show-secrets", `${SHOW_SECRETS_OPTION_DESCRIPTION} after import`),
  );

  program.parse(process.argv);
  const options = program.opts<Options>();
  const storageOptions: StorageOptions = toStorageOptions(options);
  const sourcePath = path.resolve(process.cwd(), options.from);
  const walletSet = await loadWalletSetFromFile(options.from, {
    setName: options.set,
    network: maybeNetwork(options.network),
  });
  const dbPath = await saveWalletSet(walletSet, storageOptions);

  console.log(`Imported wallet set "${walletSet.set_name}"`);
  console.log(`Network: ${walletSet.network}`);
  console.log(`Wallets: ${walletSet.wallets.length}`);
  console.log(`From: ${relativeFromCwd(sourcePath)}`);
  console.log(`DB: ${relativeFromCwd(dbPath)}`);
  console.log("");
  console.log(renderWalletTable(walletSet.wallets, options.showSecrets));
  printSecretsReminder(options.showSecrets);
}

runCli(main);
