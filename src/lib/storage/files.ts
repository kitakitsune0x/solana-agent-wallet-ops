import { readFile } from "node:fs/promises";
import path from "node:path";

import { normalizeSetName, type ClusterNetwork } from "../validation.js";
import { isWalletEntry, normalizeWalletEntry, type WalletEntry } from "../wallet.js";
import type { LoadedSourceWallet, WalletSet, WalletSetImportOptions } from "./types.js";

function isWalletSet(value: unknown): value is WalletSet {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.set_name === "string" &&
    typeof record.created_at === "string" &&
    (record.network === "devnet" || record.network === "mainnet-beta") &&
    Array.isArray(record.wallets) &&
    record.wallets.every((wallet) => isWalletEntry(wallet))
  );
}

function isWalletEntryArray(value: unknown): value is WalletEntry[] {
  return Array.isArray(value) && value.every((entry) => isWalletEntry(entry));
}

function normalizeImportedWallets(wallets: WalletEntry[]): WalletEntry[] {
  if (wallets.length === 0) {
    throw new Error("Imported wallet set must contain at least one wallet.");
  }

  const seenLabels = new Set<string>();
  const seenPublicKeys = new Set<string>();

  return wallets.map((wallet, index) => {
    const normalized = normalizeWalletEntry(wallet, `wallet ${index + 1}`);

    if (seenLabels.has(normalized.label)) {
      throw new Error(`Imported wallet labels must be unique. Duplicate label: ${normalized.label}`);
    }

    if (seenPublicKeys.has(normalized.public_key)) {
      throw new Error(`Imported wallet public keys must be unique. Duplicate public key: ${normalized.public_key}`);
    }

    seenLabels.add(normalized.label);
    seenPublicKeys.add(normalized.public_key);
    return normalized;
  });
}

async function readJsonFile(filePath: string): Promise<unknown> {
  let raw: string;

  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read JSON file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function loadSourceWalletFromFile(filePath: string): Promise<LoadedSourceWallet> {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  const payload = await readJsonFile(resolvedPath);

  if (isWalletEntry(payload)) {
    return {
      wallet: normalizeWalletEntry(payload),
      source_path: resolvedPath,
    };
  }

  if (isWalletSet(payload)) {
    if (payload.wallets.length !== 1) {
      throw new Error(
        `Wallet set file ${resolvedPath} contains ${payload.wallets.length} wallets. Use --from-set for multi-wallet sources.`,
      );
    }

    return {
      wallet: normalizeWalletEntry(payload.wallets[0]),
      network: payload.network,
      source_path: resolvedPath,
    };
  }

  throw new Error(
    `Source file ${resolvedPath} must be either a wallet entry JSON object or a wallet-set JSON file with exactly one wallet.`,
  );
}

export async function loadWalletSetFromFile(
  filePath: string,
  { setName, network }: WalletSetImportOptions = {},
): Promise<WalletSet> {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  const payload = await readJsonFile(resolvedPath);
  const normalizedSetName = setName ? normalizeSetName(setName) : undefined;

  if (isWalletSet(payload)) {
    return {
      set_name: normalizedSetName ?? normalizeSetName(payload.set_name),
      created_at: payload.created_at,
      network: network ?? payload.network,
      wallets: normalizeImportedWallets(payload.wallets),
    };
  }

  if (isWalletEntry(payload) || isWalletEntryArray(payload)) {
    if (!normalizedSetName || !network) {
      throw new Error(
        `Wallet import file ${resolvedPath} requires both --set and --network when importing standalone wallet JSON or wallet arrays.`,
      );
    }

    const wallets = isWalletEntry(payload) ? [payload] : payload;

    return {
      set_name: normalizedSetName,
      created_at: new Date().toISOString(),
      network,
      wallets: normalizeImportedWallets(wallets),
    };
  }

  throw new Error(
    `Wallet import file ${resolvedPath} must be either a wallet entry JSON object, a wallet-set JSON file, or a JSON array of wallet entries.`,
  );
}
