import { apiClient } from '@/api/client';
import { IS_MOCK_MODE } from '@/api/env';
import { createAndShareMockPdf, downloadAndSharePdf } from '@/api/pdf';
import type {
  CreatePaymentInput,
  Invoice,
  InvoiceFilters,
  PaymentFilters,
  PaginatedResponse,
  Payment,
  PaymentDocumentTemplate,
  PaymentDocumentTemplateType,
  TenantAccount,
} from '@/types/payment';

let MOCK_PAYMENTS: Payment[] = [
  {
    id: 'pay1',
    tenantAccountId: 'ta1',
    amount: 1500,
    currencyCode: 'ARS',
    paymentDate: new Date().toISOString().slice(0, 10),
    method: 'bank_transfer',
    reference: null,
    status: 'completed',
    notes: null,
    items: [],
    receipt: {
      id: 'rec1',
      paymentId: 'pay1',
      receiptNumber: 'REC-0001',
      amount: 1500,
      currencyCode: 'ARS',
      pdfUrl: '/payments/pay1/receipt',
      issuedAt: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

let MOCK_INVOICES: Invoice[] = [
  {
    id: 'inv1',
    leaseId: '1',
    ownerId: 'owner-1',
    tenantAccountId: 'ta1',
    invoiceNumber: 'INV-1',
    periodStart: new Date().toISOString().slice(0, 10),
    periodEnd: new Date().toISOString().slice(0, 10),
    subtotal: 1500,
    lateFee: 0,
    adjustments: 0,
    total: 1500,
    currencyCode: 'ARS',
    amountPaid: 1500,
    dueDate: new Date().toISOString().slice(0, 10),
    status: 'paid',
    issuedAt: new Date().toISOString(),
    pdfUrl: '/invoices/inv1/pdf',
    notes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

let MOCK_TENANT_ACCOUNTS: TenantAccount[] = [
  {
    id: 'ta1',
    leaseId: '1',
    balance: 0,
    lastMovementAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

let MOCK_PAYMENT_TEMPLATES: PaymentDocumentTemplate[] = [
  {
    id: 'tpl-receipt-1',
    type: 'receipt',
    name: 'Plantilla recibo base',
    templateBody:
      'Recibo {{receipt.number}}\nFecha: {{receipt.issuedAt}}\nInquilino: {{tenant.fullName}}\nMonto: {{receipt.amount}}',
    isActive: true,
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'tpl-invoice-1',
    type: 'invoice',
    name: 'Plantilla factura base',
    templateBody:
      'Factura {{invoice.number}}\nEmisión: {{invoice.issueDate}}\nVencimiento: {{invoice.dueDate}}\nTotal: {{invoice.total}}',
    isActive: true,
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const toPayment = (raw: any): Payment => ({
  id: raw.id,
  companyId: raw.companyId,
  tenantAccountId: raw.tenantAccountId,
  tenantId: raw.tenantId,
  invoiceId: raw.invoiceId,
  paymentNumber: raw.paymentNumber,
  amount: Number(raw.amount),
  currencyCode: raw.currencyCode,
  paymentDate: raw.paymentDate,
  processedAt: raw.processedAt,
  method: raw.method,
  reference: raw.reference ?? null,
  status: raw.status,
  notes: raw.notes ?? null,
  bankName: raw.bankName,
  accountLastDigits: raw.accountLastDigits,
  authorizationCode: raw.authorizationCode,
  externalTransactionId: raw.externalTransactionId,
  gatewayResponse: raw.gatewayResponse,
  receipt: raw.receipt,
  creditNotes: raw.creditNotes,
  items: raw.items,
  tenantAccount: raw.tenantAccount,
  createdAt: raw.createdAt,
  updatedAt: raw.updatedAt,
});

const toInvoice = (raw: any): Invoice => ({
  id: raw.id,
  companyId: raw.companyId,
  leaseId: raw.leaseId,
  ownerId: raw.ownerId,
  tenantAccountId: raw.tenantAccountId,
  invoiceNumber: raw.invoiceNumber,
  periodStart: raw.periodStart,
  periodEnd: raw.periodEnd,
  subtotal: Number(raw.subtotal ?? 0),
  taxAmount: raw.taxAmount,
  lateFee: Number(raw.lateFee ?? 0),
  adjustments: Number(raw.adjustments ?? 0),
  total: Number(raw.total ?? 0),
  netAmount: raw.netAmount,
  currencyCode: raw.currencyCode,
  amountPaid: Number(raw.amountPaid ?? 0),
  balanceDue: raw.balanceDue,
  lastPaymentDate: raw.lastPaymentDate,
  dueDate: raw.dueDate,
  status: raw.status,
  arcaTipoComprobante: raw.arcaTipoComprobante,
  pdfUrl: raw.pdfUrl,
  issuedAt: raw.issuedAt,
  notes: raw.notes ?? null,
  internalNotes: raw.internalNotes,
  lineItems: raw.lineItems,
  lease: raw.lease,
  createdAt: raw.createdAt,
  updatedAt: raw.updatedAt,
});

const ensureTenantAccountForLease = (leaseId: string): TenantAccount => {
  const existing = MOCK_TENANT_ACCOUNTS.find((item) => item.leaseId === leaseId);
  if (existing) {
    return existing;
  }

  const created: TenantAccount = {
    id: `ta-${leaseId}`,
    leaseId,
    balance: 0,
    lastMovementAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  MOCK_TENANT_ACCOUNTS = [created, ...MOCK_TENANT_ACCOUNTS];
  return created;
};

const ensureSingleDefaultPaymentTemplate = (
  type: PaymentDocumentTemplateType,
  defaultTemplateId: string,
) => {
  MOCK_PAYMENT_TEMPLATES = MOCK_PAYMENT_TEMPLATES.map((item) =>
    item.type === type && item.id !== defaultTemplateId
      ? { ...item, isDefault: false, updatedAt: new Date().toISOString() }
      : item,
  );
};

const applyMockPaymentFilters = (payments: Payment[], filters?: PaymentFilters): Payment[] => {
  if (!filters) {
    return payments;
  }

  return payments.filter((item) => {
    if (filters.status && item.status !== filters.status) return false;
    if (filters.method && item.method !== filters.method) return false;
    if (filters.tenantId && item.tenantId !== filters.tenantId) return false;
    if (filters.tenantAccountId && item.tenantAccountId !== filters.tenantAccountId) return false;
    if (filters.fromDate && item.paymentDate < filters.fromDate) return false;
    if (filters.toDate && item.paymentDate > filters.toDate) return false;
    return true;
  });
};

const fetchPayments = async (filters?: PaymentFilters): Promise<PaginatedResponse<Payment>> => {
  if (IS_MOCK_MODE) {
    const filtered = applyMockPaymentFilters([...MOCK_PAYMENTS], filters);
    return {
      data: filtered,
      total: filtered.length,
      page: 1,
      limit: 20,
    };
  }

  const queryParams = new URLSearchParams();
  if (filters?.tenantId) queryParams.append('tenantId', filters.tenantId);
  if (filters?.tenantAccountId) queryParams.append('tenantAccountId', filters.tenantAccountId);
  if (filters?.leaseId) queryParams.append('leaseId', filters.leaseId);
  if (filters?.status) queryParams.append('status', filters.status);
  if (filters?.method) queryParams.append('method', filters.method);
  if (filters?.fromDate) queryParams.append('fromDate', filters.fromDate);
  if (filters?.toDate) queryParams.append('toDate', filters.toDate);
  if (filters?.page) queryParams.append('page', String(filters.page));
  if (filters?.limit) queryParams.append('limit', String(filters.limit));

  const endpoint = queryParams.toString().length > 0 ? `/payments?${queryParams.toString()}` : '/payments';
  const result = await apiClient.get<PaginatedResponse<any>>(endpoint);
  return {
    ...result,
    data: result.data.map(toPayment),
  };
};

const applyMockInvoiceFilters = (invoices: Invoice[], filters?: InvoiceFilters): Invoice[] => {
  if (!filters) {
    return invoices;
  }

  return invoices.filter((item) => {
    if (filters.status && item.status !== filters.status) return false;
    if (filters.leaseId && item.leaseId !== filters.leaseId) return false;
    if (filters.ownerId && item.ownerId !== filters.ownerId) return false;
    return true;
  });
};

export const paymentsApi = {
  async getAll(): Promise<PaginatedResponse<Payment>> {
    return fetchPayments();
  },

  async getAllWithFilters(filters?: PaymentFilters): Promise<PaginatedResponse<Payment>> {
    return fetchPayments(filters);
  },

  async getById(id: string): Promise<Payment | null> {
    if (IS_MOCK_MODE) {
      return MOCK_PAYMENTS.find((item) => item.id === id) ?? null;
    }

    try {
      const result = await apiClient.get<any>(`/payments/${id}`);
      return toPayment(result);
    } catch {
      return null;
    }
  },

  async create(payload: CreatePaymentInput): Promise<Payment> {
    if (IS_MOCK_MODE) {
      const created: Payment = {
        id: `pay-${Date.now()}`,
        tenantAccountId: payload.tenantAccountId,
        amount: payload.amount,
        currencyCode: payload.currencyCode ?? 'ARS',
        paymentDate: payload.paymentDate,
        method: payload.method,
        reference: payload.reference ?? null,
        status: 'pending',
        notes: payload.notes ?? null,
        items: payload.items?.map((item, index) => ({
          ...item,
          id: `item-${Date.now()}-${index}`,
          paymentId: `pay-${Date.now()}`,
        })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      MOCK_PAYMENTS = [created, ...MOCK_PAYMENTS];
      return created;
    }

    const result = await apiClient.post<any>('/payments', payload);
    return toPayment(result);
  },

  async confirm(id: string): Promise<Payment> {
    if (IS_MOCK_MODE) {
      const index = MOCK_PAYMENTS.findIndex((item) => item.id === id);
      if (index < 0) {
        throw new Error('Payment not found');
      }

      const current = MOCK_PAYMENTS[index];
      const confirmed: Payment = {
        ...current,
        status: 'completed',
        receipt: {
          id: `receipt-${Date.now()}`,
          paymentId: current.id,
          receiptNumber: `REC-${Date.now()}`,
          amount: current.amount,
          currencyCode: current.currencyCode,
          pdfUrl: `/payments/${current.id}/receipt`,
          issuedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      };

      MOCK_PAYMENTS[index] = confirmed;
      return confirmed;
    }

    const result = await apiClient.patch<any>(`/payments/${id}/confirm`, {});
    return toPayment(result);
  },

  async downloadReceiptPdf(paymentId: string): Promise<void> {
    if (IS_MOCK_MODE) {
      await createAndShareMockPdf(`recibo-${paymentId}`, `Recibo mock del pago ${paymentId}`);
      return;
    }

    await downloadAndSharePdf({
      relativePath: `/payments/${paymentId}/receipt`,
      filenamePrefix: `recibo-${paymentId}`,
    });
  },
};

export const invoicesApi = {
  async getAll(filters?: InvoiceFilters): Promise<PaginatedResponse<Invoice>> {
    if (IS_MOCK_MODE) {
      const filtered = applyMockInvoiceFilters([...MOCK_INVOICES], filters);
      return {
        data: filtered,
        total: filtered.length,
        page: filters?.page ?? 1,
        limit: filters?.limit ?? 20,
      };
    }

    const queryParams = new URLSearchParams();
    if (filters?.status) queryParams.append('status', filters.status);
    if (filters?.leaseId) queryParams.append('leaseId', filters.leaseId);
    if (filters?.ownerId) queryParams.append('ownerId', filters.ownerId);
    if (filters?.page) queryParams.append('page', String(filters.page));
    if (filters?.limit) queryParams.append('limit', String(filters.limit));

    const endpoint = queryParams.toString().length > 0 ? `/invoices?${queryParams.toString()}` : '/invoices';
    const result = await apiClient.get<PaginatedResponse<any>>(endpoint);
    return {
      ...result,
      data: result.data.map(toInvoice),
    };
  },

  async getById(id: string): Promise<Invoice | null> {
    if (IS_MOCK_MODE) {
      return MOCK_INVOICES.find((item) => item.id === id) ?? null;
    }

    try {
      const result = await apiClient.get<any>(`/invoices/${id}`);
      return toInvoice(result);
    } catch {
      return null;
    }
  },

  async downloadPdf(id: string): Promise<void> {
    if (IS_MOCK_MODE) {
      await createAndShareMockPdf(`factura-${id}`, `Factura mock ${id}`);
      return;
    }

    await downloadAndSharePdf({
      relativePath: `/invoices/${id}/pdf`,
      filenamePrefix: `factura-${id}`,
    });
  },
};

export const tenantAccountsApi = {
  async getByLease(leaseId: string): Promise<TenantAccount | null> {
    if (IS_MOCK_MODE) {
      return ensureTenantAccountForLease(leaseId);
    }

    try {
      return await apiClient.get<TenantAccount>(`/tenant-accounts/lease/${leaseId}`);
    } catch {
      return null;
    }
  },
};

export const paymentDocumentTemplatesApi = {
  async list(type?: PaymentDocumentTemplateType): Promise<PaymentDocumentTemplate[]> {
    if (IS_MOCK_MODE) {
      if (!type) {
        return [...MOCK_PAYMENT_TEMPLATES];
      }
      return MOCK_PAYMENT_TEMPLATES.filter((item) => item.type === type);
    }

    const query = type ? `?type=${type}` : '';
    return apiClient.get<PaymentDocumentTemplate[]>(`/payment-templates${query}`);
  },

  async create(data: {
    type: PaymentDocumentTemplateType;
    name: string;
    templateBody: string;
    isActive?: boolean;
    isDefault?: boolean;
  }): Promise<PaymentDocumentTemplate> {
    if (IS_MOCK_MODE) {
      const isFirstForType = !MOCK_PAYMENT_TEMPLATES.some((item) => item.type === data.type);
      const isDefault = data.isDefault ?? isFirstForType;
      const created: PaymentDocumentTemplate = {
        id: `tpl-${Date.now()}`,
        type: data.type,
        name: data.name,
        templateBody: data.templateBody,
        isActive: data.isActive ?? true,
        isDefault,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      MOCK_PAYMENT_TEMPLATES.unshift(created);
      if (isDefault) {
        ensureSingleDefaultPaymentTemplate(data.type, created.id);
      }
      return created;
    }

    return apiClient.post<PaymentDocumentTemplate>('/payment-templates', data);
  },

  async update(
    templateId: string,
    data: Partial<{
      type: PaymentDocumentTemplateType;
      name: string;
      templateBody: string;
      isActive: boolean;
      isDefault: boolean;
    }>,
  ): Promise<PaymentDocumentTemplate> {
    if (IS_MOCK_MODE) {
      const index = MOCK_PAYMENT_TEMPLATES.findIndex((item) => item.id === templateId);
      if (index < 0) {
        throw new Error('Template not found');
      }

      const updated: PaymentDocumentTemplate = {
        ...MOCK_PAYMENT_TEMPLATES[index],
        ...data,
        updatedAt: new Date().toISOString(),
      } as PaymentDocumentTemplate;
      MOCK_PAYMENT_TEMPLATES[index] = updated;
      if (updated.isDefault) {
        ensureSingleDefaultPaymentTemplate(updated.type, updated.id);
      }
      return updated;
    }

    return apiClient.patch<PaymentDocumentTemplate>(`/payment-templates/${templateId}`, data);
  },

  async delete(templateId: string): Promise<void> {
    if (IS_MOCK_MODE) {
      MOCK_PAYMENT_TEMPLATES = MOCK_PAYMENT_TEMPLATES.filter((item) => item.id !== templateId);
      return;
    }

    await apiClient.delete(`/payment-templates/${templateId}`);
  },
};
