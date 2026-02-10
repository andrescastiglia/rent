export type PaymentMethod = 'bank_transfer' | 'check' | 'cash' | 'digital_wallet';

export interface Owner {
    id: string;
    userId: string;
    companyId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    taxId?: string;
    taxIdType?: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
    bankName?: string;
    bankAccountType?: string;
    bankAccountNumber?: string;
    bankCbu?: string;
    bankAlias?: string;
    paymentMethod?: PaymentMethod;
    commissionRate?: number;
    notes?: string;
    createdAt: string;
    updatedAt: string;
}

export type OwnerActivityType =
    | 'call'
    | 'task'
    | 'note'
    | 'email'
    | 'whatsapp'
    | 'visit'
    | 'reserve';

export type OwnerActivityStatus = 'pending' | 'completed' | 'cancelled';

export interface OwnerActivity {
    id: string;
    ownerId: string;
    propertyId?: string | null;
    type: OwnerActivityType;
    status: OwnerActivityStatus;
    subject: string;
    body?: string | null;
    dueAt?: string | null;
    completedAt?: string | null;
    metadata?: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}

export interface CreateOwnerInput {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    taxId?: string;
    taxIdType?: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
    bankName?: string;
    bankAccountType?: string;
    bankAccountNumber?: string;
    bankCbu?: string;
    bankAlias?: string;
    paymentMethod?: PaymentMethod;
    commissionRate?: number;
    notes?: string;
}

export interface UpdateOwnerInput extends Partial<CreateOwnerInput> { }
