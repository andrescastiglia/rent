import type { ImportCurrentLeaseInput } from "@/types/lease";
import { apiClient } from "../api";
import { getToken } from "../auth";

/** Multipart transport shared by the contract adapter and recovery tests. */
export async function importCurrentLease<T>(
  data: ImportCurrentLeaseInput,
): Promise<T> {
  const token = getToken();
  const formData = new FormData();
  if (data.idempotencyKey)
    formData.append("idempotencyKey", data.idempotencyKey);
  formData.append("file", data.file);
  formData.append("propertyId", data.propertyId);
  formData.append("contractType", data.contractType);
  if (data.ownerId) formData.append("ownerId", data.ownerId);
  if (data.tenantId) formData.append("tenantId", data.tenantId);
  if (data.buyerId) formData.append("buyerId", data.buyerId);
  if (data.startDate) formData.append("startDate", data.startDate);
  if (data.endDate) formData.append("endDate", data.endDate);
  if (data.rentAmount !== undefined)
    formData.append("monthlyRent", String(data.rentAmount));
  if (data.depositAmount !== undefined)
    formData.append("securityDeposit", String(data.depositAmount));
  if (data.fiscalValue !== undefined)
    formData.append("fiscalValue", String(data.fiscalValue));
  if (data.currency) formData.append("currency", data.currency);
  if (data.notes) formData.append("notes", data.notes);

  const result = await apiClient.post<T>(
    "/contracts/import-current",
    formData,
    token ?? undefined,
  );
  return result;
}
