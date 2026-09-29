import { z } from "zod";
import { apiClient } from "../api";
import { getToken } from "../auth";
import type { InvoiceDocumentStatusDto } from "@/generated/openapi";
export type { InvoiceDocumentStatusDto } from "@/generated/openapi";
export const invoiceDocumentsApi = {
  status: async (id: string): Promise<InvoiceDocumentStatusDto> => {
    const value = await apiClient.get<unknown>(
      `/invoices/${encodeURIComponent(id)}/document-status`,
      getToken() ?? undefined,
    );
    return z
      .object({
        status: z.enum(["queued", "completed", "dead_letter", "unavailable"]),
        available: z.boolean(),
      })
      .refine(
        (v) => v.available === (v.status === "completed"),
        "Inconsistent document availability",
      )
      .parse(value);
  },
  download: async (id: string) => {
    const token = getToken();
    if (!token) throw new Error("Authentication required");
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    const response = await fetch(
      `${base}/invoices/${encodeURIComponent(id)}/pdf`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) throw new Error("Invoice download failed");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    try {
      anchor.href = url;
      anchor.download = `factura-${id}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
    } finally {
      anchor.remove();
      URL.revokeObjectURL(url);
    }
  },
};
