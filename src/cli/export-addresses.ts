#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";

import { escapeCsvValue, formatError, relativeFromCwd } from "../lib/format.js";
import { loadWalletSet } from "../lib/storage.js";

interface Options {
  set: string;
  out: string;
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("export-addresses")
    .description("Export wallet labels and public keys to CSV.")
    .requiredOption("--set <name>", "Wallet set name")
    .requiredOption("--out <path>", "Output CSV path");

  program.parse(process.argv);
  const options = program.opts<Options>();
  const walletSet = await loadWalletSet(options.set);
  const outputPath = path.resolve(process.cwd(), options.out);
  const lines = [
    "label,public_key",
    ...walletSet.wallets.map((wallet) => `${escapeCsvValue(wallet.label)},${escapeCsvValue(wallet.public_key)}`),
  ];

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");

  console.log(`Exported ${walletSet.wallets.length} addresses from "${walletSet.set_name}"`);
  console.log(`Network: ${walletSet.network}`);
  console.log(`Out: ${relativeFromCwd(outputPath)}`);
}

main().catch((error) => {
  console.error(`Error: ${formatError(error)}`);
  process.exit(1);
});
