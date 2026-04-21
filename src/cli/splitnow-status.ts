#!/usr/bin/env node

import { Command } from "commander";

import { runCli } from "../lib/cli.js";
import { resolveSplitNowApiKey, SplitNowClient } from "../lib/splitnow.js";

interface Options {
  orderId: string;
  apiKey?: string;
  apiUrl?: string;
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("splitnow-status")
    .description("Fetch the latest SplitNOW order status.")
    .requiredOption("--order-id <id>", "SplitNOW order id")
    .option("--api-key <key>", "SplitNOW API key (prefer SPLITNOW_API_KEY)")
    .option("--api-url <url>", "Override SplitNOW API URL");

  program.parse(process.argv);
  const options = program.opts<Options>();
  const client = new SplitNowClient({
    apiKey: resolveSplitNowApiKey(options.apiKey),
    apiUrl: options.apiUrl,
  });
  const status = await client.getOrderStatus({ orderId: options.orderId });

  console.log(`Order ID: ${status.orderId}`);
  console.log(`Status: ${status.orderStatus}`);
  console.log(`Status Short: ${status.orderStatusShort}`);
  console.log(`Status Text: ${status.orderStatusText}`);
}

runCli(main);
