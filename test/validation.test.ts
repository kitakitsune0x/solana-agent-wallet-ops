import assert from "node:assert/strict";
import test from "node:test";

import {
  ensureNetwork,
  normalizeSetName,
  parseAmountToBaseUnits,
  parsePositiveInteger,
  parsePositiveNumber,
  parseSolAmountToLamports,
  resolveTransferNetwork,
} from "../src/lib/validation.ts";

test("ensureNetwork accepts supported cluster names", () => {
  assert.equal(ensureNetwork("devnet"), "devnet");
  assert.equal(ensureNetwork("mainnet-beta"), "mainnet-beta");
});

test("ensureNetwork rejects unsupported cluster names", () => {
  assert.throws(
    () => ensureNetwork("testnet"),
    /Invalid network: testnet/,
  );
});

test("normalizeSetName trims valid names and rejects invalid ones", () => {
  assert.equal(normalizeSetName("  treasury_set-01 "), "treasury_set-01");
  assert.throws(() => normalizeSetName(""), /cannot be empty/);
  assert.throws(() => normalizeSetName("bad name"), /may only contain letters, numbers, hyphens, and underscores/);
});

test("parsePositiveInteger only accepts positive integers", () => {
  assert.equal(parsePositiveInteger("25", "count"), 25);
  assert.throws(() => parsePositiveInteger("0", "count"), /count must be a positive integer/);
  assert.throws(() => parsePositiveInteger("-4", "count"), /count must be a positive integer/);
});

test("parsePositiveNumber only accepts positive floats", () => {
  assert.equal(parsePositiveNumber("2.5", "fromAmount"), 2.5);
  assert.throws(() => parsePositiveNumber("0", "fromAmount"), /fromAmount must be a positive number/);
  assert.throws(() => parsePositiveNumber("abc", "fromAmount"), /fromAmount must be a positive number/);
});

test("parseAmountToBaseUnits handles decimals safely", () => {
  assert.equal(parseAmountToBaseUnits("1.25", 2, "amount"), 125);
  assert.equal(parseAmountToBaseUnits("42", 0, "amount"), 42);
  assert.equal(parseSolAmountToLamports("0.000000001", "amount"), 1);
  assert.throws(() => parseAmountToBaseUnits("1.234", 2, "amount"), /supports at most 2 decimal places/);
  assert.throws(() => parseAmountToBaseUnits("0", 9, "amount"), /must be greater than zero/);
});

test("resolveTransferNetwork prefers CLI override and validates stored networks", () => {
  assert.equal(resolveTransferNetwork("mainnet-beta", ["devnet", "devnet"]), "mainnet-beta");
  assert.equal(resolveTransferNetwork(undefined, ["devnet", "devnet"]), "devnet");
  assert.throws(
    () => resolveTransferNetwork(undefined, ["devnet", "mainnet-beta"]),
    /different stored networks/,
  );
  assert.throws(
    () => resolveTransferNetwork(undefined, [undefined, undefined]),
    /could not be derived/,
  );
});
