import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { normalizeSetName, type ClusterNetwork } from "./validation.js";
import { isWalletEntry, type WalletEntry } from "./wallet.js";

export interface WalletSet {
  set_name: string;
  created_at: string;
  network: ClusterNetwork;
  wallets: WalletEntry[];
}

export interface LoadedSourceWallet {
  wallet: WalletEntry;
  network?: ClusterNetwork;
  source_path: string;
}

const WALLET_SET_DIR = path.resolve(process.cwd(), "data", "wallet-sets");

export function getWalletSetDir(): string {
  return WALLET_SET_DIR;
}

export function getWalletSetPath(setName: string): string {
  return path.join(WALLET_SET_DIR, `${normalizeSetName(setName)}.json`);
}

export async function ensureWalletSetDir(): Promise<void> {
  await mkdir(WALLET_SET_DIR, { recursive: true });
}

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

export async function saveWalletSet(walletSet: WalletSet): Promise<string> {
  await ensureWalletSetDir();

  const filePath = getWalletSetPath(walletSet.set_name);

  try {
    await access(filePath);
    throw new Error(`Wallet set "${walletSet.set_name}" already exists at ${filePath}`);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code !== "ENOENT") {
      throw error;
    }
  }

  await writeFile(filePath, `${JSON.stringify(walletSet, null, 2)}\n`, "utf8");
  return filePath;
}

export async function loadWalletSet(setName: string): Promise<WalletSet> {
  const filePath = getWalletSetPath(setName);
  const payload = await readJsonFile(filePath);

  if (!isWalletSet(payload)) {
    throw new Error(`Wallet set file is invalid: ${filePath}`);
  }

  return payload;
}

export async function listWalletSets(): Promise<WalletSet[]> {
  await ensureWalletSetDir();

  const entries = await readdir(WALLET_SET_DIR);
  const files = entries.filter((entry) => entry.endsWith(".json")).sort();
  const walletSets: WalletSet[] = [];

  for (const file of files) {
    const fullPath = path.join(WALLET_SET_DIR, file);
    const payload = await readJsonFile(fullPath);

    if (!isWalletSet(payload)) {
      throw new Error(`Wallet set file is invalid: ${fullPath}`);
    }

    walletSets.push(payload);
  }

  return walletSets.sort((left, right) => left.set_name.localeCompare(right.set_name));
}

export async function loadSourceWalletFromFile(filePath: string): Promise<LoadedSourceWallet> {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  const payload = await readJsonFile(resolvedPath);

  if (isWalletEntry(payload)) {
    return {
      wallet: payload,
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
      wallet: payload.wallets[0],
      network: payload.network,
      source_path: resolvedPath,
    };
  }

  throw new Error(
    `Source file ${resolvedPath} must be either a wallet entry JSON object or a wallet-set JSON file with exactly one wallet.`,
  );
}
