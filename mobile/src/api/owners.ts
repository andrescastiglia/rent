import { apiClient } from '@/api/client';
import { createAndShareMockPdf, downloadAndSharePdf } from '@/api/pdf';
import { IS_MOCK_MODE } from '@/api/env';
import type { CreateOwnerInput, Owner, OwnerSettlementSummary, UpdateOwnerInput } from '@/types/owner';

const nowIso = () => new Date().toISOString();

let MOCK_OWNERS: Owner[] = [
  {
    id: 'owner-1',
    userId: 'user-1',
    companyId: 'company-1',
    firstName: 'Carlos',
    lastName: 'Rodriguez',
    email: 'carlos@example.com',
    phone: '+54 11 5555-1111',
    commissionRate: 10,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: 'owner-2',
    userId: 'user-2',
    companyId: 'company-1',
    firstName: 'Ana',
    lastName: 'Martinez',
    email: 'ana@example.com',
    phone: '+54 11 5555-2222',
    commissionRate: 8,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
];

let MOCK_SETTLEMENTS: OwnerSettlementSummary[] = [
  {
    id: 'settlement-1',
    ownerId: 'owner-1',
    ownerName: 'Carlos Rodriguez',
    period: '2026-01',
    grossAmount: 350000,
    commissionAmount: 35000,
    withholdingsAmount: 0,
    netAmount: 315000,
    status: 'completed',
    scheduledDate: nowIso(),
    processedAt: nowIso(),
    transferReference: 'TRF-1234',
    notes: null,
    receiptPdfUrl: '/owners/owner-1/settlements/settlement-1/receipt',
    receiptName: 'recibo-owner-1-2026-01.pdf',
    currencyCode: 'ARS',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: 'settlement-2',
    ownerId: 'owner-1',
    ownerName: 'Carlos Rodriguez',
    period: '2026-02',
    grossAmount: 360000,
    commissionAmount: 36000,
    withholdingsAmount: 0,
    netAmount: 324000,
    status: 'pending',
    scheduledDate: nowIso(),
    processedAt: null,
    transferReference: null,
    notes: null,
    receiptPdfUrl: null,
    receiptName: null,
    currencyCode: 'ARS',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: 'settlement-3',
    ownerId: 'owner-2',
    ownerName: 'Ana Martinez',
    period: '2026-01',
    grossAmount: 180000,
    commissionAmount: 14400,
    withholdingsAmount: 0,
    netAmount: 165600,
    status: 'completed',
    scheduledDate: nowIso(),
    processedAt: nowIso(),
    transferReference: 'TRF-7788',
    notes: null,
    receiptPdfUrl: '/owners/owner-2/settlements/settlement-3/receipt',
    receiptName: 'recibo-owner-2-2026-01.pdf',
    currencyCode: 'ARS',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
];

const byNewest = <T extends { createdAt: string; updatedAt: string }>(items: T[]): T[] =>
  [...items].sort(
    (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime(),
  );

type BackendOwner = Partial<Owner> & {
  user?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  } | null;
};

const mapOwner = (raw: BackendOwner): Owner => ({
  id: raw.id ?? '',
  userId: raw.userId ?? '',
  companyId: raw.companyId ?? '',
  firstName: raw.firstName ?? raw.user?.firstName ?? '',
  lastName: raw.lastName ?? raw.user?.lastName ?? '',
  email: raw.email ?? raw.user?.email ?? '',
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
  createdAt: raw.createdAt ?? nowIso(),
  updatedAt: raw.updatedAt ?? nowIso(),
});

export const ownersApi = {
  async getAll(): Promise<Owner[]> {
    if (IS_MOCK_MODE) {
      return [...MOCK_OWNERS];
    }

    const result = await apiClient.get<BackendOwner[]>('/owners');
    return result.map(mapOwner);
  },

  async getById(id: string): Promise<Owner | null> {
    if (IS_MOCK_MODE) {
      return MOCK_OWNERS.find((owner) => owner.id === id) ?? null;
    }

    try {
      const result = await apiClient.get<BackendOwner>(`/owners/${id}`);
      return mapOwner(result);
    } catch {
      return null;
    }
  },

  async create(payload: CreateOwnerInput): Promise<Owner> {
    if (IS_MOCK_MODE) {
      const created: Owner = {
        id: `owner-${Date.now()}`,
        userId: `user-${Date.now()}`,
        companyId: 'company-1',
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email,
        phone: payload.phone,
        taxId: payload.taxId,
        taxIdType: payload.taxIdType,
        address: payload.address,
        city: payload.city,
        state: payload.state,
        country: payload.country,
        postalCode: payload.postalCode,
        bankName: payload.bankName,
        bankAccountType: payload.bankAccountType,
        bankAccountNumber: payload.bankAccountNumber,
        bankCbu: payload.bankCbu,
        bankAlias: payload.bankAlias,
        paymentMethod: payload.paymentMethod,
        commissionRate: payload.commissionRate,
        notes: payload.notes,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      MOCK_OWNERS = [created, ...MOCK_OWNERS];
      return created;
    }

    const result = await apiClient.post<BackendOwner>('/owners', payload);
    return mapOwner(result);
  },

  async update(id: string, payload: UpdateOwnerInput): Promise<Owner> {
    if (IS_MOCK_MODE) {
      const index = MOCK_OWNERS.findIndex((owner) => owner.id === id);
      if (index < 0) {
        throw new Error('Owner not found');
      }

      const updated: Owner = {
        ...MOCK_OWNERS[index],
        ...payload,
        updatedAt: nowIso(),
      };
      MOCK_OWNERS[index] = updated;
      return updated;
    }

    const result = await apiClient.patch<BackendOwner>(`/owners/${id}`, payload);
    return mapOwner(result);
  },

  async getSettlements(
    ownerId: string,
    status: 'all' | 'pending' | 'processing' | 'completed' | 'failed' = 'all',
    limit = 6,
  ): Promise<OwnerSettlementSummary[]> {
    if (IS_MOCK_MODE) {
      const ownerSettlements = byNewest(MOCK_SETTLEMENTS).filter((settlement) => {
        if (settlement.ownerId !== ownerId) {
          return false;
        }
        if (status === 'all') {
          return true;
        }
        return settlement.status === status;
      });
      return ownerSettlements.slice(0, limit);
    }

    const params = new URLSearchParams({ status, limit: String(limit) });
    return apiClient.get<OwnerSettlementSummary[]>(`/owners/${ownerId}/settlements?${params.toString()}`);
  },

  async registerSettlementPayment(
    ownerId: string,
    settlementId: string,
    payload: {
      paymentDate?: string;
      reference?: string;
      notes?: string;
      amount?: number;
    },
  ): Promise<OwnerSettlementSummary> {
    if (IS_MOCK_MODE) {
      const index = MOCK_SETTLEMENTS.findIndex(
        (settlement) => settlement.id === settlementId && settlement.ownerId === ownerId,
      );

      if (index < 0) {
        throw new Error('Settlement not found');
      }

      const current = MOCK_SETTLEMENTS[index];
      const updated: OwnerSettlementSummary = {
        ...current,
        status: 'completed',
        processedAt: payload.paymentDate ?? nowIso(),
        transferReference: payload.reference ?? null,
        notes: payload.notes ?? current.notes,
        netAmount: payload.amount ?? current.netAmount,
        receiptPdfUrl: `/owners/${ownerId}/settlements/${settlementId}/receipt`,
        receiptName: `recibo-${ownerId}-${current.period}.pdf`,
        updatedAt: nowIso(),
      };

      MOCK_SETTLEMENTS[index] = updated;
      return updated;
    }

    return apiClient.post<OwnerSettlementSummary>(`/owners/${ownerId}/settlements/${settlementId}/pay`, payload);
  },

  async downloadSettlementReceipt(ownerId: string, settlementId: string): Promise<void> {
    if (IS_MOCK_MODE) {
      await createAndShareMockPdf(`owner-${ownerId}-${settlementId}-receipt`, 'Recibo de liquidacion de propietario');
      return;
    }

    await downloadAndSharePdf({
      relativePath: `/owners/${ownerId}/settlements/${settlementId}/receipt`,
      filenamePrefix: `owner-${ownerId}-${settlementId}-receipt`,
    });
  },
};
