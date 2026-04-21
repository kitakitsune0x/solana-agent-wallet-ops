export const VALID_NETWORKS = ["devnet", "mainnet-beta"] as const;

export type ClusterNetwork = (typeof VALID_NETWORKS)[number];

export function ensureNetwork(value: string, fieldName = "network"): ClusterNetwork {
  if (VALID_NETWORKS.includes(value as ClusterNetwork)) {
    return value as ClusterNetwork;
  }

  throw new Error(`Invalid ${fieldName}: ${value}. Expected one of: ${VALID_NETWORKS.join(", ")}`);
}

export function maybeNetwork(value?: string): ClusterNetwork | undefined {
  if (!value) {
    return undefined;
  }

  return ensureNetwork(value);
}

export function normalizeSetName(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("Wallet set name cannot be empty.");
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(trimmed)) {
    throw new Error("Wallet set name may only contain letters, numbers, hyphens, and underscores.");
  }

  return trimmed;
}

export function parsePositiveInteger(value: string, fieldName: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }

  return parsed;
}

export function parseAmountToBaseUnits(value: string, decimals: number, fieldName: string): number {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error(`Invalid decimals for ${fieldName}: ${decimals}`);
  }

  const trimmed = value.trim();

  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid ${fieldName}: ${value}`);
  }

  const [wholePart, fractionalPart = ""] = trimmed.split(".");

  if (fractionalPart.length > decimals) {
    throw new Error(`${fieldName} supports at most ${decimals} decimal places.`);
  }

  const scale = 10n ** BigInt(decimals);
  const whole = BigInt(wholePart) * scale;
  const fractionText = decimals === 0 ? "" : fractionalPart.padEnd(decimals, "0");
  const fraction = fractionText ? BigInt(fractionText) : 0n;
  const result = whole + fraction;

  if (result <= 0n) {
    throw new Error(`${fieldName} must be greater than zero.`);
  }

  if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${fieldName} is too large to handle safely.`);
  }

  return Number(result);
}

export function parseSolAmountToLamports(value: string, fieldName: string): number {
  return parseAmountToBaseUnits(value, 9, fieldName);
}

export function resolveTransferNetwork(
  cliNetwork: string | undefined,
  storedNetworks: Array<ClusterNetwork | undefined>,
): ClusterNetwork {
  const explicit = maybeNetwork(cliNetwork);

  if (explicit) {
    return explicit;
  }

  const knownNetworks = Array.from(new Set(storedNetworks.filter((value): value is ClusterNetwork => Boolean(value))));

  if (knownNetworks.length === 1) {
    return knownNetworks[0];
  }

  if (knownNetworks.length > 1) {
    throw new Error("Source and destination use different stored networks. Pass --network to override explicitly.");
  }

  throw new Error("Network could not be derived from the source or destination. Pass --network explicitly.");
}
