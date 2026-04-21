#!/usr/bin/env node

import path from "node:path";

import { Command } from "commander";

import {
  buildWalletSetRecipients,
  loadRecipientsFromCsv,
  loadSender,
  requireGlobalAmount,
} from "../lib/bulk-transfer/inputs.js";
import {
  printCompletedTransfersBeforeFailure,
  printExecutedTransfers,
  printNetworkOverrides,
  printPreviewHeader,
  printSolPlan,
  printSplPlan,
} from "../lib/bulk-transfer/report.js";
import type { BulkTransferOptions, RecipientContext } from "../lib/bulk-transfer/types.js";
import { addStorageOptions, runCli, toStorageOptions } from "../lib/cli.js";
import { formatAssetAmount, formatSol, relativeFromCwd } from "../lib/format.js";
import { createRpcConnection, getSplMintMetadata, resolveRpcUrl } from "../lib/rpc.js";
import { loadWalletSet, type StorageOptions, type WalletSet } from "../lib/storage.js";
import {
  buildSolTransferPlan,
  buildSplTransferPlan,
  executeSolTransfers,
  executeSplTransfers,
  TransferExecutionError,
} from "../lib/transfer.js";
import { normalizeSetName, parseAmountToBaseUnits, parseSolAmountToLamports, resolveTransferNetwork } from "../lib/validation.js";
import { normalizePublicKey } from "../lib/wallet.js";

async function main(): Promise<void> {
  const program = new Command();
  addStorageOptions(
    program
      .name("bulk-transfer")
      .description("Preview or execute bulk SOL or SPL transfers.")
      .option("--from-set <name>", "Source wallet set; the first wallet is used as sender")
      .option("--to-set <name>", "Destination wallet set")
      .option("--from <path>", "Path to a wallet JSON or single-wallet wallet-set JSON")
      .option("--to-csv <path>", "CSV file with recipients")
      .option("--amount <amount>", "Global transfer amount")
      .option("--network <network>", "Override network: devnet or mainnet-beta")
      .option("--rpc-url <url>", "Custom RPC URL")
      .option("--dry-run", "Print the transfer plan only")
      .option("--execute", "Execute real transfers")
      .option("--mint <address>", "SPL token mint address"),
  );

  program.parse(process.argv);
  const options = program.opts<BulkTransferOptions>();

  if (options.execute && options.dryRun) {
    throw new Error("Choose either --dry-run or --execute, not both.");
  }

  const sourceModeCount = Number(Boolean(options.fromSet)) + Number(Boolean(options.from));
  const destinationModeCount = Number(Boolean(options.toSet)) + Number(Boolean(options.toCsv));

  if (sourceModeCount !== 1) {
    throw new Error("Provide exactly one source: --from-set or --from.");
  }

  if (destinationModeCount !== 1) {
    throw new Error("Provide exactly one destination: --to-set or --to-csv.");
  }

  const storageOptions: StorageOptions = toStorageOptions(options);
  const senderContext = await loadSender(options);
  const destinationWalletSet: WalletSet | undefined = options.toSet
    ? await loadWalletSet(normalizeSetName(options.toSet), storageOptions)
    : undefined;
  const network = resolveTransferNetwork(options.network, [senderContext.storedNetwork, destinationWalletSet?.network]);
  const connection = createRpcConnection(network, options.rpcUrl);
  const rpcTarget = resolveRpcUrl(network, options.rpcUrl);
  const mintAddress = options.mint ? normalizePublicKey(options.mint, "mint") : undefined;

  let globalAmount: number | undefined;
  let mintDecimals: number | undefined;
  let mintMetadata:
    | {
        mintAddress: string;
        decimals: number;
      }
    | undefined;

  if (mintAddress) {
    mintMetadata = await getSplMintMetadata(connection, mintAddress);
    mintDecimals = mintMetadata.decimals;
    globalAmount = options.amount ? parseAmountToBaseUnits(options.amount, mintMetadata.decimals, "amount") : undefined;
  } else if (options.amount) {
    globalAmount = parseSolAmountToLamports(options.amount, "amount");
  }

  const recipientContext: RecipientContext = destinationWalletSet
    ? {
        recipients: buildWalletSetRecipients(
          destinationWalletSet,
          globalAmount ?? requireGlobalAmount(options.amount, mintDecimals),
        ),
        storedNetwork: destinationWalletSet.network,
        description: `wallet set "${destinationWalletSet.set_name}"`,
      }
    : {
        description: `recipient CSV ${relativeFromCwd(path.resolve(process.cwd(), options.toCsv!))}`,
        recipients: await loadRecipientsFromCsv(options.toCsv!, globalAmount, mintDecimals),
      };

  printPreviewHeader(
    network,
    rpcTarget,
    senderContext.description,
    recipientContext.description,
    senderContext.sender,
    Boolean(options.execute),
  );
  printNetworkOverrides(network, senderContext.storedNetwork, recipientContext.storedNetwork);

  if (!mintAddress) {
    const plan = await buildSolTransferPlan(connection, network, senderContext.sender, recipientContext.recipients);
    printSolPlan(plan);

    if (!plan.sufficient_balance) {
      throw new Error("Sender balance is insufficient for the planned SOL transfers, estimated fees, and rent reserve.");
    }

    if (!options.execute) {
      console.log("");
      console.log("Preview complete. Re-run with --execute to submit real transactions.");
      return;
    }

    try {
      const results = await executeSolTransfers(connection, senderContext.sender, plan.recipients);
      printExecutedTransfers(results, formatSol);
      return;
    } catch (error) {
      if (error instanceof TransferExecutionError) {
        printCompletedTransfersBeforeFailure(error, formatSol);
      }

      throw error;
    }
  }

  const plan = await buildSplTransferPlan(
    connection,
    network,
    senderContext.sender,
    recipientContext.recipients,
    mintMetadata!.mintAddress,
    mintMetadata!.decimals,
  );

  printSplPlan(plan);

  if (!plan.sufficient_token_balance) {
    throw new Error("Sender token balance is insufficient for the planned SPL transfers.");
  }

  if (!plan.sufficient_sol_balance) {
    throw new Error("Sender SOL balance is insufficient for the planned SPL fees and ATA rent.");
  }

  if (!options.execute) {
    console.log("");
    console.log("Preview complete. Re-run with --execute to submit real transactions.");
    return;
  }

  try {
    const results = await executeSplTransfers(
      connection,
      senderContext.sender,
      plan.recipients,
      plan.mint_address,
      plan.decimals,
    );
    printExecutedTransfers(results, (amountBaseUnits) => formatAssetAmount(amountBaseUnits, plan.decimals));
  } catch (error) {
    if (error instanceof TransferExecutionError) {
      printCompletedTransfersBeforeFailure(error, (amountBaseUnits) => formatAssetAmount(amountBaseUnits, plan.decimals));
    }

    throw error;
  }
}

runCli(main);
