export type PropertyType = 'APARTMENT' | 'HOUSE' | 'COMMERCIAL' | 'OFFICE' | 'LAND' | 'OTHER';
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
}

export interface UpdatePropertyInput extends Partial<CreatePropertyInput> {
    status?: PropertyStatus;
}
