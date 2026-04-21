import { mkdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import type { ClusterNetwork } from "../validation.js";
import { normalizeSetName } from "../validation.js";
import { getConfiguredDbPath } from "./paths.js";
import type { StorageOptions, WalletRow, WalletSet, WalletSetRow, WalletSetSummary } from "./types.js";

type SqliteDatabase = InstanceType<typeof Database>;

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
