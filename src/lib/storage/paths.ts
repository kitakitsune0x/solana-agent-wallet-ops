import { homedir } from "node:os";
import path from "node:path";

import type { StorageOptions } from "./types.js";

const DEFAULT_DB_BASENAME = "wallets.sqlite";

function expandHomePath(filePath: string): string {
  if (filePath === "~") {
    return homedir();
  }

  if (filePath.startsWith(`~${path.sep}`)) {
    return path.join(homedir(), filePath.slice(2));
  }

  return filePath;
}

function envFlagEnabled(value: string | undefined): boolean {
  return /^(1|true|yes)$/i.test((value ?? "").trim());
}

function isRepoLocalPath(filePath: string): boolean {
  const relative = path.relative(process.cwd(), filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function getDefaultDbPath(): string {
  return path.join(homedir(), ".solana-agent-wallet-ops", DEFAULT_DB_BASENAME);
}

export function getConfiguredDbPath(options: StorageOptions = {}): string {
  const rawPath = options.dbPath?.trim() || process.env.SAWO_DB_PATH?.trim() || getDefaultDbPath();
  const resolvedPath = path.resolve(expandHomePath(rawPath));
  const allowRepoDb = options.allowRepoDb ?? envFlagEnabled(process.env.SAWO_ALLOW_REPO_DB);

  if (isRepoLocalPath(resolvedPath) && !allowRepoDb) {
    throw new Error(
      `Refusing repo-local wallet database at ${resolvedPath}. Use --allow-repo-db or SAWO_ALLOW_REPO_DB=1 to override intentionally.`,
    );
  }

  return resolvedPath;
}
