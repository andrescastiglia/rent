import { apiClient, ApiRequestError } from "../api";
import { getToken, getUser } from "../auth";
import {
  prepareDomainAttempt,
  completeDomainAttempt,
} from "../domain-operation";

export type MaintenanceAttachment = {
  id: string;
  name: string;
  status: string;
  fileMimeType: string;
  fileSize: number;
  createdAt: string;
};
const base = () => process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
function contentUrl(value: string, id: string): string {
  const url = new URL(value, base());
  const origins = new Set([
    new URL(base()).origin,
    globalThis.location?.origin,
  ]);
  if (
    !origins.has(url.origin) ||
    Boolean(url.username || url.password) ||
    !url.pathname.endsWith(`/documents/${encodeURIComponent(id)}/content`) ||
    !url.searchParams.get("token")
  )
    throw new Error("Invalid document capability");
  return url.toString();
}
function assertFile(file: File) {
  if (
    !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(
      file.type,
    ) ||
    file.size < 1 ||
    file.size > 5 * 1024 * 1024
  )
    throw new Error("Choose a PDF, JPEG, PNG or WebP file, up to 5 MB");
}
export const maintenanceAttachmentsApi = {
  list: (ticketId: string) =>
    apiClient.get<MaintenanceAttachment[]>(
      `/documents/entity/maintenance_ticket/${encodeURIComponent(ticketId)}`,
      getToken() ?? undefined,
    ),
  upload: async (ticketId: string, file: File) => {
    assertFile(file);
    const user = getUser();
    if (typeof user?.companyId !== "string" || typeof user.id !== "string")
      throw new Error("Authentication required");
    const digest = await crypto.subtle.digest(
      "SHA-256",
      await file.arrayBuffer(),
    );
    const hash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const metadata = {
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      documentType: file.type.startsWith("image/")
        ? "photo"
        : "maintenance_record",
    };
    const scope = {
      companyId: user.companyId,
      userId: user.id,
      entityId: `${ticketId}:${hash}`,
    };
    const attempt = await prepareDomainAttempt(
      "maintenance-attachment",
      scope,
      metadata,
    );
    const upload = await apiClient.post<{
      uploadUrl?: string;
      documentId: string;
      status: "pending" | "approved";
    }>(
      `/maintenance/tickets/${encodeURIComponent(ticketId)}/attachments/upload-url`,
      metadata,
      getToken() ?? undefined,
      { "Idempotency-Key": attempt.idempotencyKey },
    );
    if (upload.status === "approved") {
      completeDomainAttempt(attempt);
      return;
    }
    if (!upload.uploadUrl)
      throw new Error("A pending document requires an upload capability");
    const response = await fetch(
      contentUrl(upload.uploadUrl, upload.documentId),
      { method: "PUT", headers: { "Content-Type": file.type }, body: file },
    );
    if (!response.ok)
      throw new ApiRequestError(response.status, "Attachment upload failed");
    const confirmation = await prepareDomainAttempt(
      "maintenance-attachment-confirm",
      { ...scope, entityId: upload.documentId },
      { ticketId, documentId: upload.documentId },
    );
    await apiClient.patch(
      `/maintenance/tickets/${encodeURIComponent(ticketId)}/attachments/${encodeURIComponent(upload.documentId)}/confirm`,
      {},
      getToken() ?? undefined,
      { "Idempotency-Key": confirmation.idempotencyKey },
    );
    completeDomainAttempt(confirmation);
    completeDomainAttempt(attempt);
  },
  download: async (attachment: MaintenanceAttachment) => {
    const result = await apiClient.get<{ downloadUrl: string }>(
      `/documents/${encodeURIComponent(attachment.id)}/download-url`,
      getToken() ?? undefined,
    );
    const response = await fetch(contentUrl(result.downloadUrl, attachment.id));
    if (!response.ok)
      throw new ApiRequestError(response.status, "Attachment download failed");
    const url = URL.createObjectURL(await response.blob()),
      anchor = document.createElement("a");
    try {
      anchor.href = url;
      anchor.download = attachment.name;
      document.body.appendChild(anchor);
      anchor.click();
    } finally {
      anchor.remove();
      URL.revokeObjectURL(url);
    }
  },
};
