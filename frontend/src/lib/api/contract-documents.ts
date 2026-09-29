import { apiClient } from "../api";
import { getToken } from "../auth";
import type { LeaseContractStatusDto } from "@/generated/openapi";
export type { LeaseContractStatusDto } from "@/generated/openapi";
export const contractDocumentsApi = {
  status: (id: string) =>
    apiClient.get<LeaseContractStatusDto>(
      `/contracts/${encodeURIComponent(id)}/contract-status`,
      getToken() ?? undefined,
    ),
  download: async (id: string) => {
    const token = getToken();
    if (!token) throw new Error("Authentication required");
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    const response = await fetch(
      `${base}/contracts/${encodeURIComponent(id)}/contract`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) throw new Error("Contract download failed");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    try {
      anchor.href = url;
      anchor.download = `contrato-${id}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
    } finally {
      anchor.remove();
      URL.revokeObjectURL(url);
    }
  },
};
