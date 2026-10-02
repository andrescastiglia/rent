import type { CreateAmendmentRequestDto } from "@/generated/openapi";

export type AmendmentDraft = Omit<CreateAmendmentRequestDto, "idempotencyKey">;

export type AmendmentDraftFields = {
  changeType: AmendmentDraft["changeType"];
  effectiveDate: string;
  description: string;
  monthlyRent: string;
  endDate: string;
  termsAndConditions: string;
  specialClauses: string;
};
export type AmendmentScope = {
  companyId: string;
  userId: string;
  leaseId: string;
};
export type AmendmentAttempt = { storageKey: string; idempotencyKey: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validDay = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T12:00:00Z`)) &&
  new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;

export function amendmentDraft(
  fields: AmendmentDraftFields,
  scope: AmendmentScope,
): AmendmentDraft | null {
  if (!validDay(fields.effectiveDate) || !fields.description.trim())
    return null;
  let newValues: Record<string, unknown>;
  switch (fields.changeType) {
    case "rent_increase":
    case "rent_decrease":
      if (
        !/^\d{1,10}(\.\d{1,2})?$/.test(fields.monthlyRent) ||
        Number(fields.monthlyRent) <= 0
      )
        return null;
      newValues = { monthlyRent: Number(fields.monthlyRent).toFixed(2) };
      break;
    case "extension":
      if (!validDay(fields.endDate) || fields.endDate < fields.effectiveDate)
        return null;
      newValues = { endDate: fields.endDate };
      break;
    case "early_termination":
      newValues = {};
      break;
    case "clause_modification":
      newValues = {
        ...(fields.termsAndConditions.trim()
          ? { termsAndConditions: fields.termsAndConditions.trim() }
          : {}),
        ...(fields.specialClauses.trim()
          ? { specialClauses: fields.specialClauses.trim() }
          : {}),
      };
      if (!Object.keys(newValues).length) return null;
      break;
    case "guarantor_change":
    case "other":
      if (!fields.specialClauses.trim()) return null;
      newValues = { specialClauses: fields.specialClauses.trim() };
      break;
    default:
      return null;
  }
  return {
    companyId: scope.companyId,
    leaseId: scope.leaseId,
    changeType: fields.changeType,
    description: fields.description.trim(),
    effectiveDate: fields.effectiveDate,
    newValues,
  };
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  return value;
}

/** Store only a request fingerprint and key; failed attempts survive reload without storing contract text. */
export async function prepareAmendmentAttempt(
  scope: AmendmentScope,
  request: unknown,
): Promise<AmendmentAttempt> {
  if (!scope.companyId || !scope.userId || !scope.leaseId)
    throw new Error("Amendment session scope is required");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(canonical(request))),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const storageKey = `rent:amendment:v1:${scope.companyId}:${scope.userId}:${scope.leaseId}:${hash}`;
  const allocate = () => {
    const existing = localStorage.getItem(storageKey);
    if (existing && !uuid.test(existing))
      throw new Error("Invalid amendment recovery information");
    const idempotencyKey = existing ?? crypto.randomUUID();
    if (!existing) localStorage.setItem(storageKey, idempotencyKey);
    return { storageKey, idempotencyKey };
  };
  return navigator.locks
    ? navigator.locks.request(storageKey, allocate)
    : allocate();
}
export function completeAmendmentAttempt(attempt: AmendmentAttempt): void {
  try {
    if (localStorage.getItem(attempt.storageKey) === attempt.idempotencyKey)
      localStorage.removeItem(attempt.storageKey);
  } catch {
    /* Keeping a successful key is safe and must not hide a completed mutation. */
  }
}
