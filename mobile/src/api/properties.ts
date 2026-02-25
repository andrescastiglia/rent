import { apiClient } from '@/api/client';
import { IS_MOCK_MODE } from '@/api/env';
import type {
  CreatePropertyInput,
  CreatePropertyMaintenanceTaskInput,
  Property,
  PropertyMaintenanceTask,
  PropertyOperation,
  PropertyOperationState,
  PropertyStatus,
  PropertyType,
  UpdatePropertyInput,
} from '@/types/property';

type PaginatedResponse<T> = { data: T[]; total: number; page: number; limit: number };
type PaginatedItemsResponse<T> = { items: T[]; total: number; page: number; limit: number };

type BackendProperty = {
  id: string;
  name: string;
  description?: string | null;
  propertyType?: string | null;
  status?: string | null;
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressPostalCode?: string | null;
  addressCountry?: string | null;
  ownerId?: string | null;
  ownerWhatsapp?: string | null;
  rentPrice?: number | string | null;
  salePrice?: number | string | null;
  saleCurrency?: string | null;
  operations?: string[] | string | null;
  operationState?: string | null;
  images?: string[] | null;
  features?: Array<{ id?: string; name: string; value?: string | null }> | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

type BackendMaintenanceTask = Partial<PropertyMaintenanceTask> & {
  scheduledDate?: string | Date;
  dueDate?: string | Date;
  date?: string | Date;
  maintenanceDate?: string | Date;
};

let MOCK_PROPERTIES: Property[] = [
  {
    id: '1',
    name: 'Edificio Central',
    type: 'OFFICE',
    status: 'ACTIVE',
    address: {
      street: 'Av. Principal',
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
    rentPrice: 250000,
    operations: ['rent'],
    operationState: 'available',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

let MOCK_MAINTENANCE_TASKS: PropertyMaintenanceTask[] = [
  {
    id: 'maintenance-1',
    propertyId: '1',
    title: 'Revisar calefaccion',
    notes: 'Control anual antes de invierno',
    scheduledAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'maintenance-2',
    propertyId: '1',
    title: 'Cambio de cerradura acceso principal',
    notes: 'Solicitado por administrador',
    scheduledAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const toIso = (value?: string | Date): string => (value ? new Date(value).toISOString() : new Date().toISOString());

const mapType = (value?: string | null): PropertyType => {
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

const mapStatus = (value?: string | null): PropertyStatus => {
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

const toBackendType = (value: PropertyType): string => {
  switch (value) {
    case 'APARTMENT':
      return 'apartment';
    case 'HOUSE':
      return 'house';
    case 'COMMERCIAL':
      return 'commercial';
    case 'OFFICE':
      return 'office';
    case 'WAREHOUSE':
      return 'warehouse';
    case 'LAND':
      return 'land';
    case 'PARKING':
      return 'parking';
    default:
      return 'other';
  }
};

const toBackendStatus = (value: PropertyStatus): string => {
  switch (value) {
    case 'ACTIVE':
      return 'active';
    case 'MAINTENANCE':
      return 'under_maintenance';
    default:
      return 'inactive';
  }
};

const mapOperations = (value?: string[] | string | null): PropertyOperation[] | undefined => {
  const source = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const normalized = source
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is PropertyOperation => item === 'rent' || item === 'sale');
  return normalized.length > 0 ? normalized : undefined;
};

const mapOperationState = (value?: string | null): PropertyOperationState | undefined => {
  switch ((value ?? '').toLowerCase()) {
    case 'available':
      return 'available';
    case 'rented':
      return 'rented';
    case 'reserved':
      return 'reserved';
    case 'sold':
      return 'sold';
    default:
      return undefined;
  }
};

const mapProperty = (raw: BackendProperty): Property => ({
  id: raw.id,
  name: raw.name,
  description: raw.description ?? undefined,
  type: mapType(raw.propertyType),
  status: mapStatus(raw.status),
  address: {
    street: raw.addressStreet ?? '',
    number: raw.addressNumber ?? '',
    city: raw.addressCity ?? '',
    state: raw.addressState ?? '',
    zipCode: raw.addressPostalCode ?? '',
    country: raw.addressCountry ?? 'Argentina',
  },
  features: Array.isArray(raw.features)
    ? raw.features.map((feature, index) => ({
        id: feature.id ?? `feature-${raw.id}-${index}`,
        name: feature.name,
        value: feature.value ?? undefined,
      }))
    : [],
  units: [],
  images: Array.isArray(raw.images) ? raw.images : [],
  ownerId: raw.ownerId ?? '',
  ownerWhatsapp: raw.ownerWhatsapp ?? undefined,
  rentPrice: raw.rentPrice === null || raw.rentPrice === undefined ? undefined : Number(raw.rentPrice),
  salePrice: raw.salePrice === null || raw.salePrice === undefined ? undefined : Number(raw.salePrice),
  saleCurrency: raw.saleCurrency ?? undefined,
  operations: mapOperations(raw.operations),
  operationState: mapOperationState(raw.operationState),
  createdAt: toIso(raw.createdAt),
  updatedAt: toIso(raw.updatedAt),
});

const mapMaintenanceTask = (propertyId: string, raw: BackendMaintenanceTask, index: number): PropertyMaintenanceTask => {
  const scheduledCandidate = raw.scheduledAt ?? raw.scheduledDate ?? raw.dueDate ?? raw.date ?? raw.maintenanceDate;
  return {
    id: raw.id ?? `maintenance-${propertyId}-${index}`,
    propertyId: raw.propertyId ?? propertyId,
    title: raw.title ?? 'Tarea de mantenimiento',
    notes: raw.notes ?? undefined,
    scheduledAt: toIso(scheduledCandidate),
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
  };
};

const toCreatePayload = (value: CreatePropertyInput) => ({
  name: value.name,
  description: value.description,
  propertyType: toBackendType(value.type),
  addressStreet: value.address.street,
  addressNumber: value.address.number,
  addressApartment: value.address.unit,
  addressCity: value.address.city,
  addressState: value.address.state,
  addressPostalCode: value.address.zipCode,
  addressCountry: value.address.country,
  ownerId: value.ownerId,
  ownerWhatsapp: value.ownerWhatsapp,
  images: value.images,
  features: value.features,
  rentPrice: value.rentPrice,
  salePrice: value.salePrice,
  saleCurrency: value.saleCurrency,
  operations: value.operations,
  operationState: value.operationState,
  allowsPets: value.allowsPets,
  acceptedGuaranteeTypes: value.acceptedGuaranteeTypes,
  maxOccupants: value.maxOccupants,
});

const toUpdatePayload = (value: UpdatePropertyInput) => ({
  ...toCreatePayload({
    name: value.name ?? '',
    type: value.type ?? 'OTHER',
    address:
      value.address ??
      ({
        street: '',
        number: '',
        city: '',
        state: '',
        zipCode: '',
        country: '',
      } as CreatePropertyInput['address']),
    description: value.description,
    ownerId: value.ownerId,
    ownerWhatsapp: value.ownerWhatsapp,
    rentPrice: value.rentPrice,
    salePrice: value.salePrice,
    saleCurrency: value.saleCurrency,
    operations: value.operations,
    operationState: value.operationState,
    allowsPets: value.allowsPets,
    acceptedGuaranteeTypes: value.acceptedGuaranteeTypes,
    maxOccupants: value.maxOccupants,
  }),
  status: value.status ? toBackendStatus(value.status) : undefined,
});

export const propertiesApi = {
  async getAll(): Promise<Property[]> {
    if (IS_MOCK_MODE) {
      return [...MOCK_PROPERTIES];
    }

    const result = await apiClient.get<BackendProperty[] | PaginatedResponse<BackendProperty>>('/properties');
    return Array.isArray(result) ? result.map(mapProperty) : result.data.map(mapProperty);
  },

  async getById(id: string): Promise<Property | null> {
    if (IS_MOCK_MODE) {
      return MOCK_PROPERTIES.find((item) => item.id === id) ?? null;
    }

    try {
      const result = await apiClient.get<BackendProperty>(`/properties/${id}`);
      return mapProperty(result);
    } catch {
      return null;
    }
  },

  async create(payload: CreatePropertyInput): Promise<Property> {
    if (IS_MOCK_MODE) {
      const created: Property = {
        id: `property-${Date.now()}`,
        name: payload.name,
        description: payload.description,
        type: payload.type,
        status: 'ACTIVE',
        address: payload.address,
        features:
          payload.features?.map((feature, index) => ({
            id: `feature-${Date.now()}-${index}`,
            name: feature.name,
            value: feature.value,
          })) ?? [],
        units: [],
        images: payload.images ?? [],
        ownerId: payload.ownerId ?? 'owner-1',
        ownerWhatsapp: payload.ownerWhatsapp,
        rentPrice: payload.rentPrice,
        salePrice: payload.salePrice,
        saleCurrency: payload.saleCurrency,
        operations: payload.operations,
        operationState: payload.operationState,
        allowsPets: payload.allowsPets,
        acceptedGuaranteeTypes: payload.acceptedGuaranteeTypes,
        maxOccupants: payload.maxOccupants,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      MOCK_PROPERTIES = [created, ...MOCK_PROPERTIES];
      return created;
    }

    const result = await apiClient.post<BackendProperty>('/properties', toCreatePayload(payload));
    return mapProperty(result);
  },

  async update(id: string, payload: UpdatePropertyInput): Promise<Property> {
    if (IS_MOCK_MODE) {
      const index = MOCK_PROPERTIES.findIndex((item) => item.id === id);
      if (index < 0) {
        throw new Error('Property not found');
      }

      const current = MOCK_PROPERTIES[index];
      const mappedFeatures =
        payload.features?.map((feature, featureIndex) => ({
          id: current.features[featureIndex]?.id ?? `feature-${Date.now()}-${featureIndex}`,
          name: feature.name,
          value: feature.value,
        })) ?? current.features;
      const updated: Property = {
        ...current,
        ...payload,
        address: payload.address ?? current.address,
        features: mappedFeatures,
        updatedAt: new Date().toISOString(),
      };

      MOCK_PROPERTIES[index] = updated;
      return updated;
    }

    const result = await apiClient.patch<BackendProperty>(`/properties/${id}`, toUpdatePayload(payload));
    return mapProperty(result);
  },

  async delete(id: string): Promise<void> {
    if (IS_MOCK_MODE) {
      MOCK_PROPERTIES = MOCK_PROPERTIES.filter((item) => item.id !== id);
      MOCK_MAINTENANCE_TASKS = MOCK_MAINTENANCE_TASKS.filter((task) => task.propertyId !== id);
      return;
    }

    await apiClient.delete(`/properties/${id}`);
  },

  async getMaintenanceTasks(propertyId: string, limit = 5): Promise<PropertyMaintenanceTask[]> {
    if (IS_MOCK_MODE) {
      return [...MOCK_MAINTENANCE_TASKS]
        .filter((task) => task.propertyId === propertyId)
        .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
        .slice(0, limit);
    }

    const response = await apiClient.get<
      BackendMaintenanceTask[] | PaginatedResponse<BackendMaintenanceTask> | PaginatedItemsResponse<BackendMaintenanceTask>
    >(
      `/properties/${propertyId}/visits/maintenance-tasks?limit=${limit}`,
    );

    const rawItems = Array.isArray(response) ? response : 'data' in response ? response.data : response.items;
    return rawItems.map((item, index) => mapMaintenanceTask(propertyId, item, index));
  },

  async createMaintenanceTask(propertyId: string, payload: CreatePropertyMaintenanceTaskInput): Promise<PropertyMaintenanceTask> {
    if (IS_MOCK_MODE) {
      const created: PropertyMaintenanceTask = {
        id: `maintenance-${Date.now()}`,
        propertyId,
        title: payload.title,
        notes: payload.notes,
        scheduledAt: payload.scheduledAt ?? new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      MOCK_MAINTENANCE_TASKS = [created, ...MOCK_MAINTENANCE_TASKS];
      return created;
    }

    return apiClient.post<PropertyMaintenanceTask>(`/properties/${propertyId}/visits/maintenance-tasks`, payload);
  },
};
