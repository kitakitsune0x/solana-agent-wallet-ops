import path from "node:path";

export function formatBaseUnits(value: number | bigint, decimals: number): string {
  const amount = typeof value === "bigint" ? value : BigInt(value);
  const sign = amount < 0n ? "-" : "";
  const absolute = amount < 0n ? -amount : amount;

  if (decimals === 0) {
    return `${sign}${absolute.toString()}`;
  }

  const scale = 10n ** BigInt(decimals);
  const whole = absolute / scale;
  const fraction = absolute % scale;
  const fractionText = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");

  return fractionText ? `${sign}${whole.toString()}.${fractionText}` : `${sign}${whole.toString()}`;
}

export function formatSol(lamports: number | bigint): string {
  return `${formatBaseUnits(lamports, 9)} SOL`;
}

export function formatAssetAmount(value: number | bigint, decimals: number, suffix?: string): string {
  const rendered = formatBaseUnits(value, decimals);
  return suffix ? `${rendered} ${suffix}` : rendered;
}

export function formatTimestamp(value: string): string {
  return new Date(value).toISOString();
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function renderTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, columnIndex) =>
    Math.max(
      header.length,
      ...rows.map((row) => {
        const cell = row[columnIndex] ?? "";
        return cell.length;
      }),
    ),
  );

  const renderRow = (row: string[]): string =>
    row.map((cell, columnIndex) => (cell ?? "").padEnd(widths[columnIndex])).join("  ").trimEnd();

  return [
    renderRow(headers),
    renderRow(headers.map((_, columnIndex) => "-".repeat(widths[columnIndex]))),
    ...rows.map((row) => renderRow(row)),
  ].join("\n");
}

export function escapeCsvValue(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}

export function relativeFromCwd(filePath: string): string {
  return path.relative(process.cwd(), filePath) || ".";
}
