import { apiClient } from '@/api/client';
import { IS_MOCK_MODE } from '@/api/env';
import type {
  CreateInterestedProfileInput,
  InterestedActivity,
  InterestedActivityStatus,
  InterestedFilters,
  InterestedMatch,
  InterestedMatchStatus,
  InterestedOperation,
  InterestedProfile,
  InterestedSummary,
  UpdateInterestedProfileInput,
} from '@/types/interested';
import type { Property, PropertyOperation, PropertyOperationState, PropertyStatus, PropertyType } from '@/types/property';

type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
};

const toIso = (value?: string | Date | null): string =>
  value ? new Date(value).toISOString() : new Date().toISOString();

const toOptionalNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const deriveInterestedOperations = (raw: any): InterestedOperation[] => {
  if (Array.isArray(raw?.operations)) {
    const normalized = raw.operations.filter(
      (item: unknown): item is InterestedOperation => item === 'rent' || item === 'sale',
    );
    if (normalized.length > 0) return normalized;
  }

  if (raw?.operation === 'rent' || raw?.operation === 'sale') {
    return [raw.operation];
  }

  return ['rent'];
};

const mapPropertyType = (value?: string | null): PropertyType => {
  switch ((value ?? '').toLowerCase()) {
    case 'apartment':
      return 'APARTMENT';
    case 'house':
      return 'HOUSE';
    case 'commercial':
      return 'COMMERCIAL';
    case 'office':
      return 'OFFICE';
    case 'warehouse':
      return 'WAREHOUSE';
    case 'land':
      return 'LAND';
    case 'parking':
      return 'PARKING';
    default:
      return 'OTHER';
  }
};

const mapPropertyStatus = (value?: string | null): PropertyStatus => {
  switch ((value ?? '').toLowerCase()) {
    case 'active':
      return 'ACTIVE';
    case 'under_maintenance':
    case 'maintenance':
      return 'MAINTENANCE';
    default:
      return 'INACTIVE';
  }
};

const mapPropertyOperations = (raw: any): PropertyOperation[] => {
  if (Array.isArray(raw?.operations)) {
    const normalized = raw.operations
      .map((item: unknown) => (typeof item === 'string' ? item.toLowerCase() : ''))
      .filter((item: string): item is PropertyOperation => item === 'rent' || item === 'sale');
    if (normalized.length > 0) return normalized;
  }

  const operations: PropertyOperation[] = [];
  if (raw?.rentPrice !== null && raw?.rentPrice !== undefined) operations.push('rent');
  if (raw?.salePrice !== null && raw?.salePrice !== undefined) operations.push('sale');
  return operations.length > 0 ? operations : ['rent'];
};

const mapPropertyOperationState = (value?: string | null): PropertyOperationState => {
  switch ((value ?? '').toLowerCase()) {
    case 'rented':
      return 'rented';
    case 'reserved':
      return 'reserved';
    case 'sold':
      return 'sold';
    default:
      return 'available';
  }
};

const mapProperty = (raw: any): Property => ({
  id: raw.id,
  name: raw.name ?? 'Propiedad',
  description: toOptionalString(raw.description),
  type: mapPropertyType(raw.propertyType),
  status: mapPropertyStatus(raw.status),
  address: {
    street: raw.addressStreet ?? '',
    number: raw.addressNumber ?? '',
    unit: raw.addressApartment ?? undefined,
    city: raw.addressCity ?? '',
    state: raw.addressState ?? '',
    zipCode: raw.addressPostalCode ?? '',
    country: raw.addressCountry ?? 'Argentina',
  },
  features: Array.isArray(raw.features)
    ? raw.features.map((feature: any, index: number) => ({
        id: feature?.id ?? `${raw.id}-feature-${index}`,
        name: feature?.name ?? 'Feature',
        value: toOptionalString(feature?.value),
      }))
    : [],
  units: Array.isArray(raw.units)
    ? raw.units.map((unit: any, index: number) => ({
        id: unit?.id ?? `${raw.id}-unit-${index}`,
        unitNumber: unit?.unitNumber ?? `${index + 1}`,
        floor: toOptionalString(unit?.floor),
        bedrooms: Number(unit?.bedrooms ?? 0),
        bathrooms: Number(unit?.bathrooms ?? 0),
        area: Number(unit?.area ?? 0),
        status:
          unit?.status === 'OCCUPIED'
            ? 'OCCUPIED'
            : unit?.status === 'MAINTENANCE'
              ? 'MAINTENANCE'
              : 'AVAILABLE',
        rentAmount: Number(unit?.baseRent ?? unit?.rentAmount ?? 0),
      }))
    : [],
  images: Array.isArray(raw.images)
    ? raw.images
        .map((item: any) => (typeof item === 'string' ? item : item?.url))
        .filter((item: unknown): item is string => typeof item === 'string')
    : [],
  ownerId: raw.ownerId ?? '',
  ownerWhatsapp: toOptionalString(raw.ownerWhatsapp),
  rentPrice: toOptionalNumber(raw.rentPrice),
  salePrice: toOptionalNumber(raw.salePrice),
  saleCurrency: toOptionalString(raw.saleCurrency),
  operations: mapPropertyOperations(raw),
  operationState: mapPropertyOperationState(raw.operationState),
  allowsPets: raw.allowsPets ?? undefined,
  acceptedGuaranteeTypes: Array.isArray(raw.acceptedGuaranteeTypes) ? raw.acceptedGuaranteeTypes : undefined,
  maxOccupants: toOptionalNumber(raw.maxOccupants),
  createdAt: toIso(raw.createdAt),
  updatedAt: toIso(raw.updatedAt),
});

const mapProfile = (raw: any): InterestedProfile => {
  const operations = deriveInterestedOperations(raw);
  return {
    id: raw.id,
    firstName: toOptionalString(raw.firstName),
    lastName: toOptionalString(raw.lastName),
    phone: raw.phone ?? '',
    email: toOptionalString(raw.email),
    peopleCount: toOptionalNumber(raw.peopleCount),
    minAmount: toOptionalNumber(raw.minAmount),
    maxAmount: toOptionalNumber(raw.maxAmount),
    hasPets: typeof raw.hasPets === 'boolean' ? raw.hasPets : undefined,
    guaranteeTypes: Array.isArray(raw.guaranteeTypes) ? raw.guaranteeTypes : undefined,
    preferredZones: Array.isArray(raw.preferredZones) ? raw.preferredZones : undefined,
    preferredCity: toOptionalString(raw.preferredCity),
    desiredFeatures: Array.isArray(raw.desiredFeatures) ? raw.desiredFeatures : undefined,
    propertyTypePreference: raw.propertyTypePreference ?? undefined,
    operation: raw.operation ?? operations[0],
    operations,
    status: raw.status ?? 'interested',
    qualificationLevel: raw.qualificationLevel ?? undefined,
    qualificationNotes: toOptionalString(raw.qualificationNotes),
    source: toOptionalString(raw.source),
    assignedToUserId: toOptionalString(raw.assignedToUserId),
    organizationName: toOptionalString(raw.organizationName),
    customFields: raw.customFields ?? undefined,
    lastContactAt: raw.lastContactAt ? toIso(raw.lastContactAt) : undefined,
    nextContactAt: raw.nextContactAt ? toIso(raw.nextContactAt) : undefined,
    lostReason: toOptionalString(raw.lostReason),
    consentContact: typeof raw.consentContact === 'boolean' ? raw.consentContact : undefined,
    consentRecordedAt: raw.consentRecordedAt ? toIso(raw.consentRecordedAt) : undefined,
    convertedToTenantId: toOptionalString(raw.convertedToTenantId),
    convertedToSaleAgreementId: toOptionalString(raw.convertedToSaleAgreementId),
    notes: toOptionalString(raw.notes),
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
  };
};

const mapActivity = (raw: any): InterestedActivity => ({
  id: raw.id,
  interestedProfileId: raw.interestedProfileId,
  type: raw.type,
  status: raw.status,
  subject: raw.subject,
  body: toOptionalString(raw.body),
  dueAt: raw.dueAt ? toIso(raw.dueAt) : undefined,
  completedAt: raw.completedAt ? toIso(raw.completedAt) : undefined,
  templateName: toOptionalString(raw.templateName),
  metadata: raw.metadata ?? undefined,
  createdByUserId: toOptionalString(raw.createdByUserId),
  createdAt: toIso(raw.createdAt),
  updatedAt: toIso(raw.updatedAt),
});

const mapMatch = (raw: any): InterestedMatch => ({
  id: raw.id,
  interestedProfileId: raw.interestedProfileId,
  propertyId: raw.propertyId,
  status: raw.status,
  score: toOptionalNumber(raw.score),
  matchReasons: Array.isArray(raw.matchReasons) ? raw.matchReasons : undefined,
  contactedAt: raw.contactedAt ? toIso(raw.contactedAt) : undefined,
  notes: toOptionalString(raw.notes),
  property: raw.property ? mapProperty(raw.property) : undefined,
  createdAt: toIso(raw.createdAt),
  updatedAt: toIso(raw.updatedAt),
});

const mapSummary = (raw: any): InterestedSummary => ({
  profile: mapProfile(raw.profile),
  stageHistory: Array.isArray(raw.stageHistory)
    ? raw.stageHistory.map((item: any) => ({
        id: item.id,
        fromStatus: item.fromStatus,
        toStatus: item.toStatus,
        reason: toOptionalString(item.reason),
        changedAt: toIso(item.changedAt),
        changedByUserId: toOptionalString(item.changedByUserId),
      }))
    : [],
  activities: Array.isArray(raw.activities) ? raw.activities.map(mapActivity) : [],
  matches: Array.isArray(raw.matches) ? raw.matches.map(mapMatch) : [],
  visits: Array.isArray(raw.visits)
    ? raw.visits.map((visit: any) => ({
        id: visit.id,
        propertyId: visit.propertyId,
        visitedAt: toIso(visit.visitedAt),
        interestedName: toOptionalString(visit.interestedName),
        comments: toOptionalString(visit.comments),
        hasOffer: typeof visit.hasOffer === 'boolean' ? visit.hasOffer : undefined,
        offerAmount: toOptionalNumber(visit.offerAmount),
        offerCurrency: toOptionalString(visit.offerCurrency),
        property: visit.property ? mapProperty(visit.property) : undefined,
      }))
    : [],
});

const createMockProperty = (id: string, name: string, operations: PropertyOperation[], rentPrice?: number): Property => ({
  id,
  name,
  type: 'APARTMENT',
  status: 'ACTIVE',
  address: {
    street: 'Av. Siempre Viva',
    number: '123',
    city: 'CABA',
    state: 'Buenos Aires',
    zipCode: '1000',
    country: 'Argentina',
  },
  features: [],
  units: [],
  images: [],
  ownerId: 'owner-1',
  rentPrice,
  salePrice: operations.includes('sale') ? 120000 : undefined,
  saleCurrency: operations.includes('sale') ? 'USD' : undefined,
  operations,
  operationState: 'available',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const MOCK_PROPERTY_A = createMockProperty('property-1', 'Departamento Palermo', ['rent'], 750000);
const MOCK_PROPERTY_B = createMockProperty('property-2', 'Casa Caballito', ['rent', 'sale'], 980000);

let MOCK_INTERESTED: InterestedProfile[] = [
  {
    id: 'int-1',
    firstName: 'Lucia',
    lastName: 'Perez',
    phone: '+54 9 11 5555-1111',
    email: 'lucia@example.com',
    operation: 'rent',
    operations: ['rent'],
    status: 'interested',
    minAmount: 600000,
    maxAmount: 1000000,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'int-2',
    firstName: 'Diego',
    lastName: 'Ramos',
    phone: '+54 9 11 5555-2222',
    email: 'diego@example.com',
    operation: 'sale',
    operations: ['sale'],
    status: 'buyer',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

let MOCK_MATCHES: InterestedMatch[] = [
  {
    id: 'match-1',
    interestedProfileId: 'int-1',
    propertyId: MOCK_PROPERTY_A.id,
    status: 'suggested',
    score: 92,
    matchReasons: ['operationMatches', 'priceWithinRange', 'cityMatches'],
    property: MOCK_PROPERTY_A,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'match-2',
    interestedProfileId: 'int-1',
    propertyId: MOCK_PROPERTY_B.id,
    status: 'contacted',
    score: 86,
    matchReasons: ['operationMatches', 'featuresMatch'],
    property: MOCK_PROPERTY_B,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

let MOCK_ACTIVITIES: InterestedActivity[] = [
  {
    id: 'activity-1',
    interestedProfileId: 'int-1',
    type: 'call',
    status: 'completed',
    subject: 'Primer contacto',
    body: 'Se coordinó visita para la próxima semana.',
    createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'activity-2',
    interestedProfileId: 'int-1',
    type: 'whatsapp',
    status: 'pending',
    subject: 'Enviar documentación',
    body: 'Falta enviar requisitos de garantía.',
    createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
  },
];

const getProfileOperations = (profile: InterestedProfile): InterestedOperation[] =>
  profile.operations ?? (profile.operation ? [profile.operation] : ['rent']);

const filterMockInterested = (data: InterestedProfile[], filters?: InterestedFilters): InterestedProfile[] => {
  if (!filters) return data;
  return data.filter((profile) => {
    if (filters.name) {
      const needle = filters.name.toLowerCase();
      const fullName = `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.toLowerCase();
      if (
        !fullName.includes(needle) &&
        !(profile.phone ?? '').toLowerCase().includes(needle) &&
        !(profile.email ?? '').toLowerCase().includes(needle)
      ) {
        return false;
      }
    }
    if (filters.operation && !getProfileOperations(profile).includes(filters.operation)) return false;
    if (filters.status && profile.status !== filters.status) return false;
    return true;
  });
};

const fetchInterested = async (filters?: InterestedFilters): Promise<PaginatedResponse<InterestedProfile>> => {
    if (IS_MOCK_MODE) {
      const data = filterMockInterested([...MOCK_INTERESTED], filters);
      return {
        data,
        total: data.length,
        page: 1,
        limit: filters?.limit ?? 100,
      };
    }

    const queryParams = new URLSearchParams();
    if (filters?.name) queryParams.append('name', filters.name);
    if (filters?.phone) queryParams.append('phone', filters.phone);
    if (filters?.operation) queryParams.append('operation', filters.operation);
    if (filters?.propertyTypePreference) queryParams.append('propertyTypePreference', filters.propertyTypePreference);
    if (filters?.status) queryParams.append('status', filters.status);
    if (filters?.qualificationLevel) queryParams.append('qualificationLevel', filters.qualificationLevel);
    if (filters?.page) queryParams.append('page', String(filters.page));
    if (filters?.limit) queryParams.append('limit', String(filters.limit));

    const endpoint = queryParams.toString().length > 0 ? `/interested?${queryParams.toString()}` : '/interested';
    const result = await apiClient.get<PaginatedResponse<any>>(endpoint);
    return {
      ...result,
      data: result.data.map(mapProfile),
    };
};

export const interestedApi = {
  async getAll(): Promise<PaginatedResponse<InterestedProfile>> {
    return fetchInterested();
  },

  async getAllWithFilters(filters?: InterestedFilters): Promise<PaginatedResponse<InterestedProfile>> {
    return fetchInterested(filters);
  },

  async getById(id: string): Promise<InterestedProfile | null> {
    if (IS_MOCK_MODE) {
      return MOCK_INTERESTED.find((item) => item.id === id) ?? null;
    }

    try {
      const result = await apiClient.get<any>(`/interested/${id}`);
      return mapProfile(result);
    } catch {
      return null;
    }
  },

  async create(payload: CreateInterestedProfileInput): Promise<InterestedProfile> {
    if (IS_MOCK_MODE) {
      const now = new Date().toISOString();
      const created: InterestedProfile = {
        id: `int-${Date.now()}`,
        firstName: payload.firstName,
        lastName: payload.lastName,
        phone: payload.phone,
        email: payload.email,
        peopleCount: payload.peopleCount,
        minAmount: payload.minAmount,
        maxAmount: payload.maxAmount,
        hasPets: payload.hasPets,
        guaranteeTypes: payload.guaranteeTypes,
        preferredZones: payload.preferredZones,
        preferredCity: payload.preferredCity,
        desiredFeatures: payload.desiredFeatures,
        propertyTypePreference: payload.propertyTypePreference,
        operation: payload.operation,
        operations: payload.operations,
        status: payload.status,
        qualificationLevel: payload.qualificationLevel,
        qualificationNotes: payload.qualificationNotes,
        source: payload.source,
        assignedToUserId: payload.assignedToUserId,
        organizationName: payload.organizationName,
        customFields: payload.customFields,
        consentContact: payload.consentContact,
        consentRecordedAt: payload.consentRecordedAt?.toISOString(),
        lastContactAt: payload.lastContactAt?.toISOString(),
        nextContactAt: payload.nextContactAt?.toISOString(),
        lostReason: payload.lostReason,
        notes: payload.notes,
        createdAt: now,
        updatedAt: now,
      };
      MOCK_INTERESTED = [created, ...MOCK_INTERESTED];
      return created;
    }

    const result = await apiClient.post<any>('/interested', payload);
    return mapProfile(result);
  },

  async update(id: string, payload: UpdateInterestedProfileInput): Promise<InterestedProfile> {
    if (IS_MOCK_MODE) {
      const index = MOCK_INTERESTED.findIndex((item) => item.id === id);
      if (index < 0) {
        throw new Error('Interested profile not found');
      }

      const current = MOCK_INTERESTED[index];
      const updated: InterestedProfile = {
        ...current,
        ...payload,
        consentRecordedAt:
          payload.consentRecordedAt !== undefined
            ? payload.consentRecordedAt?.toISOString()
            : current.consentRecordedAt,
        lastContactAt:
          payload.lastContactAt !== undefined ? payload.lastContactAt?.toISOString() : current.lastContactAt,
        nextContactAt:
          payload.nextContactAt !== undefined ? payload.nextContactAt?.toISOString() : current.nextContactAt,
        updatedAt: new Date().toISOString(),
      };
      MOCK_INTERESTED[index] = updated;
      return updated;
    }

    const result = await apiClient.patch<any>(`/interested/${id}`, payload);
    return mapProfile(result);
  },

  async delete(id: string): Promise<void> {
    if (IS_MOCK_MODE) {
      MOCK_INTERESTED = MOCK_INTERESTED.filter((item) => item.id !== id);
      MOCK_MATCHES = MOCK_MATCHES.filter((item) => item.interestedProfileId !== id);
      MOCK_ACTIVITIES = MOCK_ACTIVITIES.filter((item) => item.interestedProfileId !== id);
      return;
    }

    await apiClient.delete(`/interested/${id}`);
  },

  async getSummary(id: string): Promise<InterestedSummary> {
    if (IS_MOCK_MODE) {
      const profile = MOCK_INTERESTED.find((item) => item.id === id);
      if (!profile) {
        throw new Error('Interested profile not found');
      }
      return {
        profile,
        stageHistory: [],
        activities: MOCK_ACTIVITIES.filter((item) => item.interestedProfileId === id),
        matches: MOCK_MATCHES.filter((item) => item.interestedProfileId === id),
        visits: [],
      };
    }

    const result = await apiClient.get<any>(`/interested/${id}/summary`);
    return mapSummary(result);
  },

  async addActivity(
    id: string,
    payload: {
      type: InterestedActivity['type'];
      subject: string;
      body?: string;
      dueAt?: string;
      templateName?: string;
      status?: InterestedActivityStatus;
      propertyId?: string;
      markReserved?: boolean;
    },
  ): Promise<InterestedActivity> {
    if (IS_MOCK_MODE) {
      const created: InterestedActivity = {
        id: `activity-${Date.now()}`,
        interestedProfileId: id,
        type: payload.type,
        status: payload.status ?? 'pending',
        subject: payload.subject,
        body: payload.body,
        dueAt: payload.dueAt ? toIso(payload.dueAt) : undefined,
        templateName: payload.templateName,
        metadata: payload.propertyId ? { propertyId: payload.propertyId } : undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      MOCK_ACTIVITIES = [created, ...MOCK_ACTIVITIES];
      return created;
    }

    const result = await apiClient.post<any>(`/interested/${id}/activities`, payload);
    return mapActivity(result);
  },

  async updateMatch(
    id: string,
    matchId: string,
    status: InterestedMatchStatus,
    notes?: string,
  ): Promise<InterestedMatch> {
    if (IS_MOCK_MODE) {
      const index = MOCK_MATCHES.findIndex((item) => item.id === matchId && item.interestedProfileId === id);
      if (index < 0) {
        throw new Error('Match not found');
      }
      const updated: InterestedMatch = {
        ...MOCK_MATCHES[index],
        status,
        notes: notes ?? MOCK_MATCHES[index].notes,
        updatedAt: new Date().toISOString(),
      };
      MOCK_MATCHES[index] = updated;
      return updated;
    }

    const result = await apiClient.patch<any>(`/interested/${id}/matches/${matchId}`, { status, notes });
    return mapMatch(result);
  },

  async convertToTenant(
    id: string,
    payload: {
      email?: string;
      password?: string;
      dni?: string;
      emergencyContactName?: string;
      emergencyContactPhone?: string;
    },
  ): Promise<any> {
    if (IS_MOCK_MODE) {
      const index = MOCK_INTERESTED.findIndex((item) => item.id === id);
      if (index < 0) {
        throw new Error('Interested profile not found');
      }

      const current = MOCK_INTERESTED[index];
      const convertedTenantId = current.convertedToTenantId ?? `tenant-${current.id}`;
      const updated: InterestedProfile = {
        ...current,
        convertedToTenantId: convertedTenantId,
        status: 'tenant',
        updatedAt: new Date().toISOString(),
      };
      MOCK_INTERESTED[index] = updated;
      return {
        profile: updated,
        tenant: { id: convertedTenantId },
      };
    }

    return apiClient.post(`/interested/${id}/convert/tenant`, payload);
  },
};
