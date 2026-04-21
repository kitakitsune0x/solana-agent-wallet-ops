#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";

import {
  buildSolTransferPlan,
  buildSplTransferPlan,
  executeSolTransfers,
  executeSplTransfers,
  TransferExecutionError,
  type TransferRecipient,
} from "../lib/transfer.js";
import {
  formatAssetAmount,
  formatError,
  formatSol,
  relativeFromCwd,
  renderTable,
} from "../lib/format.js";
import { createRpcConnection, getSplMintMetadata, resolveRpcUrl } from "../lib/rpc.js";
import { loadSourceWalletFromFile, loadWalletSet, type StorageOptions, type WalletSet } from "../lib/storage.js";
import {
  normalizeSetName,
  parseAmountToBaseUnits,
  parseSolAmountToLamports,
  resolveTransferNetwork,
} from "../lib/validation.js";
import { normalizePublicKey, type WalletEntry } from "../lib/wallet.js";

interface Options {
  fromSet?: string;
  toSet?: string;
  from?: string;
  toCsv?: string;
  amount?: string;
  network?: string;
  rpcUrl?: string;
  dryRun?: boolean;
  execute?: boolean;
  mint?: string;
  dbPath?: string;
  allowRepoDb?: boolean;
}

interface SenderContext {
  sender: WalletEntry;
  storedNetwork?: "devnet" | "mainnet-beta";
  description: string;
}

interface RecipientContext {
  recipients: TransferRecipient[];
  storedNetwork?: "devnet" | "mainnet-beta";
  description: string;
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];

    if (inQuotes) {
      if (character === '"') {
        if (content[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += character;
      }

      continue;
    }

    if (character === '"') {
      inQuotes = true;
      continue;
    }

    if (character === ",") {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if (character === "\n") {
      row.push(cell.trim());
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    if (character === "\r") {
      continue;
    }

    cell += character;
  }

  if (inQuotes) {
    throw new Error("Malformed CSV: unmatched quote.");
  }

  row.push(cell.trim());
  if (row.some((value) => value.length > 0)) {
    rows.push(row);
  }

  return rows;
}

async function loadSender(options: Options): Promise<SenderContext> {
  const storageOptions: StorageOptions = {
    dbPath: options.dbPath,
    allowRepoDb: options.allowRepoDb,
  };

  if (options.fromSet) {
    const walletSet = await loadWalletSet(normalizeSetName(options.fromSet), storageOptions);

    if (walletSet.wallets.length === 0) {
      throw new Error(`Wallet set "${walletSet.set_name}" does not contain any wallets.`);
    }

    return {
      sender: walletSet.wallets[0],
      storedNetwork: walletSet.network,
      description: `first wallet in set "${walletSet.set_name}"`,
    };
  }

  if (options.from) {
    const loaded = await loadSourceWalletFromFile(options.from);
    return {
      sender: loaded.wallet,
      storedNetwork: loaded.network,
      description: `wallet file ${relativeFromCwd(loaded.source_path)}`,
    };
  }

  throw new Error("Provide exactly one source: --from-set or --from.");
}

function requireGlobalAmount(
  amount: string | undefined,
  mintDecimals?: number,
): number {
  if (!amount) {
    throw new Error("This transfer mode requires --amount.");
  }

  return mintDecimals === undefined
    ? parseSolAmountToLamports(amount, "amount")
    : parseAmountToBaseUnits(amount, mintDecimals, "amount");
}

async function loadRecipientsFromCsv(
  filePath: string,
  globalAmount: number | undefined,
  mintDecimals?: number,
): Promise<TransferRecipient[]> {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  const raw = await readFile(resolvedPath, "utf8");
  const rows = parseCsv(raw);

  if (rows.length < 2) {
    throw new Error(`Recipient CSV ${relativeFromCwd(resolvedPath)} must contain a header row and at least one data row.`);
  }

  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const publicKeyIndex = headers.indexOf("public_key");
  const labelIndex = headers.indexOf("label");
  const amountIndex = headers.indexOf("amount");

  if (publicKeyIndex === -1) {
    throw new Error(`Recipient CSV ${relativeFromCwd(resolvedPath)} is missing a public_key column.`);
  }

  if (amountIndex !== -1 && globalAmount !== undefined) {
    throw new Error("Recipient CSV already includes an amount column. Omit --amount for per-row amount mode.");
  }

  if (amountIndex === -1 && globalAmount === undefined) {
    throw new Error("Recipient CSV requires either an amount column or a global --amount option.");
  }

  return rows.slice(1).map((row, rowIndex) => {
    const publicKey = normalizePublicKey(row[publicKeyIndex] ?? "", `public_key (row ${rowIndex + 2})`);
    const label = labelIndex === -1 ? undefined : row[labelIndex] || undefined;
    const amountBaseUnits =
      amountIndex === -1
        ? globalAmount!
        : mintDecimals === undefined
          ? parseSolAmountToLamports(row[amountIndex] ?? "", `amount (row ${rowIndex + 2})`)
          : parseAmountToBaseUnits(row[amountIndex] ?? "", mintDecimals, `amount (row ${rowIndex + 2})`);

    return {
      label,
      public_key: publicKey,
      amount_base_units: amountBaseUnits,
    };
  });
}

function printNetworkOverrides(
  selectedNetwork: string,
  senderNetwork: string | undefined,
  recipientNetwork: string | undefined,
): void {
  if (senderNetwork && senderNetwork !== selectedNetwork) {
    console.log(`Source network override: stored ${senderNetwork}, using ${selectedNetwork}`);
  }

  if (recipientNetwork && recipientNetwork !== selectedNetwork) {
    console.log(`Destination network override: stored ${recipientNetwork}, using ${selectedNetwork}`);
  }
}

function printPreviewHeader(
  network: string,
  rpcTarget: string,
  senderDescription: string,
  recipientDescription: string,
  sender: WalletEntry,
  execute: boolean,
): void {
  console.log(`Mode: ${execute ? "execute" : "preview"}`);
  console.log(`Network: ${network}`);
  console.log(`RPC: ${rpcTarget}`);
  console.log(`Sender Source: ${senderDescription}`);
  console.log(`Recipient Source: ${recipientDescription}`);
  console.log(`Sender: ${sender.label} (${sender.public_key})`);
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("bulk-transfer")
    .description("Preview or execute bulk SOL or SPL transfers.")
    .option("--from-set <name>", "Source wallet set; the first wallet is used as sender")
    .option("--to-set <name>", "Destination wallet set")
    .option("--from <path>", "Path to a wallet JSON or single-wallet wallet-set JSON")
    .option("--to-csv <path>", "CSV file with recipients")
    .option("--db-path <path>", "SQLite DB path (default: ~/.solana-agent-wallet-ops/wallets.sqlite)")
    .option("--allow-repo-db", "Allow repo-local SQLite storage for secrets")
    .option("--amount <amount>", "Global transfer amount")
    .option("--network <network>", "Override network: devnet or mainnet-beta")
    .option("--rpc-url <url>", "Custom RPC URL")
    .option("--dry-run", "Print the transfer plan only")
    .option("--execute", "Execute real transfers")
    .option("--mint <address>", "SPL token mint address");

  program.parse(process.argv);
  const options = program.opts<Options>();

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

  const storageOptions: StorageOptions = {
    dbPath: options.dbPath,
    allowRepoDb: options.allowRepoDb,
  };
  const senderContext = await loadSender(options);
  const destinationWalletSet: WalletSet | undefined = options.toSet
    ? await loadWalletSet(normalizeSetName(options.toSet), storageOptions)
    : undefined;
  const network = resolveTransferNetwork(options.network, [
    senderContext.storedNetwork,
    destinationWalletSet?.network,
  ]);
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
        recipients: destinationWalletSet.wallets.map((wallet) => ({
          label: wallet.label,
          public_key: wallet.public_key,
          amount_base_units:
            globalAmount ??
            requireGlobalAmount(options.amount, mintDecimals),
        })),
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
    console.log("Asset: SOL");
    console.log("");
    console.log(`Recipients: ${plan.recipients.length}`);
    console.log(`Transfer Total: ${formatSol(plan.total_transfer_lamports)}`);
    console.log(`Estimated Fee Per Transfer: ${formatSol(plan.per_transfer_fee_lamports)}`);
    console.log(`Estimated Total Fees: ${formatSol(plan.total_fee_lamports)}`);
    console.log(`Estimated Total Required: ${formatSol(plan.total_required_lamports)}`);
    console.log(`Sender Balance: ${formatSol(plan.sender_balance_lamports)}`);
    console.log(`Estimated Remaining: ${formatSol(plan.remaining_lamports)}`);
    console.log("");
    console.log(
      renderTable(
        ["Label", "Public Key", "Amount"],
        plan.recipients.map((recipient) => [
          recipient.label ?? "",
          recipient.public_key,
          formatSol(recipient.amount_base_units),
        ]),
      ),
    );

    if (!plan.sufficient_balance) {
      throw new Error("Sender balance is insufficient for the planned SOL transfers and estimated fees.");
    }

    if (!options.execute) {
      console.log("");
      console.log("Preview complete. Re-run with --execute to submit real transactions.");
      return;
    }

    try {
      const results = await executeSolTransfers(connection, senderContext.sender, plan.recipients);
      console.log("");
      console.log("Executed transfers:");
      console.log(
        renderTable(
          ["Label", "Public Key", "Amount", "Signature"],
          results.map((result) => [
            result.label ?? "",
            result.public_key,
            formatSol(result.amount_base_units),
            result.signature,
          ]),
        ),
      );
      return;
    } catch (error) {
      if (error instanceof TransferExecutionError && error.completed.length > 0) {
        console.log("");
        console.log("Completed before failure:");
        console.log(
          renderTable(
            ["Label", "Public Key", "Amount", "Signature"],
            error.completed.map((result) => [
              result.label ?? "",
              result.public_key,
              formatSol(result.amount_base_units),
              result.signature,
            ]),
          ),
        );
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

  console.log(`Asset: SPL token ${plan.mint_address}`);
  console.log(`Mint Decimals: ${plan.decimals}`);
  console.log(`Sender Token Account: ${plan.sender_token_account}`);
  console.log("");
  console.log(`Recipients: ${plan.recipients.length}`);
  console.log(`Token Transfer Total: ${formatAssetAmount(plan.total_required_token_amount, plan.decimals)}`);
  console.log(`Sender Token Balance: ${formatAssetAmount(plan.sender_token_balance, plan.decimals)}`);
  console.log(`Estimated Remaining Token Balance: ${formatAssetAmount(plan.remaining_token_amount, plan.decimals)}`);
  console.log(`Estimated Fee Per Transfer: ${formatSol(plan.per_transfer_fee_lamports)}`);
  console.log(`Estimated Total Fees: ${formatSol(plan.total_fee_lamports)}`);
  console.log(`ATA Rent Per Missing Recipient: ${formatSol(plan.ata_rent_lamports)}`);
  console.log(`Missing Recipient ATAs: ${plan.missing_recipient_token_accounts}`);
  console.log(`Estimated Total ATA Rent: ${formatSol(plan.total_rent_lamports)}`);
  console.log(`Sender SOL Balance: ${formatSol(plan.sender_sol_balance_lamports)}`);
  console.log(`Estimated Total SOL Required: ${formatSol(plan.total_required_sol_lamports)}`);
  console.log(`Estimated Remaining SOL: ${formatSol(plan.remaining_sol_lamports)}`);
  console.log("");
  console.log(
    renderTable(
      ["Label", "Public Key", "Token ATA", "Amount", "ATA Status"],
      plan.recipients.map((recipient) => [
        recipient.label ?? "",
        recipient.public_key,
        recipient.token_account,
        formatAssetAmount(recipient.amount_base_units, plan.decimals),
        recipient.token_account_missing ? "missing" : "ok",
      ]),
    ),
  );

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
    console.log("");
    console.log("Executed transfers:");
    console.log(
      renderTable(
        ["Label", "Public Key", "Amount", "Signature"],
        results.map((result) => [
          result.label ?? "",
          result.public_key,
          formatAssetAmount(result.amount_base_units, plan.decimals),
          result.signature,
        ]),
      ),
    );
  } catch (error) {
    if (error instanceof TransferExecutionError && error.completed.length > 0) {
      console.log("");
      console.log("Completed before failure:");
      console.log(
        renderTable(
          ["Label", "Public Key", "Amount", "Signature"],
          error.completed.map((result) => [
            result.label ?? "",
            result.public_key,
            formatAssetAmount(result.amount_base_units, plan.decimals),
            result.signature,
          ]),
        ),
      );
    }

    throw error;
  }
}

main().catch((error) => {
  console.error(`Error: ${formatError(error)}`);
  process.exit(1);
});
