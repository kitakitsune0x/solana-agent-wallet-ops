import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  escapeCsvValue,
  formatBaseUnits,
  formatSol,
  relativeFromCwd,
  renderTable,
} from "../src/lib/format.ts";
import { resolveRpcUrl } from "../src/lib/rpc.ts";
import {
  createWalletEntry,
  keypairFromSecret,
  normalizePublicKey,
  walletEntryFromKeypair,
} from "../src/lib/wallet.ts";

test("wallet helpers round-trip secret keys and normalize public keys", () => {
  const wallet = createWalletEntry("treasury");
  const keypair = keypairFromSecret(wallet.secret_key_base58);
  const rebuilt = walletEntryFromKeypair(keypair, wallet.label);

  assert.equal(keypair.publicKey.toBase58(), wallet.public_key);
  assert.deepEqual(rebuilt, wallet);
  assert.equal(normalizePublicKey(` ${wallet.public_key} `), wallet.public_key);
  assert.throws(() => normalizePublicKey("not-a-pubkey"), /Invalid public_key/);
});

test("format helpers render amounts, tables, CSV values, and paths correctly", () => {
  assert.equal(formatBaseUnits(1_500_000_000, 9), "1.5");
  assert.equal(formatBaseUnits(-25, 1), "-2.5");
  assert.equal(formatSol(1_000_000_000), "1 SOL");
  assert.equal(escapeCsvValue('hello,"world"'), '"hello,""world"""');

  assert.equal(
    renderTable(
      ["Label", "Value"],
      [
        ["alpha", "1"],
        ["beta", "200"],
      ],
    ),
    ["Label  Value", "-----  -----", "alpha  1", "beta   200"].join("\n"),
  );

  assert.equal(relativeFromCwd(path.join(process.cwd(), "exports/test.csv")), "exports/test.csv");
  assert.equal(relativeFromCwd(path.join(path.sep, "tmp", "wallets.sqlite")), path.join(path.sep, "tmp", "wallets.sqlite"));
});

test("resolveRpcUrl uses cluster defaults unless a custom URL is provided", () => {
  assert.equal(resolveRpcUrl("devnet"), "https://api.devnet.solana.com");
  assert.equal(resolveRpcUrl("mainnet-beta", "https://helius.example/rpc"), "https://helius.example/rpc");
});
