import { apiClient, IS_MOCK_MODE } from '../api';
import { getToken } from '../auth';
import {
  InterestedActivity,
  InterestedActivityStatus,
  InterestedDuplicate,
  InterestedFilters,
  InterestedMatch,
  InterestedMatchStatus,
  InterestedMetrics,
  InterestedProfile,
  InterestedStatus,
  InterestedSummary,
  InterestedTimelineItem,
  CreateInterestedProfileInput,
  UpdateInterestedProfileInput,
} from '@/types/interested';
import { Property } from '@/types/property';

type PaginatedResponse<T> = { data: T[]; total: number; page: number; limit: number };

const DELAY = 300;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const MOCK_INTERESTED: InterestedProfile[] = [
  {
    id: 'int-1',
    firstName: 'Lucia',
    lastName: 'Perez',
    phone: '+54 9 11 5555-1111',
    peopleCount: 3,
    minAmount: 70000,
    maxAmount: 120000,
    hasPets: true,
    whiteIncome: true,
    guaranteeTypes: ['Garantia propietaria'],
    preferredCity: 'CABA',
    desiredFeatures: ['balcon', 'pileta'],
    propertyTypePreference: 'house',
    operation: 'sale',
    status: 'new',
    qualificationLevel: 'mql',
    notes: 'Busca casa con patio',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const mapProfile = (raw: any): InterestedProfile => ({
  id: raw.id,
  firstName: raw.firstName,
  lastName: raw.lastName,
  phone: raw.phone,
  email: raw.email,
  peopleCount: raw.peopleCount === null || raw.peopleCount === undefined ? undefined : Number(raw.peopleCount),
  minAmount: raw.minAmount === null || raw.minAmount === undefined ? undefined : Number(raw.minAmount),
  maxAmount: raw.maxAmount === null || raw.maxAmount === undefined ? undefined : Number(raw.maxAmount),
  hasPets: raw.hasPets,
  whiteIncome: raw.whiteIncome,
  guaranteeTypes: Array.isArray(raw.guaranteeTypes) ? raw.guaranteeTypes : [],
  preferredZones: Array.isArray(raw.preferredZones) ? raw.preferredZones : [],
  preferredCity: raw.preferredCity,
  desiredFeatures: Array.isArray(raw.desiredFeatures) ? raw.desiredFeatures : [],
  propertyTypePreference: raw.propertyTypePreference,
  operation: raw.operation,
  status: raw.status,
  qualificationLevel: raw.qualificationLevel,
  qualificationNotes: raw.qualificationNotes,
  source: raw.source,
  assignedToUserId: raw.assignedToUserId,
  organizationName: raw.organizationName,
  customFields: raw.customFields,
  lastContactAt: raw.lastContactAt ? new Date(raw.lastContactAt).toISOString() : undefined,
  nextContactAt: raw.nextContactAt ? new Date(raw.nextContactAt).toISOString() : undefined,
  lostReason: raw.lostReason,
  consentContact: raw.consentContact,
  consentRecordedAt: raw.consentRecordedAt ? new Date(raw.consentRecordedAt).toISOString() : undefined,
  convertedToTenantId: raw.convertedToTenantId,
  convertedToSaleAgreementId: raw.convertedToSaleAgreementId,
  notes: raw.notes,
  createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : new Date().toISOString(),
  updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : new Date().toISOString(),
});

const mapActivity = (raw: any): InterestedActivity => ({
  id: raw.id,
  interestedProfileId: raw.interestedProfileId,
  type: raw.type,
  status: raw.status,
  subject: raw.subject,
  body: raw.body,
  dueAt: raw.dueAt ? new Date(raw.dueAt).toISOString() : undefined,
  completedAt: raw.completedAt ? new Date(raw.completedAt).toISOString() : undefined,
  templateName: raw.templateName,
  metadata: raw.metadata,
  createdByUserId: raw.createdByUserId,
  createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : new Date().toISOString(),
  updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : new Date().toISOString(),
});

const mapProperty = (raw: any): Property => ({
  id: raw.id,
  name: raw.name,
  description: raw.description,
  type:
    raw.propertyType === 'apartment'
      ? 'APARTMENT'
      : raw.propertyType === 'house'
        ? 'HOUSE'
        : raw.propertyType === 'commercial'
          ? 'COMMERCIAL'
          : raw.propertyType === 'office'
            ? 'OFFICE'
            : raw.propertyType === 'warehouse'
              ? 'WAREHOUSE'
            : raw.propertyType === 'land'
              ? 'LAND'
              : raw.propertyType === 'parking'
                ? 'PARKING'
              : 'OTHER',
  status: (raw.status === 'active' ? 'ACTIVE' : raw.status === 'under_maintenance' ? 'MAINTENANCE' : 'INACTIVE'),
  address: {
    street: raw.addressStreet ?? '',
    number: raw.addressNumber ?? '',
    unit: raw.addressApartment ?? undefined,
    city: raw.addressCity ?? '',
    state: raw.addressState ?? '',
    zipCode: raw.addressPostalCode ?? '',
    country: raw.addressCountry ?? 'Argentina',
  },
  features: [],
  units: Array.isArray(raw.units)
    ? raw.units.map((unit: any) => ({
        id: unit.id,
        unitNumber: unit.unitNumber,
        floor: unit.floor,
        bedrooms: Number(unit.bedrooms ?? 0),
        bathrooms: Number(unit.bathrooms ?? 0),
        area: Number(unit.area ?? 0),
        status:
          unit.status === 'occupied'
            ? 'OCCUPIED'
            : unit.status === 'maintenance'
              ? 'MAINTENANCE'
              : 'AVAILABLE',
        rentAmount: Number(unit.baseRent ?? 0),
      }))
    : [],
  images: [],
  ownerId: raw.ownerId ?? '',
  createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : new Date().toISOString(),
  updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : new Date().toISOString(),
  salePrice: raw.salePrice === null || raw.salePrice === undefined ? undefined : Number(raw.salePrice),
  saleCurrency: raw.saleCurrency,
  allowsPets: raw.allowsPets,
  requiresWhiteIncome: raw.requiresWhiteIncome,
  acceptedGuaranteeTypes: raw.acceptedGuaranteeTypes,
  maxOccupants: raw.maxOccupants,
});

const mapMatch = (raw: any): InterestedMatch => ({
  id: raw.id,
  interestedProfileId: raw.interestedProfileId,
  propertyId: raw.propertyId,
  status: raw.status,
  score: raw.score === null || raw.score === undefined ? undefined : Number(raw.score),
  matchReasons: Array.isArray(raw.matchReasons) ? raw.matchReasons : [],
  contactedAt: raw.contactedAt ? new Date(raw.contactedAt).toISOString() : undefined,
  notes: raw.notes,
  property: raw.property ? mapProperty(raw.property) : undefined,
  createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : new Date().toISOString(),
  updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : new Date().toISOString(),
});

export const interestedApi = {
  getAll: async (filters?: InterestedFilters): Promise<PaginatedResponse<InterestedProfile>> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      let data = [...MOCK_INTERESTED];
      if (filters?.name) {
        const term = filters.name.toLowerCase();
        data = data.filter((p) => `${p.firstName ?? ''} ${p.lastName ?? ''}`.toLowerCase().includes(term));
      }
      if (filters?.status) data = data.filter((p) => p.status === filters.status);
      return { data, total: data.length, page: 1, limit: 10 };
    }

    const token = getToken();
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
    const result = await apiClient.get<PaginatedResponse<any>>(endpoint, token ?? undefined);

    return {
      ...result,
      data: result.data.map(mapProfile),
    };
  },

  create: async (data: CreateInterestedProfileInput): Promise<InterestedProfile> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const newProfile: InterestedProfile = {
        id: `int-${Math.random().toString(36).slice(2)}`,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        email: data.email,
        peopleCount: data.peopleCount,
        minAmount: data.minAmount,
        maxAmount: data.maxAmount,
        hasPets: data.hasPets,
        whiteIncome: data.whiteIncome,
        guaranteeTypes: data.guaranteeTypes,
        preferredZones: data.preferredZones,
        preferredCity: data.preferredCity,
        desiredFeatures: data.desiredFeatures,
        propertyTypePreference: data.propertyTypePreference,
        operation: data.operation,
        status: data.status,
        qualificationLevel: data.qualificationLevel,
        qualificationNotes: data.qualificationNotes,
        source: data.source,
        assignedToUserId: data.assignedToUserId,
        organizationName: data.organizationName,
        customFields: data.customFields,
        lastContactAt: data.lastContactAt ? new Date(data.lastContactAt).toISOString() : undefined,
        nextContactAt: data.nextContactAt ? new Date(data.nextContactAt).toISOString() : undefined,
        lostReason: data.lostReason,
        consentContact: data.consentContact,
        consentRecordedAt: data.consentRecordedAt ? new Date(data.consentRecordedAt).toISOString() : undefined,
        notes: data.notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      MOCK_INTERESTED.unshift(newProfile);
      return newProfile;
    }

    const token = getToken();
    const result = await apiClient.post<any>('/interested', data, token ?? undefined);
    return mapProfile(result);
  },

  update: async (id: string, data: UpdateInterestedProfileInput): Promise<InterestedProfile> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const index = MOCK_INTERESTED.findIndex((p) => p.id === id);
      if (index === -1) throw new Error('Interested profile not found');
      MOCK_INTERESTED[index] = {
        ...MOCK_INTERESTED[index],
        ...data,
        lastContactAt: data.lastContactAt ? new Date(data.lastContactAt).toISOString() : MOCK_INTERESTED[index].lastContactAt,
        nextContactAt: data.nextContactAt ? new Date(data.nextContactAt).toISOString() : MOCK_INTERESTED[index].nextContactAt,
        consentRecordedAt: data.consentRecordedAt
          ? new Date(data.consentRecordedAt).toISOString()
          : MOCK_INTERESTED[index].consentRecordedAt,
        updatedAt: new Date().toISOString(),
      };
      return MOCK_INTERESTED[index];
    }

    const token = getToken();
    const result = await apiClient.patch<any>(`/interested/${id}`, data, token ?? undefined);
    return mapProfile(result);
  },

  remove: async (id: string): Promise<void> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const index = MOCK_INTERESTED.findIndex((p) => p.id === id);
      if (index !== -1) MOCK_INTERESTED.splice(index, 1);
      return;
    }

    const token = getToken();
    await apiClient.delete(`/interested/${id}`, token ?? undefined);
  },

  getSummary: async (id: string): Promise<InterestedSummary> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const profile = MOCK_INTERESTED.find((item) => item.id === id);
      if (!profile) throw new Error('Not found');
      return {
        profile,
        stageHistory: [],
        activities: [],
        matches: [],
        visits: [],
      };
    }

    const token = getToken();
    const result = await apiClient.get<any>(`/interested/${id}/summary`, token ?? undefined);
    return {
      profile: mapProfile(result.profile),
      stageHistory: (result.stageHistory ?? []).map((item: any) => ({
        ...item,
        changedAt: new Date(item.changedAt).toISOString(),
      })),
      activities: (result.activities ?? []).map(mapActivity),
      matches: (result.matches ?? []).map(mapMatch),
      visits: (result.visits ?? []).map((visit: any) => ({
        id: visit.id,
        propertyId: visit.propertyId,
        visitedAt: new Date(visit.visitedAt).toISOString(),
        interestedName: visit.interestedName,
        comments: visit.comments,
        hasOffer: visit.hasOffer,
        offerAmount: visit.offerAmount === null || visit.offerAmount === undefined ? undefined : Number(visit.offerAmount),
        offerCurrency: visit.offerCurrency,
        property: visit.property ? mapProperty(visit.property) : undefined,
      })),
    };
  },

  getTimeline: async (id: string): Promise<InterestedTimelineItem[]> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      return [];
    }

    const token = getToken();
    const result = await apiClient.get<any[]>(`/interested/${id}/timeline`, token ?? undefined);
    return result.map((item) => ({
      ...item,
      at: new Date(item.at).toISOString(),
    }));
  },

  refreshMatches: async (id: string): Promise<InterestedMatch[]> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      return [];
    }

    const token = getToken();
    const result = await apiClient.post<any[]>(`/interested/${id}/matches/refresh`, {}, token ?? undefined);
    return result.map(mapMatch);
  },

  updateMatch: async (
    id: string,
    matchId: string,
    status: InterestedMatchStatus,
    notes?: string,
  ): Promise<InterestedMatch> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      throw new Error('Not available in mock');
    }

    const token = getToken();
    const result = await apiClient.patch<any>(`/interested/${id}/matches/${matchId}`, { status, notes }, token ?? undefined);
    return mapMatch(result);
  },

  changeStage: async (id: string, toStatus: InterestedStatus, reason?: string): Promise<InterestedProfile> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const profile = MOCK_INTERESTED.find((item) => item.id === id);
      if (!profile) throw new Error('Not found');
      profile.status = toStatus;
      profile.updatedAt = new Date().toISOString();
      return profile;
    }

    const token = getToken();
    const result = await apiClient.post<any>(`/interested/${id}/stage`, { toStatus, reason }, token ?? undefined);
    return mapProfile(result);
  },

  addActivity: async (
    id: string,
    payload: {
      type: InterestedActivity['type'];
      subject: string;
      body?: string;
      dueAt?: string;
      templateName?: string;
      status?: InterestedActivityStatus;
    },
  ): Promise<InterestedActivity> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      return {
        id: `act-${Math.random().toString(36).slice(2)}`,
        interestedProfileId: id,
        createdByUserId: 'mock-user',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...payload,
        status: payload.status ?? 'pending',
      };
    }

    const token = getToken();
    const result = await apiClient.post<any>(`/interested/${id}/activities`, payload, token ?? undefined);
    return mapActivity(result);
  },

  updateActivity: async (
    id: string,
    activityId: string,
    payload: Partial<{
      type: InterestedActivity['type'];
      subject: string;
      body?: string;
      dueAt?: string;
      completedAt?: string;
      status?: InterestedActivityStatus;
      templateName?: string;
      metadata?: Record<string, unknown>;
    }>,
  ): Promise<InterestedActivity> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      throw new Error('Not available in mock');
    }

    const token = getToken();
    const result = await apiClient.patch<any>(`/interested/${id}/activities/${activityId}`, payload, token ?? undefined);
    return mapActivity(result);
  },

  getMetrics: async (): Promise<InterestedMetrics> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      return {
        byStage: { new: 1 },
        totalLeads: MOCK_INTERESTED.length,
        conversionRate: 0,
        avgHoursToClose: 0,
        activityByAgent: [],
      };
    }

    const token = getToken();
    return apiClient.get<InterestedMetrics>('/interested/metrics/overview', token ?? undefined);
  },

  getDuplicates: async (): Promise<InterestedDuplicate[]> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      return [];
    }

    const token = getToken();
    return apiClient.get<InterestedDuplicate[]>('/interested/duplicates', token ?? undefined);
  },

  convertToTenant: async (
    id: string,
    payload: {
      email?: string;
      password?: string;
      dni?: string;
      emergencyContactName?: string;
      emergencyContactPhone?: string;
    },
  ): Promise<any> => {
    const token = getToken();
    return apiClient.post(`/interested/${id}/convert/tenant`, payload, token ?? undefined);
  },

  convertToBuyer: async (
    id: string,
    payload: {
      folderId: string;
      totalAmount: number;
      installmentAmount: number;
      installmentCount: number;
      startDate: string;
      currency?: string;
      notes?: string;
    },
  ): Promise<any> => {
    const token = getToken();
    return apiClient.post(`/interested/${id}/convert/buyer`, payload, token ?? undefined);
  },

  getMatches: async (id: string): Promise<Property[]> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      return [];
    }

    const token = getToken();
    const result = await apiClient.get<any[]>(`/interested/${id}/matches`, token ?? undefined);
    return result.map((item) => item.property).filter(Boolean).map(mapProperty);
  },
};
