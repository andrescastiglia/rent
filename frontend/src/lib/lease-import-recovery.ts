import type { ImportCurrentLeaseInput } from "@/types/lease";

type ImportAttempt = { idempotencyKey: string; storageKey: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function digest(bytes: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

/** Persist only fingerprints and keys; retain uncertain attempts until a successful response. */
export async function prepareLeaseImport(
  companyId: string,
  userId: string,
  data: ImportCurrentLeaseInput,
): Promise<ImportAttempt> {
  if (!companyId || !userId)
    throw new Error("Falta la sesión para importar el contrato.");
  const fileHash = await digest(await data.file.arrayBuffer());
  const fingerprint = await digest(
    new TextEncoder().encode(
      JSON.stringify([
        data.propertyId,
        data.contractType,
        data.ownerId,
        data.tenantId,
        data.buyerId,
        data.startDate,
        data.endDate,
        data.rentAmount,
        data.depositAmount,
        data.fiscalValue,
        data.currency,
        data.notes,
        data.file.name,
        data.file.type,
        data.file.size,
        fileHash,
      ]),
    ).buffer,
  );
  const storageKey = `rent:lease-import:v1:${companyId}:${userId}:${fingerprint}`;
  const stored = localStorage.getItem(storageKey);
  if (stored) {
    if (!uuid.test(stored))
      throw new Error(
        "La información del reintento del contrato no es válida.",
      );
    return { storageKey, idempotencyKey: stored };
  }
  const idempotencyKey = crypto.randomUUID();
  // A storage failure must stop submission, so an uncertain result remains recoverable after reload.
  localStorage.setItem(storageKey, idempotencyKey);
  return { storageKey, idempotencyKey };
}

export function completeLeaseImport(attempt: ImportAttempt): void {
  try {
    if (localStorage.getItem(attempt.storageKey) === attempt.idempotencyKey)
      localStorage.removeItem(attempt.storageKey);
  } catch {
    // Keeping a successful key is safe; a browser storage error must not hide the committed result.
  }
}

export async function submitLeaseImport<T>(
  companyId: string,
  userId: string,
  data: ImportCurrentLeaseInput,
  submit: (payload: ImportCurrentLeaseInput) => Promise<T>,
): Promise<T> {
  const attempt = await prepareLeaseImport(companyId, userId, data);
  const result = await submit({
    ...data,
    idempotencyKey: attempt.idempotencyKey,
  });
  completeLeaseImport(attempt);
  return result;
}
