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
