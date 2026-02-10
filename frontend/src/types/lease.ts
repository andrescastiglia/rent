import { Property } from './property';
import { Tenant } from './tenant';
import { InterestedProfile } from './interested';

export type LeaseStatus = 'DRAFT' | 'ACTIVE' | 'FINALIZED';
export type ContractType = 'rental' | 'sale';
export type PaymentFrequency = 'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual';
export type BillingFrequency = 'first_of_month' | 'last_of_month' | 'contract_date' | 'custom';
export type LateFeeType = 'none' | 'fixed' | 'percentage' | 'daily_fixed' | 'daily_percentage';
export type AdjustmentType = 'fixed' | 'percentage' | 'inflation_index';
export type InflationIndexType = 'icl' | 'ipc' | 'igp_m' | 'casa_propia' | 'custom';

export interface Currency {
    code: string;
    symbol: string;
    decimalPlaces: number;
    isActive: boolean;
}

export interface Lease {
    id: string;
    propertyId: string;
    tenantId?: string;
    buyerProfileId?: string;
    ownerId: string;
    contractType: ContractType;
    startDate?: string;
    endDate?: string;
    rentAmount?: number;
    depositAmount: number;
    fiscalValue?: number;
    currency: string;
    currencyData?: Currency;
    status: LeaseStatus;
    terms?: string;
    documents: string[]; // URLs to PDFs
    createdAt: string;
    updatedAt: string;

    // Billing configuration
    paymentFrequency?: PaymentFrequency;
    paymentDueDay?: number;
    billingFrequency?: BillingFrequency;
    billingDay?: number;
    autoGenerateInvoices?: boolean;

    // Late fee configuration
    lateFeeType?: LateFeeType;
    lateFeeValue?: number;
    lateFeeGraceDays?: number;
    lateFeeMax?: number;

    // Adjustment configuration
    adjustmentType?: AdjustmentType;
    adjustmentValue?: number;
    adjustmentFrequencyMonths?: number;
    inflationIndexType?: InflationIndexType;
    nextAdjustmentDate?: string;
    lastAdjustmentDate?: string;

    // Expanded relations for UI convenience (in a real app, might be separate or included)
    property?: Property;
    tenant?: Tenant;
    buyerProfile?: InterestedProfile;
}

export interface CreateLeaseInput {
    propertyId: string;
    tenantId?: string;
    buyerProfileId?: string;
    ownerId?: string;
    contractType: ContractType;
    startDate?: string;
    endDate?: string;
    rentAmount?: number;
    depositAmount: number;
    fiscalValue?: number;
    currency: string;
    status: LeaseStatus;
    terms?: string;

    // Billing configuration
    paymentFrequency?: PaymentFrequency;
    paymentDueDay?: number;
    billingFrequency?: BillingFrequency;
    billingDay?: number;
    autoGenerateInvoices?: boolean;

    // Late fee configuration
    lateFeeType?: LateFeeType;
    lateFeeValue?: number;
    lateFeeGraceDays?: number;
    lateFeeMax?: number;

    // Adjustment configuration
    adjustmentType?: AdjustmentType;
    adjustmentValue?: number;
    adjustmentFrequencyMonths?: number;
    inflationIndexType?: InflationIndexType;
    nextAdjustmentDate?: string;
}

export interface UpdateLeaseInput extends Partial<CreateLeaseInput> { }
