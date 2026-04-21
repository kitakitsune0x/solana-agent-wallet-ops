import { readFile } from "node:fs/promises";
import path from "node:path";

import { parseCsv } from "../csv.js";
import { relativeFromCwd } from "../format.js";
import { loadSourceWalletFromFile, loadWalletSet, type StorageOptions, type WalletSet } from "../storage.js";
import type { TransferRecipient } from "../transfer.js";
import {
  normalizeSetName,
  parseAmountToBaseUnits,
  parseSolAmountToLamports,
} from "../validation.js";
import { normalizePublicKey } from "../wallet.js";
import type { BulkTransferOptions, SenderContext } from "./types.js";

export async function loadSender(options: BulkTransferOptions): Promise<SenderContext> {
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

export function requireGlobalAmount(amount: string | undefined, mintDecimals?: number): number {
  if (!amount) {
    throw new Error("This transfer mode requires --amount.");
  }

  return mintDecimals === undefined
    ? parseSolAmountToLamports(amount, "amount")
    : parseAmountToBaseUnits(amount, mintDecimals, "amount");
}

export async function loadRecipientsFromCsv(
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

export function buildWalletSetRecipients(walletSet: WalletSet, globalAmount: number): TransferRecipient[] {
  return walletSet.wallets.map((wallet) => ({
    label: wallet.label,
    public_key: wallet.public_key,
    amount_base_units: globalAmount,
  }));
}
