import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  unpackAccount,
} from "@solana/spl-token";
import {
  clusterApiUrl,
  Connection,
  PublicKey,
  SystemProgram,
  TransactionMessage,
} from "@solana/web3.js";

import type { ClusterNetwork } from "./validation.js";

export const DEFAULT_COMMITMENT = "confirmed";
const FALLBACK_FEE_LAMPORTS = 5_000;

export interface SolBalanceResult {
  publicKey: string;
  lamports?: number;
  error?: string;
}

export interface SplAssociatedBalanceResult {
  ownerPublicKey: string;
  tokenAccount: string;
  amount: bigint;
  accountFound: boolean;
  error?: string;
}

export interface SplMintMetadata {
  mintAddress: string;
  decimals: number;
}

export function resolveRpcUrl(network: ClusterNetwork, rpcUrl?: string): string {
  return rpcUrl ?? clusterApiUrl(network);
}

export function createRpcConnection(network: ClusterNetwork, rpcUrl?: string): Connection {
  return new Connection(resolveRpcUrl(network, rpcUrl), DEFAULT_COMMITMENT);
}

export async function getSolBalances(connection: Connection, publicKeys: PublicKey[]): Promise<SolBalanceResult[]> {
  const settled = await Promise.allSettled(
    publicKeys.map(async (publicKey) => ({
      publicKey: publicKey.toBase58(),
      lamports: await connection.getBalance(publicKey, DEFAULT_COMMITMENT),
    })),
  );

  return settled.map((result, index) => {
    const publicKey = publicKeys[index].toBase58();

    if (result.status === "fulfilled") {
      return result.value;
    }

    return {
      publicKey,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    };
  });
}

export async function getSplMintMetadata(connection: Connection, mintAddress: string): Promise<SplMintMetadata> {
  const mintInfo = await getMint(connection, new PublicKey(mintAddress));

  return {
    mintAddress,
    decimals: mintInfo.decimals,
  };
}

export async function getSplAssociatedBalances(
  connection: Connection,
  owners: PublicKey[],
  mintAddress: string,
): Promise<SplAssociatedBalanceResult[]> {
  const mintPublicKey = new PublicKey(mintAddress);

  const settled = await Promise.allSettled(
    owners.map(async (owner) => {
      const tokenAccount = getAssociatedTokenAddressSync(mintPublicKey, owner);
      const accountInfo = await connection.getAccountInfo(tokenAccount, DEFAULT_COMMITMENT);

      if (!accountInfo) {
        return {
          ownerPublicKey: owner.toBase58(),
          tokenAccount: tokenAccount.toBase58(),
          amount: 0n,
          accountFound: false,
        };
      }

      const unpacked = unpackAccount(tokenAccount, accountInfo);

      return {
        ownerPublicKey: owner.toBase58(),
        tokenAccount: tokenAccount.toBase58(),
        amount: unpacked.amount,
        accountFound: true,
      };
    }),
  );

  return settled.map((result, index) => {
    const ownerPublicKey = owners[index].toBase58();
    const tokenAccount = getAssociatedTokenAddressSync(mintPublicKey, owners[index]).toBase58();

    if (result.status === "fulfilled") {
      return result.value;
    }

    return {
      ownerPublicKey,
      tokenAccount,
      amount: 0n,
      accountFound: false,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    };
  });
}

export async function estimateSolTransferFeeLamports(
  connection: Connection,
  fromPublicKey: PublicKey,
  toPublicKey: PublicKey,
): Promise<number> {
  const { blockhash } = await connection.getLatestBlockhash(DEFAULT_COMMITMENT);
  const message = new TransactionMessage({
    payerKey: fromPublicKey,
    recentBlockhash: blockhash,
    instructions: [
      SystemProgram.transfer({
        fromPubkey: fromPublicKey,
        toPubkey: toPublicKey,
        lamports: 1,
      }),
    ],
  }).compileToLegacyMessage();

  const fee = await connection.getFeeForMessage(message, DEFAULT_COMMITMENT);
  return fee.value ?? FALLBACK_FEE_LAMPORTS;
}

export async function estimateSplTransferFeeLamports(
  connection: Connection,
  fromPublicKey: PublicKey,
  toPublicKey: PublicKey,
  mintPublicKey: PublicKey,
  decimals: number,
): Promise<number> {
  const senderTokenAccount = getAssociatedTokenAddressSync(mintPublicKey, fromPublicKey);
  const recipientTokenAccount = getAssociatedTokenAddressSync(mintPublicKey, toPublicKey);
  const { blockhash } = await connection.getLatestBlockhash(DEFAULT_COMMITMENT);
  const message = new TransactionMessage({
    payerKey: fromPublicKey,
    recentBlockhash: blockhash,
    instructions: [
      createAssociatedTokenAccountIdempotentInstruction(
        fromPublicKey,
        recipientTokenAccount,
        toPublicKey,
        mintPublicKey,
      ),
      createTransferCheckedInstruction(
        senderTokenAccount,
        mintPublicKey,
        recipientTokenAccount,
        fromPublicKey,
        1,
        decimals,
      ),
    ],
  }).compileToLegacyMessage();

  const fee = await connection.getFeeForMessage(message, DEFAULT_COMMITMENT);
  return fee.value ?? FALLBACK_FEE_LAMPORTS;
}
