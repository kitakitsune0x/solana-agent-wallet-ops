import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMinimumBalanceForRentExemptAccount,
  unpackAccount,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

import { formatError } from "./format.js";
import { DEFAULT_COMMITMENT, estimateSolTransferFeeLamports, estimateSplTransferFeeLamports } from "./rpc.js";
import type { ClusterNetwork } from "./validation.js";
import { keypairFromSecret, type WalletEntry } from "./wallet.js";

export interface TransferRecipient {
  label?: string;
  public_key: string;
  amount_base_units: number;
}

export interface SolTransferPlan {
  kind: "sol";
  network: ClusterNetwork;
  sender: WalletEntry;
  recipients: TransferRecipient[];
  sender_balance_lamports: number;
  sender_rent_exempt_minimum_lamports: number;
  per_transfer_fee_lamports: number;
  total_transfer_lamports: number;
  total_fee_lamports: number;
  total_required_lamports: number;
  total_required_with_reserve_lamports: number;
  remaining_lamports: number;
  sufficient_balance: boolean;
}

export interface SplTransferRecipientPlan extends TransferRecipient {
  token_account: string;
  token_account_missing: boolean;
}

export interface SplTransferPlan {
  kind: "spl";
  network: ClusterNetwork;
  mint_address: string;
  decimals: number;
  sender: WalletEntry;
  sender_token_account: string;
  recipients: SplTransferRecipientPlan[];
  sender_token_balance: bigint;
  sender_sol_balance_lamports: number;
  per_transfer_fee_lamports: number;
  total_fee_lamports: number;
  ata_rent_lamports: number;
  total_rent_lamports: number;
  total_required_token_amount: number;
  total_required_sol_lamports: number;
  remaining_token_amount: bigint;
  remaining_sol_lamports: number;
  missing_recipient_token_accounts: number;
  sufficient_token_balance: boolean;
  sufficient_sol_balance: boolean;
}

export interface ExecutedTransfer {
  label?: string;
  public_key: string;
  amount_base_units: number;
  signature: string;
}

export class TransferExecutionError extends Error {
  completed: ExecutedTransfer[];
  failedRecipient: TransferRecipient;

  constructor(message: string, completed: ExecutedTransfer[], failedRecipient: TransferRecipient) {
    super(message);
    this.name = "TransferExecutionError";
    this.completed = completed;
    this.failedRecipient = failedRecipient;
  }
}

function validateRecipients(senderPublicKey: string, recipients: TransferRecipient[]): void {
  if (recipients.length === 0) {
    throw new Error("Transfer plan has no recipients.");
  }

  const seen = new Set<string>();

  for (const recipient of recipients) {
    if (recipient.public_key === senderPublicKey) {
      throw new Error("Sender cannot also be a recipient.");
    }

    if (recipient.amount_base_units <= 0) {
      throw new Error(`Recipient ${recipient.public_key} has a non-positive transfer amount.`);
    }

    if (seen.has(recipient.public_key)) {
      throw new Error(`Duplicate recipient detected: ${recipient.public_key}`);
    }

    seen.add(recipient.public_key);
  }
}

export async function buildSolTransferPlan(
  connection: Connection,
  network: ClusterNetwork,
  sender: WalletEntry,
  recipients: TransferRecipient[],
): Promise<SolTransferPlan> {
  validateRecipients(sender.public_key, recipients);

  const senderPublicKey = new PublicKey(sender.public_key);
  const sampleRecipient = new PublicKey(recipients[0].public_key);
  const senderBalanceLamports = await connection.getBalance(senderPublicKey, DEFAULT_COMMITMENT);
  const senderRentExemptMinimumLamports = await connection.getMinimumBalanceForRentExemption(
    0,
    DEFAULT_COMMITMENT,
  );
  const perTransferFeeLamports = await estimateSolTransferFeeLamports(connection, senderPublicKey, sampleRecipient);
  const totalTransferLamports = recipients.reduce((sum, recipient) => sum + recipient.amount_base_units, 0);
  const totalFeeLamports = perTransferFeeLamports * recipients.length;
  const totalRequiredLamports = totalTransferLamports + totalFeeLamports;
  const totalRequiredWithReserveLamports = totalRequiredLamports + senderRentExemptMinimumLamports;
  const remainingLamports = senderBalanceLamports - totalRequiredLamports;

  return {
    kind: "sol",
    network,
    sender,
    recipients,
    sender_balance_lamports: senderBalanceLamports,
    sender_rent_exempt_minimum_lamports: senderRentExemptMinimumLamports,
    per_transfer_fee_lamports: perTransferFeeLamports,
    total_transfer_lamports: totalTransferLamports,
    total_fee_lamports: totalFeeLamports,
    total_required_lamports: totalRequiredLamports,
    total_required_with_reserve_lamports: totalRequiredWithReserveLamports,
    remaining_lamports: remainingLamports,
    sufficient_balance: senderBalanceLamports >= totalRequiredWithReserveLamports,
  };
}

export async function buildSplTransferPlan(
  connection: Connection,
  network: ClusterNetwork,
  sender: WalletEntry,
  recipients: TransferRecipient[],
  mintAddress: string,
  decimals: number,
): Promise<SplTransferPlan> {
  validateRecipients(sender.public_key, recipients);

  const senderPublicKey = new PublicKey(sender.public_key);
  const mintPublicKey = new PublicKey(mintAddress);
  const senderTokenAccount = getAssociatedTokenAddressSync(mintPublicKey, senderPublicKey);
  const recipientPublicKeys = recipients.map((recipient) => new PublicKey(recipient.public_key));
  const recipientTokenAccounts = recipientPublicKeys.map((recipientPublicKey) =>
    getAssociatedTokenAddressSync(mintPublicKey, recipientPublicKey),
  );

  const accountInfos = await connection.getMultipleAccountsInfo(
    [senderTokenAccount, ...recipientTokenAccounts],
    DEFAULT_COMMITMENT,
  );

  const senderTokenInfo = accountInfos[0];
  const senderTokenBalance = senderTokenInfo ? unpackAccount(senderTokenAccount, senderTokenInfo).amount : 0n;
  const recipientPlans: SplTransferRecipientPlan[] = recipients.map((recipient, index) => ({
    ...recipient,
    token_account: recipientTokenAccounts[index].toBase58(),
    token_account_missing: !accountInfos[index + 1],
  }));
  const missingRecipientTokenAccounts = recipientPlans.filter((recipient) => recipient.token_account_missing).length;
  const senderSolBalanceLamports = await connection.getBalance(senderPublicKey, DEFAULT_COMMITMENT);
  const perTransferFeeLamports = await estimateSplTransferFeeLamports(
    connection,
    senderPublicKey,
    recipientPublicKeys[0],
    mintPublicKey,
    decimals,
  );
  const ataRentLamports = missingRecipientTokenAccounts > 0 ? await getMinimumBalanceForRentExemptAccount(connection) : 0;
  const totalRequiredTokenAmount = recipientPlans.reduce((sum, recipient) => sum + recipient.amount_base_units, 0);
  const totalFeeLamports = perTransferFeeLamports * recipientPlans.length;
  const totalRentLamports = ataRentLamports * missingRecipientTokenAccounts;
  const totalRequiredSolLamports = totalFeeLamports + totalRentLamports;
  const remainingTokenAmount = senderTokenBalance - BigInt(totalRequiredTokenAmount);
  const remainingSolLamports = senderSolBalanceLamports - totalRequiredSolLamports;

  return {
    kind: "spl",
    network,
    mint_address: mintAddress,
    decimals,
    sender,
    sender_token_account: senderTokenAccount.toBase58(),
    recipients: recipientPlans,
    sender_token_balance: senderTokenBalance,
    sender_sol_balance_lamports: senderSolBalanceLamports,
    per_transfer_fee_lamports: perTransferFeeLamports,
    total_fee_lamports: totalFeeLamports,
    ata_rent_lamports: ataRentLamports,
    total_rent_lamports: totalRentLamports,
    total_required_token_amount: totalRequiredTokenAmount,
    total_required_sol_lamports: totalRequiredSolLamports,
    remaining_token_amount: remainingTokenAmount,
    remaining_sol_lamports: remainingSolLamports,
    missing_recipient_token_accounts: missingRecipientTokenAccounts,
    sufficient_token_balance: senderTokenBalance >= BigInt(totalRequiredTokenAmount),
    sufficient_sol_balance: senderSolBalanceLamports >= totalRequiredSolLamports,
  };
}

export async function executeSolTransfers(
  connection: Connection,
  sender: WalletEntry,
  recipients: TransferRecipient[],
): Promise<ExecutedTransfer[]> {
  const senderKeypair = keypairFromSecret(sender.secret_key_base58);

  if (senderKeypair.publicKey.toBase58() !== sender.public_key) {
    throw new Error("Sender secret key does not match the stored public key.");
  }

  const completed: ExecutedTransfer[] = [];

  for (const recipient of recipients) {
    try {
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: senderKeypair.publicKey,
          toPubkey: new PublicKey(recipient.public_key),
          lamports: recipient.amount_base_units,
        }),
      );

      const signature = await sendAndConfirmTransaction(connection, transaction, [senderKeypair], {
        commitment: DEFAULT_COMMITMENT,
        preflightCommitment: DEFAULT_COMMITMENT,
      });

      completed.push({
        label: recipient.label,
        public_key: recipient.public_key,
        amount_base_units: recipient.amount_base_units,
        signature,
      });
    } catch (error) {
      throw new TransferExecutionError(
        `SOL transfer failed for ${recipient.public_key}: ${formatError(error)}`,
        completed,
        recipient,
      );
    }
  }

  return completed;
}

export async function executeSplTransfers(
  connection: Connection,
  sender: WalletEntry,
  recipients: TransferRecipient[],
  mintAddress: string,
  decimals: number,
): Promise<ExecutedTransfer[]> {
  const senderKeypair = keypairFromSecret(sender.secret_key_base58);

  if (senderKeypair.publicKey.toBase58() !== sender.public_key) {
    throw new Error("Sender secret key does not match the stored public key.");
  }

  const mintPublicKey = new PublicKey(mintAddress);
  const senderTokenAccount = getAssociatedTokenAddressSync(mintPublicKey, senderKeypair.publicKey);
  const senderTokenInfo = await connection.getAccountInfo(senderTokenAccount, DEFAULT_COMMITMENT);

  if (!senderTokenInfo) {
    throw new Error(`Sender associated token account does not exist for mint ${mintAddress}.`);
  }

  const completed: ExecutedTransfer[] = [];

  for (const recipient of recipients) {
    try {
      const recipientPublicKey = new PublicKey(recipient.public_key);
      const recipientTokenAccount = getAssociatedTokenAddressSync(mintPublicKey, recipientPublicKey);
      const transaction = new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(
          senderKeypair.publicKey,
          recipientTokenAccount,
          recipientPublicKey,
          mintPublicKey,
        ),
        createTransferCheckedInstruction(
          senderTokenAccount,
          mintPublicKey,
          recipientTokenAccount,
          senderKeypair.publicKey,
          recipient.amount_base_units,
          decimals,
        ),
      );

      const signature = await sendAndConfirmTransaction(connection, transaction, [senderKeypair], {
        commitment: DEFAULT_COMMITMENT,
        preflightCommitment: DEFAULT_COMMITMENT,
      });

      completed.push({
        label: recipient.label,
        public_key: recipient.public_key,
        amount_base_units: recipient.amount_base_units,
        signature,
      });
    } catch (error) {
      throw new TransferExecutionError(
        `SPL transfer failed for ${recipient.public_key}: ${formatError(error)}`,
        completed,
        recipient,
      );
    }
  }

  return completed;
}
