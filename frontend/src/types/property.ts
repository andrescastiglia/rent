export type PropertyType =
    | 'APARTMENT'
    | 'HOUSE'
    | 'COMMERCIAL'
    | 'OFFICE'
    | 'WAREHOUSE'
    | 'LAND'
    | 'PARKING'
    | 'OTHER';
export type PropertyStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';

export interface Address {
    street: string;
    number: string;
    unit?: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
}

export interface PropertyFeature {
    id: string;
    name: string;
    value?: string;
}

export interface Unit {
    id: string;
    unitNumber: string;
    floor?: string;
    bedrooms: number;
    bathrooms: number;
    area: number; // in square meters
    status: 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE';
    rentAmount: number;
}

export interface PropertyVisit {
    id: string;
    propertyId: string;
    visitedAt: string;
    interestedName: string;
    comments?: string;
    hasOffer?: boolean;
    offerAmount?: number;
    offerCurrency?: string;
    createdAt: string;
    updatedAt: string;
}

export interface Property {
    id: string;
    name: string;
    description?: string;
    type: PropertyType;
    status: PropertyStatus;
    address: Address;
    features: PropertyFeature[];
    units: Unit[];
    images: string[];
    ownerId: string;
    ownerWhatsapp?: string;
    salePrice?: number;
    saleCurrency?: string;
    allowsPets?: boolean;
    requiresWhiteIncome?: boolean;
    acceptedGuaranteeTypes?: string[];
    maxOccupants?: number;
    createdAt: string;
    updatedAt: string;
}

export interface CreatePropertyInput {
    name: string;
    description?: string;
    type: PropertyType;
    address: Address;
    features?: Omit<PropertyFeature, 'id'>[];
    images?: string[];
    ownerId: string;
    ownerWhatsapp?: string;
    salePrice?: number;
    saleCurrency?: string;
    allowsPets?: boolean;
    requiresWhiteIncome?: boolean;
    acceptedGuaranteeTypes?: string[];
    maxOccupants?: number;
}

export interface UpdatePropertyInput extends Partial<CreatePropertyInput> {
    status?: PropertyStatus;
}

export interface CreatePropertyVisitInput {
    visitedAt?: string;
    interestedName: string;
    comments?: string;
    hasOffer?: boolean;
    offerAmount?: number;
    offerCurrency?: string;
}

export interface PropertyFilters {
    addressCity?: string;
    addressState?: string;
    propertyType?: PropertyType;
    status?: PropertyStatus;
    minRent?: number;
    maxRent?: number;
    minSalePrice?: number;
    maxSalePrice?: number;
    bedrooms?: number;
    bathrooms?: number;
    page?: number;
    limit?: number;
}
