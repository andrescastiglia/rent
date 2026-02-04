export type InterestedOperation = 'rent' | 'sale';
export type InterestedPropertyType = 'apartment' | 'house';

export interface InterestedProfile {
    id: string;
    firstName?: string;
    lastName?: string;
    phone: string;
    email?: string;
    peopleCount?: number;
    maxAmount?: number;
    hasPets?: boolean;
    whiteIncome?: boolean;
    guaranteeTypes?: string[];
    propertyTypePreference?: InterestedPropertyType;
    operation?: InterestedOperation;
    notes?: string;
    createdAt: string;
    updatedAt: string;
}

export interface CreateInterestedProfileInput {
    firstName?: string;
    lastName?: string;
    phone: string;
    email?: string;
    peopleCount?: number;
    maxAmount?: number;
    hasPets?: boolean;
    whiteIncome?: boolean;
    guaranteeTypes?: string[];
    propertyTypePreference?: InterestedPropertyType;
    operation?: InterestedOperation;
    notes?: string;
}

export interface UpdateInterestedProfileInput extends Partial<CreateInterestedProfileInput> {}

export interface InterestedFilters {
    name?: string;
    phone?: string;
    operation?: InterestedOperation;
    propertyTypePreference?: InterestedPropertyType;
    page?: number;
    limit?: number;
}

export interface InterestedMatchesResponse {
    profiles: InterestedProfile[];
}
