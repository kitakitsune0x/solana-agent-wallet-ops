import { readFile } from "node:fs/promises";
import path from "node:path";

import { relativeFromCwd } from "./format.js";
import { normalizePublicKey } from "./wallet.js";

export const DEFAULT_SPLITNOW_API_URL = "https://splitnow.io/api";
const DEFAULT_POLL_DELAY_MS = 1_000;
const MAX_SPLITNOW_RECIPIENTS = 100;

export interface SplitNowRate {
  exchangeId: string;
  exchangeRate: number;
}

export interface SplitNowQuoteData {
  quoteId: string;
  rates: SplitNowRate[];
}

export interface SplitNowQuoteLeg {
  status: string;
  type: string;
  quoteId: string;
  quoteLegInput: {
    fromAmount: number;
    fromAssetId: string;
    fromNetworkId: string;
  };
  quoteLegOutput: {
    toPctBips: number;
    toAmount: number;
    toAssetId: string;
    toNetworkId: string;
    toExchangerId: string;
  };
}

export interface SplitNowQuote {
  _id: string;
  status: string;
  type: string;
  userId: string | null;
  apiKeyId: string | null;
  quoteInput: {
    fromAmount: number;
    fromAssetId: string;
    fromNetworkId: string;
  };
  quoteLegs: SplitNowQuoteLeg[];
}

export interface SplitNowWalletDistribution {
  toAddress: string;
  toPctBips: number;
  toAssetId: string;
  toNetworkId: string;
  toExchangerId: string;
}

export interface SplitNowOrderData {
  orderId: string;
  depositAddress: string;
  depositAmount: number;
}

export interface SplitNowOrderStatusData {
  orderId: string;
  orderStatus: string;
  orderStatusShort: string;
  orderStatusText: string;
}

export interface SplitNowExchanger {
  id: string;
  name: string;
  website: string;
  category: string;
  status: {
    show: boolean;
    quotes: boolean;
    orders: boolean;
  };
  isAvailable: boolean;
}

export interface SplitNowAssetDepositLimit {
  assetId: string;
  minDeposit: number;
  maxDeposit: number | null;
}

export interface SplitNowRecipient {
  label?: string;
  public_key: string;
}

interface SplitNowOrder {
  _id: string;
  shortId: string;
  status: string;
  statusShort: string;
  statusText: string;
  quoteId: string | null;
  orderInput: {
    fromAmount: number;
    fromAssetId: string;
    fromNetworkId: string;
  };
  depositWalletAddress: string;
  depositAmount: number;
}

interface SplitNowSuccessEnvelope<T> {
  success: boolean;
  error?: string;
  data: T;
}

interface SplitNowAssetsResponse {
  assets: Array<{
    id: string;
    assetId: string;
    networkId: string;
    symbol: string;
    displayName: string;
  }>;
}

interface SplitNowExchangersResponse {
  exchangers: SplitNowExchanger[];
}

interface SplitNowLimitsResponse {
  limits: SplitNowAssetDepositLimit[];
}

interface SplitNowCreateOrderResponse {
  shortId: string;
}

interface SplitNowCreateQuoteRequest {
  fromAmount: number;
  fromAssetId: string;
  fromNetworkId: string;
  toAssetId: string;
  toNetworkId: string;
}

interface SplitNowClientOptions {
  apiKey: string;
  apiUrl?: string;
  fetchImpl?: typeof fetch;
  pollDelayMs?: number;
}

export function resolveSplitNowApiKey(explicitApiKey?: string): string {
  const apiKey = explicitApiKey?.trim() || process.env.SPLITNOW_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("SplitNOW API key is missing. Pass --api-key or set SPLITNOW_API_KEY.");
  }

  return apiKey;
}

export function chooseBestSplitNowRate(rates: SplitNowRate[]): SplitNowRate {
  const supportedRates = rates.filter((rate) => rate.exchangeRate > 0);

  if (supportedRates.length === 0) {
    throw new Error("No supported SplitNOW quote rates were returned for this route.");
  }

  return supportedRates.reduce((best, current) =>
    current.exchangeRate > best.exchangeRate ? current : best,
  );
}

export function buildEvenSplitNowWalletDistributions(
  recipients: SplitNowRecipient[],
  {
    toAssetId,
    toNetworkId,
    toExchangerId,
  }: {
    toAssetId: string;
    toNetworkId: string;
    toExchangerId: string;
  },
): SplitNowWalletDistribution[] {
  if (recipients.length === 0) {
    throw new Error("SplitNOW orders require at least one recipient.");
  }

  if (recipients.length > MAX_SPLITNOW_RECIPIENTS) {
    throw new Error(`SplitNOW supports at most ${MAX_SPLITNOW_RECIPIENTS} recipients per order.`);
  }

  const seen = new Set<string>();
  const normalizedRecipients = recipients.map((recipient, index) => {
    const publicKey = normalizePublicKey(recipient.public_key, `public_key (recipient ${index + 1})`);

    if (seen.has(publicKey)) {
      throw new Error(`Duplicate SplitNOW recipient detected: ${publicKey}`);
    }

    seen.add(publicKey);
    return {
      ...recipient,
      public_key: publicKey,
    };
  });

  const baseBips = Math.floor(10_000 / normalizedRecipients.length);
  const remainder = 10_000 % normalizedRecipients.length;

  return normalizedRecipients.map((recipient, index) => ({
    toAddress: recipient.public_key,
    toPctBips: baseBips + (index < remainder ? 1 : 0),
    toAssetId,
    toNetworkId,
    toExchangerId,
  }));
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];

    if (inQuotes) {
      if (character === '"') {
        if (content[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += character;
      }

      continue;
    }

    if (character === '"') {
      inQuotes = true;
      continue;
    }

    if (character === ",") {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if (character === "\n") {
      row.push(cell.trim());
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    if (character === "\r") {
      continue;
    }

    cell += character;
  }

  if (inQuotes) {
    throw new Error("Malformed CSV: unmatched quote.");
  }

  row.push(cell.trim());
  if (row.some((value) => value.length > 0)) {
    rows.push(row);
  }

  return rows;
}

export async function loadSplitNowRecipientsFromCsv(filePath: string): Promise<SplitNowRecipient[]> {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  const raw = await readFile(resolvedPath, "utf8");
  const rows = parseCsv(raw);

  if (rows.length < 2) {
    throw new Error(
      `SplitNOW recipient CSV ${relativeFromCwd(resolvedPath)} must contain a header row and at least one data row.`,
    );
  }

  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const publicKeyIndex = headers.indexOf("public_key");
  const labelIndex = headers.indexOf("label");

  if (publicKeyIndex === -1) {
    throw new Error(`SplitNOW recipient CSV ${relativeFromCwd(resolvedPath)} is missing a public_key column.`);
  }

  return rows.slice(1).map((row, rowIndex) => ({
    label: labelIndex === -1 ? undefined : row[labelIndex] || undefined,
    public_key: normalizePublicKey(row[publicKeyIndex] ?? "", `public_key (row ${rowIndex + 2})`),
  }));
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class SplitNowClient {
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly pollDelayMs: number;

  constructor({
    apiKey,
    apiUrl = DEFAULT_SPLITNOW_API_URL,
    fetchImpl = globalThis.fetch,
    pollDelayMs = DEFAULT_POLL_DELAY_MS,
  }: SplitNowClientOptions) {
    const normalizedApiKey = apiKey.trim();

    if (!normalizedApiKey) {
      throw new Error("Invalid or missing SplitNOW API key.");
    }

    if (typeof fetchImpl !== "function") {
      throw new Error("Fetch is unavailable in this runtime. Provide a fetch implementation explicitly.");
    }

    this.apiKey = normalizedApiKey;
    this.apiUrl = apiUrl;
    this.fetchImpl = fetchImpl;
    this.pollDelayMs = pollDelayMs;
  }

  async getHealth(): Promise<boolean> {
    const health = await this.get<string>("/health/", "text");
    return health.toString() === "OK";
  }

  async getAssets(): Promise<SplitNowAssetsResponse["assets"]> {
    const assets = await this.get<SplitNowAssetsResponse>("/assets/");
    return assets.assets;
  }

  async getExchangers(): Promise<SplitNowExchanger[]> {
    const exchangers = await this.get<SplitNowExchangersResponse>("/exchangers/");
    return exchangers.exchangers;
  }

  async getAssetDepositLimits(): Promise<SplitNowAssetDepositLimit[]> {
    const limits = await this.get<SplitNowLimitsResponse>("/assets/limits/");
    return limits.limits;
  }

  async createAndFetchQuote({
    fromAmount,
    fromAssetId,
    fromNetworkId,
    toAssetId,
    toNetworkId,
  }: SplitNowCreateQuoteRequest): Promise<SplitNowQuoteData> {
    const quoteId = await this.post<string>("/quotes/", {
      type: "floating_rate",
      quoteInput: {
        fromAmount,
        fromAssetId,
        fromNetworkId,
      },
      quoteOutputs: [
        {
          toPctBips: 10_000,
          toAssetId,
          toNetworkId,
        },
      ],
    });

    await delay(this.pollDelayMs);
    const quote = await this.getQuote({ quoteId });

    return {
      quoteId,
      rates: quote.quoteLegs.map((quoteLeg) => ({
        exchangeId: quoteLeg.quoteLegOutput.toExchangerId,
        exchangeRate: Number(quoteLeg.quoteLegOutput.toAmount),
      })),
    };
  }

  async createAndFetchOrder({
    quoteId,
    fromAmount,
    fromAssetId,
    fromNetworkId,
    walletDistributions,
  }: {
    quoteId: string;
    fromAmount: number;
    fromAssetId: string;
    fromNetworkId: string;
    walletDistributions: SplitNowWalletDistribution[];
  }): Promise<SplitNowOrderData> {
    const limits = await this.getAssetDepositLimits();
    const matchingLimit = limits.find((limit) => limit.assetId === fromAssetId);

    if (!matchingLimit) {
      throw new Error(`SplitNOW did not return deposit limits for asset ${fromAssetId}.`);
    }

    const minAmount = matchingLimit.minDeposit * walletDistributions.length;

    if (minAmount > fromAmount) {
      throw new Error(
        `Failed to create order: minimum deposit is ${minAmount} ${fromAssetId.toUpperCase()} (${matchingLimit.minDeposit} * ${walletDistributions.length} wallets).`,
      );
    }

    const createdOrder = await this.post<SplitNowCreateOrderResponse>("/orders/", {
      type: "floating_rate",
      quoteId: quoteId || null,
      orderInput: {
        fromAmount,
        fromAssetId,
        fromNetworkId,
      },
      orderOutputs: walletDistributions,
    });

    await delay(this.pollDelayMs);
    const order = await this.getOrder({ orderId: createdOrder.shortId });

    return {
      orderId: order.shortId,
      depositAddress: order.depositWalletAddress,
      depositAmount: order.orderInput.fromAmount,
    };
  }

  async getQuote({ quoteId }: { quoteId: string }): Promise<SplitNowQuote> {
    return this.get<SplitNowQuote>(`/quotes/${quoteId}`);
  }

  async getOrder({ orderId }: { orderId: string }): Promise<SplitNowOrder> {
    return this.get<SplitNowOrder>(`/orders/${orderId}`);
  }

  async getOrderStatus({ orderId }: { orderId: string }): Promise<SplitNowOrderStatusData> {
    const order = await this.getOrder({ orderId });
    return {
      orderId,
      orderStatus: order.status,
      orderStatusShort: order.statusShort,
      orderStatusText: order.statusText,
    };
  }

  private async get<T>(endpoint: string, responseType: "json" | "text" = "json"): Promise<T> {
    const response = await this.fetchImpl(`${this.apiUrl}${endpoint}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`SplitNOW request failed with HTTP ${response.status}.`);
    }

    const payload = (responseType === "json" ? await response.json() : await response.text()) as
      | T
      | SplitNowSuccessEnvelope<T>;

    if (!endpoint.startsWith("/quotes/") && !endpoint.startsWith("/orders/")) {
      return payload as T;
    }

    const wrappedPayload = payload as SplitNowSuccessEnvelope<T>;

    if (!wrappedPayload.success) {
      throw new Error(`SplitNOW request failed: "${wrappedPayload.error ?? "unknown error"}"`);
    }

    return wrappedPayload.data;
  }

  private async post<T>(endpoint: string, body: object): Promise<T> {
    const response = await this.fetchImpl(`${this.apiUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`SplitNOW request failed with HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as T | SplitNowSuccessEnvelope<T>;

    if (!endpoint.startsWith("/quotes/") && !endpoint.startsWith("/orders/")) {
      return payload as T;
    }

    const wrappedPayload = payload as SplitNowSuccessEnvelope<T>;

    if (!wrappedPayload.success) {
      throw new Error(`SplitNOW request failed: "${wrappedPayload.error ?? "unknown error"}"`);
    }

    return wrappedPayload.data;
  }
}
