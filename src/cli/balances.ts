#!/usr/bin/env node

import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";

import { addStorageOptions, runCli, toStorageOptions } from "../lib/cli.js";
import { formatAssetAmount, formatSol, renderTable } from "../lib/format.js";
import { createRpcConnection, getSolBalances, getSplAssociatedBalances, getSplMintMetadata, resolveRpcUrl } from "../lib/rpc.js";
import { loadWalletSet, type StorageOptions } from "../lib/storage.js";
import { ensureNetwork, maybeNetwork } from "../lib/validation.js";
import { normalizePublicKey } from "../lib/wallet.js";

interface Options extends StorageOptions {
  set: string;
  network?: string;
  rpcUrl?: string;
  mint?: string;
}

async function main(): Promise<void> {
  const program = new Command();
  addStorageOptions(
    program
      .name("balances")
      .description("Check SOL or SPL balances for every wallet in a set.")
      .requiredOption("--set <name>", "Wallet set name")
      .option("--network <network>", "Override network: devnet or mainnet-beta")
      .option("--rpc-url <url>", "Custom RPC URL")
      .option("--mint <address>", "SPL token mint address"),
  );

  program.parse(process.argv);
  const options = program.opts<Options>();
  const storageOptions: StorageOptions = toStorageOptions(options);
  const walletSet = await loadWalletSet(options.set, storageOptions);
  const network = maybeNetwork(options.network) ?? ensureNetwork(walletSet.network);
  const connection = createRpcConnection(network, options.rpcUrl);
  const rpcTarget = resolveRpcUrl(network, options.rpcUrl);

  console.log(`Set: ${walletSet.set_name}`);
  console.log(`Network: ${network}`);
  console.log(`RPC: ${rpcTarget}`);

  if (!options.mint) {
    const publicKeys = walletSet.wallets.map((wallet) => new PublicKey(wallet.public_key));
    const results = await getSolBalances(connection, publicKeys);
    const totalLamports = results.reduce((sum, result) => sum + (result.lamports ?? 0), 0);
    const errorCount = results.filter((result) => result.error).length;
    const rows = walletSet.wallets.map((wallet, index) => {
      const result = results[index];
      return [
        wallet.label,
        wallet.public_key,
        result.error ? "-" : formatSol(result.lamports ?? 0),
        result.error ?? "ok",
      ];
    });

    console.log("Asset: SOL");
    console.log("");
    console.log(renderTable(["Label", "Public Key", "Balance", "Status"], rows));
    console.log("");
    console.log(`Total: ${formatSol(totalLamports)}`);

    if (errorCount > 0) {
      throw new Error(`Balance lookup completed with ${errorCount} ${errorCount === 1 ? "error" : "errors"}.`);
    }

    return;
  }

  const mintAddress = normalizePublicKey(options.mint, "mint");
  const mint = await getSplMintMetadata(connection, mintAddress);
  const ownerPublicKeys = walletSet.wallets.map((wallet) => new PublicKey(wallet.public_key));
  const results = await getSplAssociatedBalances(connection, ownerPublicKeys, mint.mintAddress);
  const total = results.reduce((sum, result) => sum + result.amount, 0n);
  const errorCount = results.filter((result) => result.error).length;
  const rows = walletSet.wallets.map((wallet, index) => {
    const result = results[index];
    return [
      wallet.label,
      wallet.public_key,
      formatAssetAmount(result.amount, mint.decimals),
      result.error ? result.error : result.accountFound ? "ok" : "no ATA",
    ];
  });

  console.log(`Asset: SPL token ${mint.mintAddress}`);
  console.log(`Mint Decimals: ${mint.decimals}`);
  console.log("");
  console.log(renderTable(["Label", "Public Key", "Balance", "Status"], rows));
  console.log("");
  console.log(`Total: ${formatAssetAmount(total, mint.decimals)}`);

  if (errorCount > 0) {
    throw new Error(`Balance lookup completed with ${errorCount} ${errorCount === 1 ? "error" : "errors"}.`);
  }
}

runCli(main);
