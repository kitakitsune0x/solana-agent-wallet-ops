import { formatAssetAmount, formatSol, renderTable } from "../format.js";
import type { ExecutedTransfer, SolTransferPlan, SplTransferPlan, TransferExecutionError } from "../transfer.js";
import type { WalletEntry } from "../wallet.js";

type AmountFormatter = (amountBaseUnits: number) => string;

function renderExecutionTable(results: ExecutedTransfer[], formatAmount: AmountFormatter): string {
  return renderTable(
    ["Label", "Public Key", "Amount", "Signature"],
    results.map((result) => [
      result.label ?? "",
      result.public_key,
      formatAmount(result.amount_base_units),
      result.signature,
    ]),
  );
}

export function printNetworkOverrides(
  selectedNetwork: string,
  senderNetwork: string | undefined,
  recipientNetwork: string | undefined,
): void {
  if (senderNetwork && senderNetwork !== selectedNetwork) {
    console.log(`Source network override: stored ${senderNetwork}, using ${selectedNetwork}`);
  }

  if (recipientNetwork && recipientNetwork !== selectedNetwork) {
    console.log(`Destination network override: stored ${recipientNetwork}, using ${selectedNetwork}`);
  }
}

export function printPreviewHeader(
  network: string,
  rpcTarget: string,
  senderDescription: string,
  recipientDescription: string,
  sender: WalletEntry,
  execute: boolean,
): void {
  console.log(`Mode: ${execute ? "execute" : "preview"}`);
  console.log(`Network: ${network}`);
  console.log(`RPC: ${rpcTarget}`);
  console.log(`Sender Source: ${senderDescription}`);
  console.log(`Recipient Source: ${recipientDescription}`);
  console.log(`Sender: ${sender.label} (${sender.public_key})`);
}

export function printSolPlan(plan: SolTransferPlan): void {
  console.log("Asset: SOL");
  console.log("");
  console.log(`Recipients: ${plan.recipients.length}`);
  console.log(`Transfer Total: ${formatSol(plan.total_transfer_lamports)}`);
  console.log(`Estimated Fee Per Transfer: ${formatSol(plan.per_transfer_fee_lamports)}`);
  console.log(`Estimated Total Fees: ${formatSol(plan.total_fee_lamports)}`);
  console.log(`Estimated Total Required: ${formatSol(plan.total_required_lamports)}`);
  console.log(`Sender Rent Reserve: ${formatSol(plan.sender_rent_exempt_minimum_lamports)}`);
  console.log(`Estimated Total Required With Reserve: ${formatSol(plan.total_required_with_reserve_lamports)}`);
  console.log(`Sender Balance: ${formatSol(plan.sender_balance_lamports)}`);
  console.log(`Estimated Remaining: ${formatSol(plan.remaining_lamports)}`);
  console.log("");
  console.log(
    renderTable(
      ["Label", "Public Key", "Amount"],
      plan.recipients.map((recipient) => [
        recipient.label ?? "",
        recipient.public_key,
        formatSol(recipient.amount_base_units),
      ]),
    ),
  );
}

export function printSplPlan(plan: SplTransferPlan): void {
  console.log(`Asset: SPL token ${plan.mint_address}`);
  console.log(`Mint Decimals: ${plan.decimals}`);
  console.log(`Sender Token Account: ${plan.sender_token_account}`);
  console.log("");
  console.log(`Recipients: ${plan.recipients.length}`);
  console.log(`Token Transfer Total: ${formatAssetAmount(plan.total_required_token_amount, plan.decimals)}`);
  console.log(`Sender Token Balance: ${formatAssetAmount(plan.sender_token_balance, plan.decimals)}`);
  console.log(`Estimated Remaining Token Balance: ${formatAssetAmount(plan.remaining_token_amount, plan.decimals)}`);
  console.log(`Estimated Fee Per Transfer: ${formatSol(plan.per_transfer_fee_lamports)}`);
  console.log(`Estimated Total Fees: ${formatSol(plan.total_fee_lamports)}`);
  console.log(`ATA Rent Per Missing Recipient: ${formatSol(plan.ata_rent_lamports)}`);
  console.log(`Missing Recipient ATAs: ${plan.missing_recipient_token_accounts}`);
  console.log(`Estimated Total ATA Rent: ${formatSol(plan.total_rent_lamports)}`);
  console.log(`Sender SOL Balance: ${formatSol(plan.sender_sol_balance_lamports)}`);
  console.log(`Estimated Total SOL Required: ${formatSol(plan.total_required_sol_lamports)}`);
  console.log(`Estimated Remaining SOL: ${formatSol(plan.remaining_sol_lamports)}`);
  console.log("");
  console.log(
    renderTable(
      ["Label", "Public Key", "Token ATA", "Amount", "ATA Status"],
      plan.recipients.map((recipient) => [
        recipient.label ?? "",
        recipient.public_key,
        recipient.token_account,
        formatAssetAmount(recipient.amount_base_units, plan.decimals),
        recipient.token_account_missing ? "missing" : "ok",
      ]),
    ),
  );
}

export function printExecutedTransfers(results: ExecutedTransfer[], formatAmount: AmountFormatter): void {
  console.log("");
  console.log("Executed transfers:");
  console.log(renderExecutionTable(results, formatAmount));
}

export function printCompletedTransfersBeforeFailure(
  error: TransferExecutionError,
  formatAmount: AmountFormatter,
): void {
  if (error.completed.length === 0) {
    return;
  }

  console.log("");
  console.log("Completed before failure:");
  console.log(renderExecutionTable(error.completed, formatAmount));
}
