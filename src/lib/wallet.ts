import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

export interface WalletEntry {
  label: string;
  public_key: string;
  secret_key_base58: string;
}

export function isWalletEntry(value: unknown): value is WalletEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.label === "string" &&
    typeof record.public_key === "string" &&
    typeof record.secret_key_base58 === "string"
  );
}

export function createWalletEntry(label: string): WalletEntry {
  const keypair = Keypair.generate();

  return walletEntryFromKeypair(keypair, label);
}

export function walletEntryFromKeypair(keypair: Keypair, label: string): WalletEntry {
  return {
    label,
    public_key: keypair.publicKey.toBase58(),
    secret_key_base58: bs58.encode(keypair.secretKey),
  };
}

export function normalizeWalletLabel(value: string, fieldName = "label"): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`Invalid ${fieldName}: value cannot be empty.`);
  }

  return trimmed;
}

export function keypairFromSecret(secretKeyBase58: string): Keypair {
  const decoded = bs58.decode(secretKeyBase58.trim());
  return Keypair.fromSecretKey(decoded);
}

export function normalizePublicKey(value: string, fieldName = "public_key"): string {
  try {
    return new PublicKey(value.trim()).toBase58();
  } catch {
    throw new Error(`Invalid ${fieldName}: ${value}`);
  }
}

export function normalizeWalletEntry(wallet: WalletEntry, fieldName = "wallet"): WalletEntry {
  const label = normalizeWalletLabel(wallet.label, `${fieldName}.label`);
  const publicKey = normalizePublicKey(wallet.public_key, `${fieldName}.public_key`);
  const secretKeyBase58 = wallet.secret_key_base58.trim();

  if (!secretKeyBase58) {
    throw new Error(`Invalid ${fieldName}.secret_key_base58: value cannot be empty.`);
  }

  let keypair: Keypair;

  try {
    keypair = keypairFromSecret(secretKeyBase58);
  } catch {
    throw new Error(`Invalid ${fieldName}.secret_key_base58.`);
  }

  if (keypair.publicKey.toBase58() !== publicKey) {
    throw new Error(`${fieldName} public_key does not match secret_key_base58.`);
  }

  return {
    label,
    public_key: publicKey,
    secret_key_base58: secretKeyBase58,
  };
}
