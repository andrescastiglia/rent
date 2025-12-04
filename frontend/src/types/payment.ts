import { Lease } from './lease';

/**
 * Estado del pago
 */
export type PaymentStatus = 'pending' | 'completed' | 'cancelled' | 'reversed';

/**
 * Método de pago
 */
export type PaymentMethod = 'cash' | 'transfer' | 'check' | 'debit' | 'credit' | 'other';

/**
 * Estado de la factura
 */
export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'partially_paid' | 'cancelled' | 'overdue';

/**
 * Tipo de movimiento en cuenta corriente
 */
export type MovementType = 'invoice' | 'payment' | 'late_fee' | 'adjustment' | 'credit';

/**
 * Cuenta corriente del inquilino
 */
export interface TenantAccount {
    id: string;
    leaseId: string;
    balance: number;
    lastCalculatedAt: string | null;
    lease?: Lease;
    createdAt: string;
    updatedAt: string;
}

/**
 * Movimiento en cuenta corriente
 */
export interface TenantAccountMovement {
    id: string;
    accountId: string;
    movementType: MovementType;
    amount: number;
    balanceAfter: number;
    referenceType: string | null;
    referenceId: string | null;
    description: string | null;
    createdAt: string;
}

/**
 * Factura al inquilino
 */
export interface Invoice {
    id: string;
    leaseId: string;
    ownerId: string;
    tenantAccountId: string;
    invoiceNumber: string;
    periodStart: string;
    periodEnd: string;
    subtotal: number;
    lateFee: number;
    adjustments: number;
    total: number;
    currencyCode: string;
    amountPaid: number;
    dueDate: string;
    status: InvoiceStatus;
    pdfUrl: string | null;
    issuedAt: string | null;
    notes: string | null;
    lease?: Lease;
    createdAt: string;
    updatedAt: string;
}

/**
 * Pago del inquilino
 */
export interface Payment {
    id: string;
    tenantAccountId: string;
    amount: number;
    currencyCode: string;
    paymentDate: string;
    method: PaymentMethod;
    reference: string | null;
    status: PaymentStatus;
    notes: string | null;
    receivedBy: string | null;
    receipt?: Receipt;
    tenantAccount?: TenantAccount;
    createdAt: string;
    updatedAt: string;
}

/**
 * Recibo de pago
 */
export interface Receipt {
    id: string;
    paymentId: string;
    receiptNumber: string;
    amount: number;
    currencyCode: string;
    pdfUrl: string | null;
    issuedAt: string;
}

/**
 * Balance de cuenta con mora
 */
export interface AccountBalance {
    balance: number;
    lateFee: number;
    total: number;
}

/**
 * DTO para crear pago
 */
export interface CreatePaymentInput {
    tenantAccountId: string;
    amount: number;
    currencyCode?: string;
    paymentDate: string;
    method: PaymentMethod;
    reference?: string;
    notes?: string;
}

/**
 * Filtros para listar pagos
 */
export interface PaymentFilters {
    tenantAccountId?: string;
    leaseId?: string;
    status?: PaymentStatus;
    method?: PaymentMethod;
    fromDate?: string;
    toDate?: string;
    page?: number;
    limit?: number;
}

/**
 * Filtros para listar facturas
 */
export interface InvoiceFilters {
    leaseId?: string;
    ownerId?: string;
    status?: InvoiceStatus;
    page?: number;
    limit?: number;
}

/**
 * Respuesta paginada
 */
export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
}
