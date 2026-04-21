import type { ClusterNetwork } from "../validation.js";
import type { StorageOptions } from "../storage.js";
import type { TransferRecipient } from "../transfer.js";
import type { WalletEntry } from "../wallet.js";

export interface BulkTransferOptions extends StorageOptions {
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
}

export interface SenderContext {
  sender: WalletEntry;
  storedNetwork?: ClusterNetwork;
  description: string;
}

export interface RecipientContext {
  recipients: TransferRecipient[];
  storedNetwork?: ClusterNetwork;
  description: string;
}
