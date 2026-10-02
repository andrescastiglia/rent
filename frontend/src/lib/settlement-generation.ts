import type { GenerateSettlementDto } from "./api/settlement-generations";

const decimal = /^(0|[1-9]\d{0,12})\.\d{2}$/;
export function settlementNet(base: string, deductions: string): string | null {
  if (!decimal.test(base) || !decimal.test(deductions)) return null;
  const cents =
    BigInt(base.replace(".", "")) - BigInt(deductions.replace(".", ""));
  if (cents <= BigInt(0)) return null;
  return `${cents / BigInt(100)}.${(cents % BigInt(100)).toString().padStart(2, "0")}`;
}

/** Only this tab's pending administrative request, scoped to company/user/owner. */
export type PendingGeneration = {
  request: GenerateSettlementDto;
  netAmount: string;
};
export function readPendingGeneration(
  key: string,
  ownerId: string,
): PendingGeneration | null {
  const stored = sessionStorage.getItem(key);
  if (!stored) return null;
  const pending = JSON.parse(stored) as PendingGeneration;
  const value = pending?.request;
  if (
    value?.ownerId !== ownerId ||
    value.confirmed !== true ||
    !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value.period) ||
    !/^[A-Z]{3}$/.test(value.currency) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.idempotencyKey,
    ) ||
    !/^[a-f0-9]{64}$/.test(value.expectedFingerprint) ||
    !decimal.test(value.additionalWithholdings) ||
    typeof value.withholdingReason !== "string" ||
    value.withholdingReason.length < 10 ||
    value.withholdingReason.length > 1000 ||
    !decimal.test(pending.netAmount) ||
    BigInt(pending.netAmount.replace(".", "")) <= BigInt(0)
  )
    throw new Error("Invalid pending settlement request");
  return pending;
}
