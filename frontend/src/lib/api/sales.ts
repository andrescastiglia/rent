import { apiClient } from "../api";
import { getToken } from "../auth";
import {
  SaleFolder,
  SaleAgreement,
  SaleReceipt,
  CreateSaleFolderInput,
  CreateSaleAgreementInput,
  CreateSaleReceiptInput,
  SaleSchedule,
} from "@/types/sales";
import type { PageResult } from "../pagination";

const IS_MOCK_MODE =
  process.env.NODE_ENV === "test" ||
  process.env.NEXT_PUBLIC_MOCK_MODE === "true" ||
  process.env.CI === "true";

const DELAY = 400;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const MOCK_FOLDERS: SaleFolder[] = [
  {
    id: "folder-1",
    name: "Loteo Las Palmas",
    description: "Etapa 1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const MOCK_AGREEMENTS: SaleAgreement[] = [
  {
    id: "agr-1",
    folderId: "folder-1",
    propertyId: "property-1",
    contractId: "contract-1",
    buyerId: "buyer-1",
    buyerName: "Carlos López",
    buyerPhone: "+54 9 11 4444-1234",
    totalAmount: 100000,
    currency: "USD",
    installmentAmount: 5000,
    installmentCount: 20,
    startDate: new Date().toISOString().split("T")[0],
    dueDay: 10,
    paidAmount: 15000,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const MOCK_RECEIPTS: Record<string, SaleReceipt[]> = {
  "agr-1": [
    {
      id: "srec-1",
      agreementId: "agr-1",
      receiptNumber: "SREC-AGR-0001",
      installmentNumber: 1,
      amount: 5000,
      currency: "USD",
      paymentDate: new Date().toISOString().split("T")[0],
      balanceAfter: 95000,
      overdueAmount: 0,
      copyCount: 2,
      pdfUrl: "/api/sales/receipts/srec-1/pdf",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
};

export const salesApi = {
  getAgreementPage: async (filters?: {
    page?: number;
    limit?: number;
    search?: string;
    folderId?: string;
  }): Promise<PageResult<SaleAgreement>> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const search = filters?.search?.trim().toLocaleLowerCase();
      const data = MOCK_AGREEMENTS.filter(
        (agreement) =>
          (!filters?.folderId || agreement.folderId === filters.folderId) &&
          (!search || agreement.buyerName.toLocaleLowerCase().includes(search)),
      );
      const page = filters?.page ?? 1,
        limit = filters?.limit ?? 20;
      return {
        data: data.slice((page - 1) * limit, page * limit),
        total: data.length,
        page,
        limit,
      };
    }
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters ?? {}))
      if (value !== undefined && value !== "") query.set(key, String(value));
    return apiClient.get<PageResult<SaleAgreement>>(
      "/sales/agreements/page" + (query.size ? "?" + query.toString() : ""),
      getToken() ?? undefined,
    );
  },
  getSchedule: async (
    agreementId: string,
    page = 1,
    limit = 12,
  ): Promise<SaleSchedule> =>
    apiClient.get<SaleSchedule>(
      `/sales/agreements/${encodeURIComponent(agreementId)}/schedule?page=${page}&limit=${limit}`,
      getToken() ?? undefined,
    ),
  cancelReceipt: async (
    receiptId: string,
    reason: string,
    idempotencyKey: string,
  ): Promise<SaleReceipt> =>
    apiClient.patch<SaleReceipt>(
      `/sales/receipts/${encodeURIComponent(receiptId)}/cancel`,
      { reason },
      getToken() ?? undefined,
      { "Idempotency-Key": idempotencyKey },
    ),
  downloadReceiptPdf: async (
    receiptId: string,
    receiptNumber: string,
  ): Promise<void> => {
    const token = getToken();
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    const response = await fetch(
      `${baseUrl}/sales/receipts/${encodeURIComponent(receiptId)}/pdf`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      },
    );
    if (!response.ok) throw new Error("Failed to download sale receipt");
    const objectUrl = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    try {
      anchor.href = objectUrl;
      anchor.download = `recibo-venta-${receiptNumber}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
    } finally {
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    }
  },
  getFolders: async (): Promise<SaleFolder[]> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      return MOCK_FOLDERS;
    }
    const token = getToken();
    return apiClient.get<SaleFolder[]>("/sales/folders", token ?? undefined);
  },

  createFolder: async (data: CreateSaleFolderInput): Promise<SaleFolder> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const folder: SaleFolder = {
        id: `folder-${Date.now()}`,
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      MOCK_FOLDERS.unshift(folder);
      return folder;
    }
    const token = getToken();
    return apiClient.post<SaleFolder>(
      "/sales/folders",
      data,
      token ?? undefined,
    );
  },

  getAgreements: async (folderId?: string): Promise<SaleAgreement[]> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      return folderId
        ? MOCK_AGREEMENTS.filter((a) => a.folderId === folderId)
        : MOCK_AGREEMENTS;
    }
    const token = getToken();
    const query = folderId ? `?folderId=${folderId}` : "";
    return apiClient.get<SaleAgreement[]>(
      `/sales/agreements${query}`,
      token ?? undefined,
    );
  },

  createAgreement: async (
    data: CreateSaleAgreementInput,
  ): Promise<SaleAgreement> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const agreement: SaleAgreement = {
        id: `agr-${Date.now()}`,
        paidAmount: 0,
        dueDay: data.dueDay ?? 10,
        currency: data.currency ?? "ARS",
        buyerName: `Comprador ${data.buyerId.slice(0, 8)}`,
        buyerPhone: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...data,
      };
      MOCK_AGREEMENTS.unshift(agreement);
      return agreement;
    }
    const token = getToken();
    return apiClient.post<SaleAgreement>(
      "/sales/agreements",
      data,
      token ?? undefined,
    );
  },

  getReceipts: async (agreementId: string): Promise<SaleReceipt[]> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      return MOCK_RECEIPTS[agreementId] ?? [];
    }
    const token = getToken();
    return apiClient.get<SaleReceipt[]>(
      `/sales/agreements/${agreementId}/receipts`,
      token ?? undefined,
    );
  },

  createReceipt: async (
    agreementId: string,
    data: CreateSaleReceiptInput,
    idempotencyKey?: string,
  ): Promise<SaleReceipt> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const now = Date.now();
      const receipt: SaleReceipt = {
        id: `srec-${now}`,
        agreementId,
        receiptNumber: `SREC-${now}`,
        installmentNumber: data.installmentNumber ?? 1,
        amount: data.amount,
        currency: "ARS",
        paymentDate: data.paymentDate,
        balanceAfter: 0,
        overdueAmount: 0,
        copyCount: 2,
        pdfUrl: `/api/sales/receipts/srec-${now}/pdf`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      MOCK_RECEIPTS[agreementId] = [
        receipt,
        ...(MOCK_RECEIPTS[agreementId] ?? []),
      ];
      return receipt;
    }
    const token = getToken();
    return apiClient.post<SaleReceipt>(
      `/sales/agreements/${agreementId}/receipts`,
      data,
      token ?? undefined,
      idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
    );
  },
};
