export type TenantStatus = 'ACTIVE' | 'INACTIVE' | 'PROSPECT';
export type EmploymentStatus = 'employed' | 'self_employed' | 'unemployed' | 'retired' | 'student';
export type TenantActivityType = 'call' | 'task' | 'note' | 'email' | 'whatsapp' | 'visit';
export type TenantActivityStatus = 'pending' | 'completed' | 'cancelled';

export interface Tenant {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    dni: string; // Documento Nacional de Identidad
    cuil?: string; // CUIL/CUIT tax ID
    dateOfBirth?: string;
    nationality?: string;
    status: TenantStatus;
    address?: {
        street: string;
        number: string;
        city: string;
        state: string;
        zipCode: string;
    };
    // Employment information
    occupation?: string;
    employer?: string;
    monthlyIncome?: number;
    employmentStatus?: EmploymentStatus;
    // Emergency contact
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    emergencyContactRelationship?: string;
    // Credit information
    creditScore?: number;
    creditScoreDate?: string;
    notes?: string;
    createdAt: string;
    updatedAt: string;
}

export interface CreateTenantInput {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    dni: string;
    cuil?: string;
    dateOfBirth?: string;
    nationality?: string;
    status: TenantStatus;
    address?: {
        street: string;
        number: string;
        city: string;
        state: string;
        zipCode: string;
    };
    // Employment information
    occupation?: string;
    employer?: string;
    monthlyIncome?: number;
    employmentStatus?: EmploymentStatus;
    // Emergency contact
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    emergencyContactRelationship?: string;
    // Credit information
    creditScore?: number;
    notes?: string;
}

export interface UpdateTenantInput extends Partial<CreateTenantInput> { }

export interface TenantActivity {
    id: string;
    tenantId: string;
    type: TenantActivityType;
    status: TenantActivityStatus;
    subject: string;
    body?: string | null;
    dueAt?: string | null;
    completedAt?: string | null;
    metadata?: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}
