export type TenantStatus = 'ACTIVE' | 'INACTIVE' | 'PROSPECT';

export interface Tenant {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    dni: string; // Documento Nacional de Identidad
    status: TenantStatus;
    address?: {
        street: string;
        number: string;
        city: string;
        state: string;
        zipCode: string;
    };
    createdAt: string;
    updatedAt: string;
}

export interface CreateTenantInput {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    dni: string;
    status: TenantStatus;
    address?: {
        street: string;
        number: string;
        city: string;
        state: string;
        zipCode: string;
    };
}

export interface UpdateTenantInput extends Partial<CreateTenantInput> { }
