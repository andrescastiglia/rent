import { Property, Unit } from './property';
import { Tenant } from './tenant';

export type LeaseStatus = 'DRAFT' | 'ACTIVE' | 'ENDED' | 'TERMINATED';

export interface Lease {
    id: string;
    propertyId: string;
    unitId: string;
    tenantId: string;
    startDate: string;
    endDate: string;
    rentAmount: number;
    depositAmount: number;
    status: LeaseStatus;
    terms?: string;
    documents: string[]; // URLs to PDFs
    createdAt: string;
    updatedAt: string;

    // Expanded relations for UI convenience (in a real app, might be separate or included)
    property?: Property;
    unit?: Unit;
    tenant?: Tenant;
}

export interface CreateLeaseInput {
    propertyId: string;
    unitId: string;
    tenantId: string;
    startDate: string;
    endDate: string;
    rentAmount: number;
    depositAmount: number;
    status: LeaseStatus;
    terms?: string;
}

export interface UpdateLeaseInput extends Partial<CreateLeaseInput> { }
