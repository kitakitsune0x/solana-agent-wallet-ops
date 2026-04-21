#!/usr/bin/env node

import { Command } from "commander";

import { addStorageOptions, runCli, toStorageOptions } from "../lib/cli.js";
import { relativeFromCwd, renderTable } from "../lib/format.js";
import { loadWalletSet, type StorageOptions } from "../lib/storage.js";
import {
  buildEvenSplitNowWalletDistributions,
  chooseBestSplitNowRate,
  loadSplitNowRecipientsFromCsv,
  resolveSplitNowApiKey,
  SplitNowClient,
  type SplitNowRecipient,
  type SplitNowWalletDistribution,
} from "../lib/splitnow.js";

interface Options extends StorageOptions {
  quoteId: string;
  toSet?: string;
  toCsv?: string;
  exchanger?: string;
  execute?: boolean;
  apiKey?: string;
  apiUrl?: string;
}

async function loadRecipients(options: Options): Promise<{
  recipients: SplitNowRecipient[];
  description: string;
}> {
  const storageOptions: StorageOptions = toStorageOptions(options);

  if (Boolean(options.toSet) === Boolean(options.toCsv)) {
    throw new Error("Provide exactly one SplitNOW recipient source: --to-set or --to-csv.");
  }

  if (options.toSet) {
    const walletSet = await loadWalletSet(options.toSet, storageOptions);
    return {
      recipients: walletSet.wallets.map((wallet) => ({
        label: wallet.label,
        public_key: wallet.public_key,
      })),
      description: `wallet set "${walletSet.set_name}"`,
    };
  }

  const recipients = await loadSplitNowRecipientsFromCsv(options.toCsv!);
  return {
    recipients,
    description: `CSV ${relativeFromCwd(options.toCsv!)}`,
  };
}

function resolveSelectedExchanger(
  exchangerOption: string | undefined,
  quote: Awaited<ReturnType<SplitNowClient["getQuote"]>>,
): string {
  if (!exchangerOption || exchangerOption === "best") {
    return chooseBestSplitNowRate(
      quote.quoteLegs.map((quoteLeg) => ({
        exchangeId: quoteLeg.quoteLegOutput.toExchangerId,
        exchangeRate: Number(quoteLeg.quoteLegOutput.toAmount),
      })),
    ).exchangeId;
  }

  const matchingRate = quote.quoteLegs.find(
    (quoteLeg) => quoteLeg.quoteLegOutput.toExchangerId === exchangerOption,
  );

  if (!matchingRate) {
    throw new Error(`SplitNOW quote ${quote._id} does not include exchanger ${exchangerOption}.`);
  }

  if (Number(matchingRate.quoteLegOutput.toAmount) <= 0) {
    throw new Error(`SplitNOW quote ${quote._id} reports exchanger ${exchangerOption} as unavailable.`);
  }

  return exchangerOption;
}

function renderDistributionTable(distributions: SplitNowWalletDistribution[], recipients: SplitNowRecipient[]): string {
  return renderTable(
    ["Label", "Public Key", "Share", "Exchanger"],
    distributions.map((distribution, index) => [
      recipients[index]?.label ?? "-",
      distribution.toAddress,
      `${(distribution.toPctBips / 100).toFixed(2)}%`,
      distribution.toExchangerId,
    ]),
  );
}

async function main(): Promise<void> {
  const program = new Command();

  addStorageOptions(
    program
      .name("splitnow-order")
      .description("Preview or create a SplitNOW multi-wallet order from a quote.")
      .requiredOption("--quote-id <id>", "SplitNOW quote id")
      .option("--to-set <name>", "Destination Solana wallet set")
      .option("--to-csv <path>", "Destination CSV with public_key and optional label columns")
      .option("--exchanger <id>", "Use a specific exchanger id, or 'best'", "best")
      .option("--execute", "Create the real SplitNOW order")
      .option("--api-key <key>", "SplitNOW API key (prefer SPLITNOW_API_KEY)")
      .option("--api-url <url>", "Override SplitNOW API URL"),
  );

  program.parse(process.argv);
  const options = program.opts<Options>();
  const client = new SplitNowClient({
    apiKey: resolveSplitNowApiKey(options.apiKey),
    apiUrl: options.apiUrl,
  });
  const { recipients, description } = await loadRecipients(options);
  const quote = await client.getQuote({ quoteId: options.quoteId });
  const selectedExchanger = resolveSelectedExchanger(options.exchanger, quote);
  const distributions = buildEvenSplitNowWalletDistributions(recipients, {
    toAssetId: "sol",
    toNetworkId: "solana",
    toExchangerId: selectedExchanger,
  });

  console.log(`Mode: ${options.execute ? "execute" : "preview"}`);
  console.log(`Quote ID: ${options.quoteId}`);
  console.log(
    `Route: ${quote.quoteInput.fromAmount} ${quote.quoteInput.fromAssetId} on ${quote.quoteInput.fromNetworkId} -> sol on solana`,
  );
  console.log(`Recipient Source: ${description}`);
  console.log(`Recipients: ${recipients.length}`);
  console.log(`Selected Exchanger: ${selectedExchanger}`);
  console.log("");
  console.log(renderDistributionTable(distributions, recipients));

  if (!options.execute) {
    console.log("");
    console.log("No SplitNOW order was created. Pass --execute to create one.");
    return;
  }

  const order = await client.createAndFetchOrder({
    quoteId: options.quoteId,
    fromAmount: quote.quoteInput.fromAmount,
    fromAssetId: quote.quoteInput.fromAssetId,
    fromNetworkId: quote.quoteInput.fromNetworkId,
    walletDistributions: distributions,
  });

  console.log("");
  console.log(`Order ID: ${order.orderId}`);
  console.log(`Deposit Address: ${order.depositAddress}`);
  console.log(`Deposit Amount: ${order.depositAmount}`);
}

runCli(main);
