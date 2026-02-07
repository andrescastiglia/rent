import { Lease } from './lease';

/**
 * Estado del pago
 */
export type PaymentStatus =
    | 'pending'
    | 'processing'
    | 'completed'
    | 'failed'
    | 'refunded'
    | 'cancelled';

/**
 * Método de pago
 */
export type PaymentMethod =
    | 'cash'
    | 'bank_transfer'
    | 'credit_card'
    | 'debit_card'
    | 'check'
    | 'digital_wallet'
    | 'crypto'
    | 'other';

/**
 * Estado de la factura
 */
export type InvoiceStatus =
    | 'draft'
    | 'pending'
    | 'sent'
    | 'partial'
    | 'paid'
    | 'overdue'
    | 'cancelled'
    | 'refunded';

/**
 * Tipo de movimiento en cuenta corriente
 */
export type MovementType =
    | 'charge'
    | 'payment'
    | 'adjustment'
    | 'refund'
    | 'interest'
    | 'late_fee'
    | 'discount';

export type PaymentItemType = 'charge' | 'discount';

export interface PaymentItem {
    id: string;
    paymentId: string;
    description: string;
    amount: number;
    quantity: number;
    type: PaymentItemType;
}

/**
 * Cuenta corriente del inquilino
 */
export interface TenantAccount {
    id: string;
    leaseId: string;
    balance: number;
    lastMovementAt: string | null;
    lease?: Lease;
    createdAt: string;
    updatedAt: string;
}

/**
 * Movimiento en cuenta corriente
 */
export interface TenantAccountMovement {
    id: string;
    tenantAccountId: string;
    movementType: MovementType;
    amount: number;
    balanceAfter: number;
    referenceType: string | null;
    referenceId: string | null;
    description: string;
    movementDate: string;
    createdBy: string | null;
    createdAt: string;
}

/**
 * Factura al inquilino
 */
export interface Invoice {
    id: string;
    companyId?: string;
    leaseId: string;
    ownerId: string;
    tenantAccountId: string | null;
    invoiceNumber: string;
    periodStart: string;
    periodEnd: string;
    subtotal: number;
    taxAmount?: number;
    lateFee: number;
    adjustments: number;
    total: number;
    netAmount?: number | null;
    currencyCode: string;
    amountPaid: number;
    balanceDue?: number | null;
    lastPaymentDate?: string | null;
    dueDate: string;
    status: InvoiceStatus;
    pdfUrl: string | null;
    issuedAt: string | null;
    notes: string | null;
    internalNotes?: string | null;
    lineItems?: Array<Record<string, any>>;
    lease?: Lease;
    createdAt: string;
    updatedAt: string;
}

/**
 * Pago del inquilino
 */
export interface Payment {
    id: string;
    companyId?: string;
    tenantAccountId: string;
    tenantId?: string;
    invoiceId?: string | null;
    paymentNumber?: string | null;
    amount: number;
    currencyCode: string;
    paymentDate: string;
    processedAt?: string | null;
    method: PaymentMethod;
    reference: string | null;
    status: PaymentStatus;
    notes: string | null;
    bankName?: string | null;
    accountLastDigits?: string | null;
    authorizationCode?: string | null;
    externalTransactionId?: string | null;
    gatewayResponse?: Record<string, any>;
    receipt?: Receipt;
    items?: PaymentItem[];
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

export interface TenantReceiptSummary {
    id: string;
    paymentId: string;
    receiptNumber: string;
    amount: number;
    currencyCode: string;
    issuedAt: string;
    paymentDate?: string;
    pdfUrl?: string | null;
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
    items?: Omit<PaymentItem, 'id' | 'paymentId'>[];
}

/**
 * Filtros para listar pagos
 */
export interface PaymentFilters {
    tenantId?: string;
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
