import {
  Owner,
  OwnerActivity,
  OwnerSettlementSummary,
  CreateOwnerInput,
  UpdateOwnerInput,
} from "@/types/owner";
import { apiClient } from "../api";
import { getToken } from "../auth";

// Mock data for development/testing
const MOCK_OWNERS: Owner[] = [
  {
    id: "owner1",
    userId: "user-1",
    companyId: "company-1",
    firstName: "Carlos",
    lastName: "Rodríguez",
    email: "carlos.rodriguez@example.com",
    phone: "+54 9 11 5555-1234",
    taxId: "20-12345678-9",
    taxIdType: "CUIT",
    bankName: "Banco Nación",
    bankCbu: "0110000000000000000001",
    bankAlias: "carlos.rodriguez",
    paymentMethod: "bank_transfer",
    commissionRate: 10,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "owner2",
    userId: "user-2",
    companyId: "company-1",
    firstName: "Ana",
    lastName: "Martínez",
    email: "ana.martinez@example.com",
    phone: "+54 9 11 5555-5678",
    taxId: "27-98765432-1",
    taxIdType: "CUIT",
    bankName: "Banco Galicia",
    bankCbu: "0110000000000000000002",
    bankAlias: "ana.martinez.alquileres",
    paymentMethod: "bank_transfer",
    commissionRate: 8,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// Use mock data in test/CI environments, real API in production
const IS_MOCK_MODE =
  process.env.NODE_ENV === "test" ||
  process.env.NEXT_PUBLIC_MOCK_MODE === "true" ||
  process.env.CI === "true";

const DELAY = 500;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type BackendOwner = Partial<Owner> & {
  user?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  } | null;
};

const mapOwner = (raw: BackendOwner): Owner => ({
  id: raw.id ?? "",
  userId: raw.userId ?? "",
  companyId: raw.companyId ?? "",
  firstName: raw.firstName ?? raw.user?.firstName ?? "",
  lastName: raw.lastName ?? raw.user?.lastName ?? "",
  email: raw.email ?? raw.user?.email ?? "",
  phone: raw.phone ?? raw.user?.phone ?? undefined,
  taxId: raw.taxId ?? undefined,
  taxIdType: raw.taxIdType ?? undefined,
  address: raw.address ?? undefined,
  city: raw.city ?? undefined,
  state: raw.state ?? undefined,
  country: raw.country ?? undefined,
  postalCode: raw.postalCode ?? undefined,
  bankName: raw.bankName ?? undefined,
  bankAccountType: raw.bankAccountType ?? undefined,
  bankAccountNumber: raw.bankAccountNumber ?? undefined,
  bankCbu: raw.bankCbu ?? undefined,
  bankAlias: raw.bankAlias ?? undefined,
  paymentMethod: raw.paymentMethod ?? undefined,
  commissionRate: raw.commissionRate ?? undefined,
  notes: raw.notes ?? undefined,
  createdAt: raw.createdAt ?? new Date().toISOString(),
  updatedAt: raw.updatedAt ?? new Date().toISOString(),
});

const mapSettlement = (raw: any): OwnerSettlementSummary => ({
  id: raw.id,
  ownerId: raw.ownerId,
  ownerName: raw.ownerName,
  period: raw.period,
  grossAmount: Number(raw.grossAmount ?? 0),
  commissionAmount: Number(raw.commissionAmount ?? 0),
  withholdingsAmount: Number(raw.withholdingsAmount ?? 0),
  netAmount: Number(raw.netAmount ?? 0),
  status: raw.status,
  scheduledDate: raw.scheduledDate ?? null,
  processedAt: raw.processedAt ?? null,
  transferReference: raw.transferReference ?? null,
  notes: raw.notes ?? null,
  receiptPdfUrl: raw.receiptPdfUrl ?? null,
  receiptName: raw.receiptName ?? null,
  currencyCode: raw.currencyCode ?? "ARS",
  createdAt: raw.createdAt ?? new Date().toISOString(),
  updatedAt: raw.updatedAt ?? new Date().toISOString(),
});

export const ownersApi = {
  getAll: async (): Promise<Owner[]> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      return MOCK_OWNERS;
    }

    const token = getToken();
    const result = await apiClient.get<BackendOwner[]>(
      "/owners",
      token ?? undefined,
    );
    return result.map(mapOwner);
  },

  getById: async (id: string): Promise<Owner | null> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      return MOCK_OWNERS.find((o) => o.id === id) || null;
    }

    const token = getToken();
    try {
      const result = await apiClient.get<BackendOwner>(
        `/owners/${id}`,
        token ?? undefined,
      );
      return mapOwner(result);
    } catch {
      return null;
    }
  },

  create: async (data: CreateOwnerInput): Promise<Owner> => {
    const token = getToken();
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const created: Owner = {
        id: Math.random().toString(36).slice(2, 11),
        userId: `user-${Math.random().toString(36).slice(2, 8)}`,
        companyId: "company-1",
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        taxId: data.taxId,
        taxIdType: data.taxIdType ?? "CUIT",
        address: data.address,
        city: data.city,
        state: data.state,
        country: data.country ?? "Argentina",
        postalCode: data.postalCode,
        bankName: data.bankName,
        bankAccountType: data.bankAccountType,
        bankAccountNumber: data.bankAccountNumber,
        bankCbu: data.bankCbu,
        bankAlias: data.bankAlias,
        paymentMethod: data.paymentMethod ?? "bank_transfer",
        commissionRate: data.commissionRate ?? 0,
        notes: data.notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      MOCK_OWNERS.unshift(created);
      return created;
    }

    const result = await apiClient.post<BackendOwner>(
      "/owners",
      data,
      token ?? undefined,
    );
    return mapOwner(result);
  },

  update: async (id: string, data: UpdateOwnerInput): Promise<Owner> => {
    const token = getToken();
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const current = MOCK_OWNERS.find((owner) => owner.id === id);
      if (!current) {
        throw new Error("Owner not found");
      }
      const updated: Owner = {
        ...current,
        ...data,
        updatedAt: new Date().toISOString(),
      };
      const index = MOCK_OWNERS.findIndex((owner) => owner.id === id);
      if (index >= 0) {
        MOCK_OWNERS[index] = updated;
      }
      return updated;
    }

    const result = await apiClient.patch<BackendOwner>(
      `/owners/${id}`,
      data,
      token ?? undefined,
    );
    return mapOwner(result);
  },

  getActivities: async (ownerId: string): Promise<OwnerActivity[]> => {
    const token = getToken();
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      return [];
    }
    return apiClient.get<OwnerActivity[]>(
      `/owners/${ownerId}/activities`,
      token ?? undefined,
    );
  },

  updateActivity: async (
    ownerId: string,
    activityId: string,
    data: Partial<Pick<OwnerActivity, "status" | "body" | "completedAt">>,
  ): Promise<OwnerActivity> => {
    const token = getToken();
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      return {
        id: activityId,
        ownerId,
        type: "task",
        status: data.status ?? "pending",
        subject: "Actividad",
        body: data.body ?? null,
        completedAt: data.completedAt ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    return apiClient.patch<OwnerActivity>(
      `/owners/${ownerId}/activities/${activityId}`,
      data,
      token ?? undefined,
    );
  },

  getSettlements: async (
    ownerId: string,
    status: "all" | "pending" | "completed" = "all",
    limit = 12,
  ): Promise<OwnerSettlementSummary[]> => {
    const token = getToken();
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      return [];
    }

    const params = new URLSearchParams();
    params.set("status", status);
    params.set("limit", String(limit));
    const data = await apiClient.get<any[]>(
      `/owners/${ownerId}/settlements?${params.toString()}`,
      token ?? undefined,
    );
    return data.map(mapSettlement);
  },

  registerSettlementPayment: async (
    ownerId: string,
    settlementId: string,
    payload: {
      paymentDate?: string;
      reference?: string;
      notes?: string;
      amount?: number;
    },
  ): Promise<OwnerSettlementSummary> => {
    const token = getToken();
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      return {
        id: settlementId,
        ownerId,
        ownerName: "Mock Owner",
        period: "2026-01",
        grossAmount: 100000,
        commissionAmount: 10000,
        withholdingsAmount: 0,
        netAmount: payload.amount ?? 90000,
        status: "completed",
        scheduledDate: new Date().toISOString(),
        processedAt: payload.paymentDate ?? new Date().toISOString(),
        transferReference: payload.reference ?? null,
        notes: payload.notes ?? null,
        receiptPdfUrl: "db://document/mock",
        receiptName: "recibo-liquidacion-mock.pdf",
        currencyCode: "ARS",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    const data = await apiClient.post<any>(
      `/owners/${ownerId}/settlements/${settlementId}/pay`,
      payload,
      token ?? undefined,
    );
    return mapSettlement(data);
  },

  listSettlementPayments: async (
    limit = 100,
  ): Promise<OwnerSettlementSummary[]> => {
    const token = getToken();
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      return [];
    }

    const data = await apiClient.get<any[]>(
      `/owners/settlements/payments?limit=${limit}`,
      token ?? undefined,
    );
    return data.map(mapSettlement);
  },

  downloadSettlementReceipt: async (
    settlementId: string,
    filename?: string,
  ): Promise<void> => {
    const token = getToken();
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    const response = await fetch(
      `${baseUrl}/owners/settlements/${settlementId}/receipt`,
      {
        method: "GET",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      },
    );

    if (!response.ok) {
      throw new Error("Failed to download owner settlement receipt");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename ?? `recibo-liquidacion-${settlementId}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};
