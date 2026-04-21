import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";

import { normalizeSetName, type ClusterNetwork } from "./validation.js";
import { isWalletEntry, type WalletEntry } from "./wallet.js";

export interface WalletSet {
  set_name: string;
  created_at: string;
  network: ClusterNetwork;
  wallets: WalletEntry[];
}

export interface WalletSetSummary {
  set_name: string;
  created_at: string;
  network: ClusterNetwork;
  wallet_count: number;
}

export interface LoadedSourceWallet {
  wallet: WalletEntry;
  network?: ClusterNetwork;
  source_path: string;
}

export interface StorageOptions {
  dbPath?: string;
  allowRepoDb?: boolean;
}

interface WalletSetRow {
  id: number;
  set_name: string;
  created_at: string;
  network: ClusterNetwork;
}

interface WalletRow {
  wallet_index: number;
  label: string;
  public_key: string;
  secret_key_base58: string;
}

const DEFAULT_DB_BASENAME = "wallets.sqlite";
type SqliteDatabase = InstanceType<typeof Database>;

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

function expandHomePath(filePath: string): string {
  if (filePath === "~") {
    return homedir();
  }

  if (filePath.startsWith(`~${path.sep}`)) {
    return path.join(homedir(), filePath.slice(2));
  }

  return filePath;
}

function envFlagEnabled(value: string | undefined): boolean {
  return /^(1|true|yes)$/i.test((value ?? "").trim());
}

function isRepoLocalPath(filePath: string): boolean {
  const relative = path.relative(process.cwd(), filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function getDefaultDbPath(): string {
  return path.join(homedir(), ".solana-agent-wallet-ops", DEFAULT_DB_BASENAME);
}

export function getConfiguredDbPath(options: StorageOptions = {}): string {
  const rawPath = options.dbPath?.trim() || process.env.SAWO_DB_PATH?.trim() || getDefaultDbPath();
  const resolvedPath = path.resolve(expandHomePath(rawPath));
  const allowRepoDb = options.allowRepoDb ?? envFlagEnabled(process.env.SAWO_ALLOW_REPO_DB);

  if (isRepoLocalPath(resolvedPath) && !allowRepoDb) {
    throw new Error(
      `Refusing repo-local wallet database at ${resolvedPath}. Use --allow-repo-db or SAWO_ALLOW_REPO_DB=1 to override intentionally.`,
    );
  }

  return resolvedPath;
}

function initializeSchema(db: SqliteDatabase): void {
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS wallet_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      set_name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      network TEXT NOT NULL CHECK (network IN ('devnet', 'mainnet-beta'))
    );

    CREATE TABLE IF NOT EXISTS wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      set_id INTEGER NOT NULL REFERENCES wallet_sets(id) ON DELETE CASCADE,
      wallet_index INTEGER NOT NULL,
      label TEXT NOT NULL,
      public_key TEXT NOT NULL,
      secret_key_base58 TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (set_id, wallet_index),
      UNIQUE (set_id, label),
      UNIQUE (set_id, public_key)
    );

    CREATE INDEX IF NOT EXISTS idx_wallet_sets_name ON wallet_sets(set_name);
    CREATE INDEX IF NOT EXISTS idx_wallets_set_id ON wallets(set_id);
    CREATE INDEX IF NOT EXISTS idx_wallets_public_key ON wallets(public_key);
    CREATE INDEX IF NOT EXISTS idx_wallets_label ON wallets(label);
  `);
}

function withDatabase<T>(options: StorageOptions | undefined, callback: (db: SqliteDatabase, dbPath: string) => T): T {
  const dbPath = getConfiguredDbPath(options);
  mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  initializeSchema(db);

  try {
    return callback(db, dbPath);
  } finally {
    db.close();
  }
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

function buildWalletSet(row: WalletSetRow, walletRows: WalletRow[]): WalletSet {
  return {
    set_name: row.set_name,
    created_at: row.created_at,
    network: row.network,
    wallets: walletRows.map((wallet) => ({
      label: wallet.label,
      public_key: wallet.public_key,
      secret_key_base58: wallet.secret_key_base58,
    })),
  };
}

export async function saveWalletSet(walletSet: WalletSet, options?: StorageOptions): Promise<string> {
  return withDatabase(options, (db, dbPath) => {
    const existing = db
      .prepare("SELECT 1 AS present FROM wallet_sets WHERE set_name = ?")
      .get(walletSet.set_name) as { present: number } | undefined;

    if (existing) {
      throw new Error(`Wallet set "${walletSet.set_name}" already exists in ${dbPath}`);
    }

    const insertWalletSet = db.prepare(`
      INSERT INTO wallet_sets (set_name, created_at, network)
      VALUES (?, ?, ?)
    `);
    const insertWallet = db.prepare(`
      INSERT INTO wallets (set_id, wallet_index, label, public_key, secret_key_base58, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction((input: WalletSet) => {
      const walletSetResult = insertWalletSet.run(input.set_name, input.created_at, input.network);
      const setId = Number(walletSetResult.lastInsertRowid);

      input.wallets.forEach((wallet, index) => {
        insertWallet.run(
          setId,
          index,
          wallet.label,
          wallet.public_key,
          wallet.secret_key_base58,
          input.created_at,
        );
      });
    });

    transaction(walletSet);
    return dbPath;
  });
}

export async function loadWalletSet(setName: string, options?: StorageOptions): Promise<WalletSet> {
  return withDatabase(options, (db, dbPath) => {
    const normalizedSetName = normalizeSetName(setName);
    const walletSetRow = db
      .prepare(`
        SELECT id, set_name, created_at, network
        FROM wallet_sets
        WHERE set_name = ?
      `)
      .get(normalizedSetName) as WalletSetRow | undefined;

    if (!walletSetRow) {
      throw new Error(`Wallet set "${normalizedSetName}" was not found in ${dbPath}`);
    }

    const walletRows = db
      .prepare(`
        SELECT wallet_index, label, public_key, secret_key_base58
        FROM wallets
        WHERE set_id = ?
        ORDER BY wallet_index ASC
      `)
      .all(walletSetRow.id) as WalletRow[];

    return buildWalletSet(walletSetRow, walletRows);
  });
}

export async function listWalletSetSummaries(options?: StorageOptions): Promise<WalletSetSummary[]> {
  return withDatabase(options, (db) => {
    const rows = db
      .prepare(`
        SELECT
          ws.set_name,
          ws.created_at,
          ws.network,
          COUNT(w.id) AS wallet_count
        FROM wallet_sets ws
        LEFT JOIN wallets w ON w.set_id = ws.id
        GROUP BY ws.id, ws.set_name, ws.created_at, ws.network
        ORDER BY ws.set_name ASC
      `)
      .all() as Array<{
        set_name: string;
        created_at: string;
        network: ClusterNetwork;
        wallet_count: number | bigint;
      }>;

    return rows.map((row) => ({
      set_name: row.set_name,
      created_at: row.created_at,
      network: row.network,
      wallet_count: Number(row.wallet_count),
    }));
  });
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
