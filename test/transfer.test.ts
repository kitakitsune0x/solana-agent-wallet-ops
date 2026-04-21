import assert from "node:assert/strict";
import test from "node:test";

import type { Connection } from "@solana/web3.js";

import { buildSolTransferPlan } from "../src/lib/transfer.ts";

test("buildSolTransferPlan reserves the sender rent-exempt minimum", async () => {
  const connection = {
    async getBalance() {
      return 246_352_806;
    },
    async getMinimumBalanceForRentExemption() {
      return 890_880;
    },
    async getLatestBlockhash() {
      return { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 1 };
    },
    async getFeeForMessage() {
      return { context: { slot: 1 }, value: 5_000 };
    },
  } as unknown as Connection;

  const plan = await buildSolTransferPlan(
    connection,
    "mainnet-beta",
    {
      label: "sender",
      public_key: "534sCj5kpxBPYmCDfgZz38gW7PMUBQPvqSfiHyBLCZ7k",
      secret_key_base58: "unused-in-plan",
    },
    [
      {
        label: "dest-1",
        public_key: "BYfoX68TLSoCV8eZe4jpKad9HVhgTM7JGsLfjF8G6eZ1",
        amount_base_units: 123_161_395,
      },
      {
        label: "dest-2",
        public_key: "4YQQDQg8eVjpiPzKWjAphqZsLeVZwZy7qszVvKLXiw6W",
        amount_base_units: 123_161_395,
      },
    ],
  );

  assert.equal(plan.sender_rent_exempt_minimum_lamports, 890_880);
  assert.equal(plan.total_required_lamports, 246_332_790);
  assert.equal(plan.total_required_with_reserve_lamports, 247_223_670);
  assert.equal(plan.remaining_lamports, 20_016);
  assert.equal(plan.sufficient_balance, false);
});
