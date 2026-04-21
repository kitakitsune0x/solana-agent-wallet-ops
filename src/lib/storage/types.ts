import type { ClusterNetwork } from "../validation.js";
import type { WalletEntry } from "../wallet.js";

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

export interface WalletSetImportOptions {
  setName?: string;
  network?: ClusterNetwork;
}

export interface WalletSetRow {
  id: number;
  set_name: string;
  created_at: string;
  network: ClusterNetwork;
}

export interface WalletRow {
  wallet_index: number;
  label: string;
  public_key: string;
  secret_key_base58: string;
}
