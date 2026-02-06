import {
    Payment,
    Invoice,
    TenantAccount,
    TenantAccountMovement,
    AccountBalance,
    CreatePaymentInput,
    PaymentFilters,
    InvoiceFilters,
    PaginatedResponse,
    TenantReceiptSummary,
} from '@/types/payment';
import { apiClient } from '../api';
import { getToken } from '../auth';

// Check if we're in mock mode (non-production)
const IS_MOCK_MODE = process.env.NODE_ENV !== 'production';

// Mock data for development
const MOCK_TENANT_ACCOUNTS: TenantAccount[] = [
    {
        id: 'ta1',
        leaseId: '1',
        balance: 1500,
        lastMovementAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
];

const MOCK_INVOICES: Invoice[] = [
    {
        id: 'inv1',
        leaseId: '1',
        ownerId: 'owner1',
        tenantAccountId: 'ta1',
        invoiceNumber: 'INV-202412-0001',
        periodStart: '2024-12-01',
        periodEnd: '2024-12-31',
        subtotal: 1500,
        lateFee: 0,
        adjustments: 0,
        total: 1500,
        currencyCode: 'ARS',
        amountPaid: 0,
        dueDate: '2024-12-10',
        status: 'pending',
        pdfUrl: null,
        issuedAt: new Date().toISOString(),
        notes: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: 'inv2',
        leaseId: '1',
        ownerId: 'owner1',
        tenantAccountId: 'ta1',
        invoiceNumber: 'INV-202411-0001',
        periodStart: '2024-11-01',
        periodEnd: '2024-11-30',
        subtotal: 1500,
        lateFee: 0,
        adjustments: 0,
        total: 1500,
        currencyCode: 'ARS',
        amountPaid: 1500,
        dueDate: '2024-11-10',
        status: 'paid',
        pdfUrl: '/receipts/inv2.pdf',
        issuedAt: '2024-11-01T10:00:00Z',
        notes: null,
        createdAt: '2024-11-01T10:00:00Z',
        updatedAt: '2024-11-15T14:30:00Z',
    },
];

const MOCK_PAYMENTS: Payment[] = [
    {
        id: 'pay1',
        tenantAccountId: 'ta1',
        tenantId: '1',
        amount: 1500,
        currencyCode: 'ARS',
        paymentDate: '2024-11-15',
        method: 'bank_transfer',
        reference: 'TRF-12345',
        status: 'completed',
        notes: 'Pago noviembre',
        items: [
            {
                id: 'item1',
                paymentId: 'pay1',
                description: 'Alquiler',
                amount: 1500,
                quantity: 1,
                type: 'charge',
            },
        ],
        receipt: {
            id: 'rec1',
            paymentId: 'pay1',
            receiptNumber: 'REC-202411-0001',
            amount: 1500,
            currencyCode: 'ARS',
            pdfUrl: '/receipts/rec1.pdf',
            issuedAt: '2024-11-15T14:30:00Z',
        },
        createdAt: '2024-11-15T14:30:00Z',
        updatedAt: '2024-11-15T14:30:00Z',
    },
];

const DELAY = 500;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const paymentsApi = {
    /**
     * Lista pagos con filtros
     */
    getAll: async (filters?: PaymentFilters): Promise<PaginatedResponse<Payment>> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            let filtered = [...MOCK_PAYMENTS];

            if (filters?.status) {
                filtered = filtered.filter((p) => p.status === filters.status);
            }
            if (filters?.method) {
                filtered = filtered.filter((p) => p.method === filters.method);
            }
            if (filters?.leaseId) {
                const account = MOCK_TENANT_ACCOUNTS.find((a) => a.leaseId === filters.leaseId);
                if (account) {
                    filtered = filtered.filter((p) => p.tenantAccountId === account.id);
                }
            }

            return {
                data: filtered,
                total: filtered.length,
                page: filters?.page || 1,
                limit: filters?.limit || 10,
            };
        }

        const token = getToken();
        const queryParams = new URLSearchParams();
        if (filters?.status) queryParams.append('status', filters.status);
        if (filters?.method) queryParams.append('method', filters.method);
        if (filters?.leaseId) queryParams.append('leaseId', filters.leaseId);
        if (filters?.page) queryParams.append('page', String(filters.page));
        if (filters?.limit) queryParams.append('limit', String(filters.limit));
        
        const query = queryParams.toString();
        return apiClient.get<PaginatedResponse<Payment>>(`/payments${query ? `?${query}` : ''}`, token ?? undefined);
    },

    /**
     * Obtiene un pago por ID
     */
    getById: async (id: string): Promise<Payment | null> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            const payment = MOCK_PAYMENTS.find((p) => p.id === id);
            if (!payment) return null;

            const account = MOCK_TENANT_ACCOUNTS.find((a) => a.id === payment.tenantAccountId);
            return { ...payment, tenantAccount: account };
        }

        const token = getToken();
        try {
            return await apiClient.get<Payment>(`/payments/${id}`, token ?? undefined);
        } catch {
            return null;
        }
    },

    /**
     * Crea un nuevo pago
     */
    create: async (data: CreatePaymentInput): Promise<Payment> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            const newPayment: Payment = {
                id: `pay${Date.now()}`,
                tenantAccountId: data.tenantAccountId,
                amount: data.amount,
                currencyCode: data.currencyCode || 'ARS',
                paymentDate: data.paymentDate,
                method: data.method,
                reference: data.reference || null,
                status: 'pending',
                notes: data.notes || null,
                items: (data.items || []).map((item, index) => ({
                    id: `item-${Date.now()}-${index}`,
                    paymentId: `pay${Date.now()}`,
                    description: item.description,
                    amount: item.amount,
                    quantity: item.quantity ?? 1,
                    type: item.type ?? 'charge',
                })),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            MOCK_PAYMENTS.push(newPayment);
            return newPayment;
        }

        const token = getToken();
        return apiClient.post<Payment>('/payments', data, token ?? undefined);
    },

    /**
     * Confirma un pago
     */
    confirm: async (id: string): Promise<Payment> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            const index = MOCK_PAYMENTS.findIndex((p) => p.id === id);
            if (index === -1) throw new Error('Payment not found');

            MOCK_PAYMENTS[index] = {
                ...MOCK_PAYMENTS[index],
                status: 'completed',
                updatedAt: new Date().toISOString(),
                receipt: {
                    id: `rec${Date.now()}`,
                    paymentId: id,
                    receiptNumber: `REC-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(MOCK_PAYMENTS.length).padStart(4, '0')}`,
                    amount: MOCK_PAYMENTS[index].amount,
                    currencyCode: MOCK_PAYMENTS[index].currencyCode,
                    pdfUrl: `/receipts/rec${Date.now()}.pdf`,
                    issuedAt: new Date().toISOString(),
                },
            };
            return MOCK_PAYMENTS[index];
        }

        const token = getToken();
        return apiClient.patch<Payment>(`/payments/${id}/confirm`, {}, token ?? undefined);
    },

    /**
     * Cancela un pago
     */
    cancel: async (id: string): Promise<Payment> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            const index = MOCK_PAYMENTS.findIndex((p) => p.id === id);
            if (index === -1) throw new Error('Payment not found');

            MOCK_PAYMENTS[index] = {
                ...MOCK_PAYMENTS[index],
                status: 'cancelled',
                updatedAt: new Date().toISOString(),
            };
            return MOCK_PAYMENTS[index];
        }

        const token = getToken();
        return apiClient.patch<Payment>(`/payments/${id}/cancel`, {}, token ?? undefined);
    },

    update: async (id: string, data: Partial<CreatePaymentInput>): Promise<Payment> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            const index = MOCK_PAYMENTS.findIndex((p) => p.id === id);
            if (index === -1) throw new Error('Payment not found');
            if (MOCK_PAYMENTS[index].status !== 'pending') {
                throw new Error('Only pending payments can be edited');
            }
            const items = data.items
                ? data.items.map((item, itemIndex) => ({
                      id: `item-${Date.now()}-${itemIndex}`,
                      paymentId: id,
                      description: item.description,
                      amount: item.amount,
                      quantity: item.quantity ?? 1,
                      type: item.type ?? 'charge',
                  }))
                : MOCK_PAYMENTS[index].items;
            const amountFromItems = items && items.length > 0
                ? items.reduce((acc, item) => {
                      const sign = item.type === 'discount' ? -1 : 1;
                      return acc + sign * item.amount * (item.quantity ?? 1);
                  }, 0)
                : MOCK_PAYMENTS[index].amount;

            MOCK_PAYMENTS[index] = {
                ...MOCK_PAYMENTS[index],
                ...data,
                items,
                amount: data.amount ?? amountFromItems,
                updatedAt: new Date().toISOString(),
            };
            return MOCK_PAYMENTS[index];
        }

        const token = getToken();
        return apiClient.patch<Payment>(`/payments/${id}`, data, token ?? undefined);
    },
};

export const invoicesApi = {
    /**
     * Lista facturas con filtros
     */
    getAll: async (filters?: InvoiceFilters): Promise<PaginatedResponse<Invoice>> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            let filtered = [...MOCK_INVOICES];

            if (filters?.status) {
                filtered = filtered.filter((i) => i.status === filters.status);
            }
            if (filters?.leaseId) {
                filtered = filtered.filter((i) => i.leaseId === filters.leaseId);
            }

            return {
                data: filtered,
                total: filtered.length,
                page: filters?.page || 1,
                limit: filters?.limit || 10,
            };
        }

        const token = getToken();
        const queryParams = new URLSearchParams();
        if (filters?.status) queryParams.append('status', filters.status);
        if (filters?.leaseId) queryParams.append('leaseId', filters.leaseId);
        if (filters?.page) queryParams.append('page', String(filters.page));
        if (filters?.limit) queryParams.append('limit', String(filters.limit));
        
        const query = queryParams.toString();
        return apiClient.get<PaginatedResponse<Invoice>>(`/invoices${query ? `?${query}` : ''}`, token ?? undefined);
    },

    /**
     * Obtiene una factura por ID
     */
    getById: async (id: string): Promise<Invoice | null> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            return MOCK_INVOICES.find((i) => i.id === id) || null;
        }

        const token = getToken();
        try {
            return await apiClient.get<Invoice>(`/invoices/${id}`, token ?? undefined);
        } catch {
            return null;
        }
    },
};

export const tenantAccountsApi = {
    /**
     * Obtiene cuenta por lease ID
     */
    getByLease: async (leaseId: string): Promise<TenantAccount | null> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            return MOCK_TENANT_ACCOUNTS.find((a) => a.leaseId === leaseId) || null;
        }

        const token = getToken();
        try {
            return await apiClient.get<TenantAccount>(`/tenant-accounts/lease/${leaseId}`, token ?? undefined);
        } catch {
            return null;
        }
    },

    /**
     * Obtiene balance de cuenta
     */
    getBalance: async (accountId: string): Promise<AccountBalance> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            const account = MOCK_TENANT_ACCOUNTS.find((a) => a.id === accountId);
            if (!account) throw new Error('Account not found');

            return {
                balance: account.balance,
                lateFee: 0, // Calculado en backend
                total: account.balance,
            };
        }

        const token = getToken();
        return apiClient.get<AccountBalance>(`/tenant-accounts/${accountId}/balance`, token ?? undefined);
    },

    /**
     * Lista movimientos de cuenta
     */
    getMovements: async (accountId: string): Promise<TenantAccountMovement[]> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            // Mock movements
            return [
                {
                    id: 'mov1',
                    tenantAccountId: accountId,
                    movementType: 'charge',
                    amount: 1500,
                    balanceAfter: 1500,
                    referenceType: 'invoice',
                    referenceId: 'inv1',
                    description: 'Factura INV-202412-0001',
                    movementDate: new Date().toISOString().split('T')[0],
                    createdBy: null,
                    createdAt: new Date().toISOString(),
                },
                {
                    id: 'mov2',
                    tenantAccountId: accountId,
                    movementType: 'payment',
                    amount: -1500,
                    balanceAfter: 0,
                    referenceType: 'payment',
                    referenceId: 'pay1',
                    description: 'Pago recibido',
                    movementDate: '2024-11-15',
                    createdBy: null,
                    createdAt: '2024-11-15T14:30:00Z',
                },
            ];
        }

        const token = getToken();
        return apiClient.get<TenantAccountMovement[]>(`/tenant-accounts/${accountId}/movements`, token ?? undefined);
    },

    /**
     * Lista recibos por inquilino
     */
    getReceiptsByTenant: async (tenantId: string): Promise<TenantReceiptSummary[]> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            const normalizedTenantId = decodeURIComponent(tenantId).split('?')[0];
            const receipts: TenantReceiptSummary[] = [];
            for (const payment of MOCK_PAYMENTS) {
                if (
                    payment.tenantAccountId &&
                    payment.receipt &&
                    (!payment.tenantId || payment.tenantId === normalizedTenantId)
                ) {
                    receipts.push({
                        id: payment.receipt.id,
                        paymentId: payment.id,
                        receiptNumber: payment.receipt.receiptNumber,
                        amount: payment.receipt.amount,
                        currencyCode: payment.receipt.currencyCode,
                        issuedAt: payment.receipt.issuedAt,
                        paymentDate: payment.paymentDate,
                        pdfUrl: payment.receipt.pdfUrl,
                    });
                }
            }
            if (receipts.length === 0) {
                for (const payment of MOCK_PAYMENTS) {
                    if (payment.tenantAccountId && payment.receipt) {
                        receipts.push({
                            id: payment.receipt.id,
                            paymentId: payment.id,
                            receiptNumber: payment.receipt.receiptNumber,
                            amount: payment.receipt.amount,
                            currencyCode: payment.receipt.currencyCode,
                            issuedAt: payment.receipt.issuedAt,
                            paymentDate: payment.paymentDate,
                            pdfUrl: payment.receipt.pdfUrl,
                        });
                    }
                }
            }
            return receipts;
        }

        const token = getToken();
        return apiClient.get<TenantReceiptSummary[]>(
            `/payments/tenant/${tenantId}/receipts`,
            token ?? undefined,
        );
    },
};
