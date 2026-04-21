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
import { relativeFromCwd } from "../lib/format.js";
import { saveWalletSet, type StorageOptions } from "../lib/storage.js";
import { ensureNetwork, normalizeSetName, parsePositiveInteger } from "../lib/validation.js";
import { createWalletEntry } from "../lib/wallet.js";

interface Options extends StorageOptions {
  set: string;
  count: string;
  network: string;
  showSecrets?: boolean;
}

async function main(): Promise<void> {
  const program = new Command();
  addStorageOptions(
    program
      .name("create-wallets")
      .description("Create a wallet set with multiple Solana wallets.")
      .requiredOption("--set <name>", "Wallet set name")
      .requiredOption("--count <count>", "Number of wallets to create")
      .requiredOption("--network <network>", "Target network: devnet or mainnet-beta")
      .option("--show-secrets", `${SHOW_SECRETS_OPTION_DESCRIPTION} after creation`),
  );

  program.parse(process.argv);
  const options = program.opts<Options>();
  const storageOptions: StorageOptions = toStorageOptions(options);
  const setName = normalizeSetName(options.set);
  const count = parsePositiveInteger(options.count, "count");
  const network = ensureNetwork(options.network);
  const wallets = Array.from({ length: count }, (_, index) =>
    createWalletEntry(`${setName}-${String(index + 1).padStart(3, "0")}`),
  );
  const dbPath = await saveWalletSet({
    set_name: setName,
    created_at: new Date().toISOString(),
    network,
    wallets,
  }, storageOptions);

  console.log(`Created wallet set "${setName}"`);
  console.log(`Network: ${network}`);
  console.log(`Wallets: ${wallets.length}`);
  console.log(`DB: ${relativeFromCwd(dbPath)}`);
  console.log("");
  console.log(renderWalletTable(wallets, options.showSecrets));
  printSecretsReminder(options.showSecrets);
}

runCli(main);
