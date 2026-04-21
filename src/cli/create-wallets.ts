#!/usr/bin/env node

import { Command } from "commander";

import { formatError, relativeFromCwd, renderTable } from "../lib/format.js";
import { getWalletSetPath, saveWalletSet } from "../lib/storage.js";
import { ensureNetwork, normalizeSetName, parsePositiveInteger } from "../lib/validation.js";
import { createWalletEntry } from "../lib/wallet.js";

interface Options {
  set: string;
  count: string;
  network: string;
  showSecrets?: boolean;
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("create-wallets")
    .description("Create a wallet set with multiple Solana wallets.")
    .requiredOption("--set <name>", "Wallet set name")
    .requiredOption("--count <count>", "Number of wallets to create")
    .requiredOption("--network <network>", "Target network: devnet or mainnet-beta")
    .option("--show-secrets", "Print secret keys after creation");

  program.parse(process.argv);
  const options = program.opts<Options>();
  const setName = normalizeSetName(options.set);
  const count = parsePositiveInteger(options.count, "count");
  const network = ensureNetwork(options.network);
  const wallets = Array.from({ length: count }, (_, index) =>
    createWalletEntry(`${setName}-${String(index + 1).padStart(3, "0")}`),
  );
  const filePath = getWalletSetPath(setName);

  await saveWalletSet({
    set_name: setName,
    created_at: new Date().toISOString(),
    network,
    wallets,
  });

  console.log(`Created wallet set "${setName}"`);
  console.log(`Network: ${network}`);
  console.log(`Wallets: ${wallets.length}`);
  console.log(`File: ${relativeFromCwd(filePath)}`);
  console.log("");

  const headers = options.showSecrets
    ? ["Label", "Public Key", "Secret Key (base58)"]
    : ["Label", "Public Key"];
  const rows = wallets.map((wallet) =>
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
