import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  getConfiguredDbPath,
  loadSourceWalletFromFile,
  loadWalletSet,
  listWalletSetSummaries,
  saveWalletSet,
  type WalletSet,
} from "../src/lib/storage.ts";
import { createWalletEntry } from "../src/lib/wallet.ts";

function createSampleWalletSet(setName: string, count: number): WalletSet {
  return {
    set_name: setName,
    created_at: "2026-04-21T12:00:00.000Z",
    network: "devnet",
    wallets: Array.from({ length: count }, (_, index) => createWalletEntry(`${setName}-${index + 1}`)),
  };
}

test("getConfiguredDbPath rejects repo-local paths by default", () => {
  assert.throws(
    () => getConfiguredDbPath({ dbPath: "./data/wallets.sqlite" }),
    /Refusing repo-local wallet database/,
  );
});

test("getConfiguredDbPath allows repo-local paths with an explicit override", () => {
  const dbPath = getConfiguredDbPath({
    dbPath: "./data/wallets.sqlite",
    allowRepoDb: true,
  });

  assert.equal(dbPath, path.resolve(process.cwd(), "data/wallets.sqlite"));
});

test("SQLite storage saves, lists, and loads wallet sets", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "sawo-storage-"));

  try {
    const dbPath = path.join(tempRoot, "wallets.sqlite");
    const alpha = createSampleWalletSet("alpha", 2);
    const beta = createSampleWalletSet("beta", 1);

    const savedDbPath = await saveWalletSet(beta, { dbPath });
    await saveWalletSet(alpha, { dbPath });

    assert.equal(savedDbPath, dbPath);

    const summaries = await listWalletSetSummaries({ dbPath });
    assert.deepEqual(
      summaries.map((summary) => ({
        set_name: summary.set_name,
        wallet_count: summary.wallet_count,
      })),
      [
        { set_name: "alpha", wallet_count: 2 },
        { set_name: "beta", wallet_count: 1 },
      ],
    );

    const loaded = await loadWalletSet(" alpha ", { dbPath });
    assert.equal(loaded.set_name, "alpha");
    assert.equal(loaded.network, "devnet");
    assert.equal(loaded.wallets.length, 2);
    assert.deepEqual(
      loaded.wallets.map((wallet) => wallet.label),
      ["alpha-1", "alpha-2"],
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("SQLite storage rejects duplicate wallet set names", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "sawo-storage-"));

  try {
    const dbPath = path.join(tempRoot, "wallets.sqlite");
    const walletSet = createSampleWalletSet("duplicate", 1);

    await saveWalletSet(walletSet, { dbPath });

    await assert.rejects(
      () => saveWalletSet(walletSet, { dbPath }),
      /already exists/,
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("loadSourceWalletFromFile accepts a standalone wallet entry JSON object", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "sawo-source-"));

  try {
    const wallet = createWalletEntry("single-wallet");
    const filePath = path.join(tempRoot, "wallet.json");
    await writeFile(filePath, `${JSON.stringify(wallet, null, 2)}\n`, "utf8");

    const loaded = await loadSourceWalletFromFile(filePath);

    assert.deepEqual(loaded.wallet, wallet);
    assert.equal(loaded.network, undefined);
    assert.equal(loaded.source_path, filePath);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("loadSourceWalletFromFile accepts a single-wallet wallet-set JSON file", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "sawo-source-"));

  try {
    const walletSet = createSampleWalletSet("single-set", 1);
    const filePath = path.join(tempRoot, "wallet-set.json");
    await writeFile(filePath, `${JSON.stringify(walletSet, null, 2)}\n`, "utf8");

    const loaded = await loadSourceWalletFromFile(filePath);

    assert.deepEqual(loaded.wallet, walletSet.wallets[0]);
    assert.equal(loaded.network, "devnet");
    assert.equal(loaded.source_path, filePath);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("loadSourceWalletFromFile rejects multi-wallet wallet-set JSON files", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "sawo-source-"));

  try {
    const walletSet = createSampleWalletSet("multi-set", 2);
    const filePath = path.join(tempRoot, "wallet-set.json");
    await writeFile(filePath, `${JSON.stringify(walletSet, null, 2)}\n`, "utf8");

    await assert.rejects(
      () => loadSourceWalletFromFile(filePath),
      /contains 2 wallets/,
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
