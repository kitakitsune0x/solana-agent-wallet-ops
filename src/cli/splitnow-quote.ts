#!/usr/bin/env node

import { Command } from "commander";

import { runCli } from "../lib/cli.js";
import { formatError, renderTable } from "../lib/format.js";
import {
  chooseBestSplitNowRate,
  resolveSplitNowApiKey,
  SplitNowClient,
  type SplitNowRate,
} from "../lib/splitnow.js";
import { parsePositiveNumber } from "../lib/validation.js";

interface Options {
  apiKey?: string;
  apiUrl?: string;
  fromAmount: string;
  fromAssetId?: string;
  fromNetworkId?: string;
  toAssetId?: string;
  toNetworkId?: string;
}

function sortRates(rates: SplitNowRate[]): SplitNowRate[] {
  return [...rates].sort((left, right) => right.exchangeRate - left.exchangeRate);
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("splitnow-quote")
    .description("Create and fetch a SplitNOW quote for splitting funds across Solana wallets.")
    .requiredOption("--from-amount <amount>", "Input asset amount")
    .option("--api-key <key>", "SplitNOW API key (prefer SPLITNOW_API_KEY)")
    .option("--api-url <url>", "Override SplitNOW API URL")
    .option("--from-asset-id <id>", "Input asset id", "sol")
    .option("--from-network-id <id>", "Input network id", "solana")
    .option("--to-asset-id <id>", "Output asset id", "sol")
    .option("--to-network-id <id>", "Output network id", "solana");

  program.parse(process.argv);
  const options = program.opts<Options>();
  const client = new SplitNowClient({
    apiKey: resolveSplitNowApiKey(options.apiKey),
    apiUrl: options.apiUrl,
  });
  const fromAmount = parsePositiveNumber(options.fromAmount, "fromAmount");
  const quote = await client.createAndFetchQuote({
    fromAmount,
    fromAssetId: options.fromAssetId ?? "sol",
    fromNetworkId: options.fromNetworkId ?? "solana",
    toAssetId: options.toAssetId ?? "sol",
    toNetworkId: options.toNetworkId ?? "solana",
  });
  const sortedRates = sortRates(quote.rates);

  console.log(`Quote ID: ${quote.quoteId}`);
  console.log(
    `Route: ${fromAmount} ${options.fromAssetId ?? "sol"} on ${options.fromNetworkId ?? "solana"} -> ${options.toAssetId ?? "sol"} on ${options.toNetworkId ?? "solana"}`,
  );

  if (sortedRates.length === 0) {
    console.log("No quote rates were returned.");
    return;
  }

  console.log("");
  console.log(
    renderTable(
      ["Exchanger", "Estimated Output", "Status"],
      sortedRates.map((rate) => [
        rate.exchangeId,
        rate.exchangeRate.toString(),
        rate.exchangeRate > 0 ? "supported" : "unavailable",
      ]),
    ),
  );

  try {
    const bestRate = chooseBestSplitNowRate(sortedRates);
    console.log("");
    console.log(`Best Exchanger: ${bestRate.exchangeId}`);
    console.log(`Best Estimated Output: ${bestRate.exchangeRate}`);
  } catch (error) {
    console.log("");
    console.log(`Best Exchanger: unavailable (${formatError(error)})`);
  }
}

runCli(main);
