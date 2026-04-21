import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildEvenSplitNowWalletDistributions,
  chooseBestSplitNowRate,
  loadSplitNowRecipientsFromCsv,
  resolveSplitNowApiKey,
  SplitNowClient,
} from "../src/lib/splitnow.ts";

test("resolveSplitNowApiKey prefers explicit values and rejects missing keys", () => {
  assert.equal(resolveSplitNowApiKey("splitnow-test-key"), "splitnow-test-key");
  assert.throws(() => resolveSplitNowApiKey(), /SplitNOW API key is missing/);
});

test("buildEvenSplitNowWalletDistributions splits evenly and validates duplicates", () => {
  const distributions = buildEvenSplitNowWalletDistributions(
    [
      { label: "a", public_key: "11111111111111111111111111111111" },
      { label: "b", public_key: "Vote111111111111111111111111111111111111111" },
      { label: "c", public_key: "Sysvar1111111111111111111111111111111111111" },
    ],
    {
      toAssetId: "sol",
      toNetworkId: "solana",
      toExchangerId: "binance",
    },
  );

  assert.deepEqual(
    distributions.map((distribution) => distribution.toPctBips),
    [3334, 3333, 3333],
  );

  assert.throws(
    () =>
      buildEvenSplitNowWalletDistributions(
        [
          { public_key: "11111111111111111111111111111111" },
          { public_key: "11111111111111111111111111111111" },
        ],
        {
          toAssetId: "sol",
          toNetworkId: "solana",
          toExchangerId: "binance",
        },
      ),
    /Duplicate SplitNOW recipient detected/,
  );
});

test("chooseBestSplitNowRate picks the highest supported rate", () => {
  assert.deepEqual(
    chooseBestSplitNowRate([
      { exchangeId: "a", exchangeRate: 0 },
      { exchangeId: "b", exchangeRate: 9.8 },
      { exchangeId: "c", exchangeRate: 10.1 },
    ]),
    { exchangeId: "c", exchangeRate: 10.1 },
  );

  assert.throws(
    () => chooseBestSplitNowRate([{ exchangeId: "a", exchangeRate: 0 }]),
    /No supported SplitNOW quote rates/,
  );
});

test("loadSplitNowRecipientsFromCsv reads label/public_key rows", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "sawo-splitnow-"));

  try {
    const filePath = path.join(tempRoot, "recipients.csv");
    await writeFile(
      filePath,
      [
        "label,public_key",
        "alpha,11111111111111111111111111111111",
        "beta,Vote111111111111111111111111111111111111111",
      ].join("\n"),
      "utf8",
    );

    const recipients = await loadSplitNowRecipientsFromCsv(filePath);

    assert.deepEqual(recipients, [
      { label: "alpha", public_key: "11111111111111111111111111111111" },
      { label: "beta", public_key: "Vote111111111111111111111111111111111111111" },
    ]);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("SplitNowClient createAndFetchQuote sends x-api-key requests and maps rates", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });

    if (calls.length === 1) {
      return new Response(
        JSON.stringify({
          success: true,
          data: "QUOTE123",
        }),
        { status: 200 },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          _id: "quote-db-id",
          status: "ok",
          type: "floating_rate",
          userId: null,
          apiKeyId: null,
          quoteInput: {
            fromAmount: 10,
            fromAssetId: "sol",
            fromNetworkId: "solana",
          },
          quoteLegs: [
            {
              status: "ok",
              type: "floating_rate",
              quoteId: "QUOTE123",
              quoteLegInput: {
                fromAmount: 10,
                fromAssetId: "sol",
                fromNetworkId: "solana",
              },
              quoteLegOutput: {
                toPctBips: 10000,
                toAmount: 9.9,
                toAssetId: "sol",
                toNetworkId: "solana",
                toExchangerId: "binance",
              },
            },
          ],
        },
      }),
      { status: 200 },
    );
  };
  const client = new SplitNowClient({
    apiKey: "splitnow-test-key",
    apiUrl: "https://splitnow.example/api",
    fetchImpl,
    pollDelayMs: 0,
  });

  const quote = await client.createAndFetchQuote({
    fromAmount: 10,
    fromAssetId: "sol",
    fromNetworkId: "solana",
    toAssetId: "sol",
    toNetworkId: "solana",
  });

  assert.equal(quote.quoteId, "QUOTE123");
  assert.deepEqual(quote.rates, [{ exchangeId: "binance", exchangeRate: 9.9 }]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://splitnow.example/api/quotes/");
  assert.equal(calls[1].url, "https://splitnow.example/api/quotes/QUOTE123");
  assert.equal(calls[0].init?.headers instanceof Headers, false);
  assert.deepEqual(calls[0].init?.headers, {
    "Content-Type": "application/json",
    "x-api-key": "splitnow-test-key",
  });
});
