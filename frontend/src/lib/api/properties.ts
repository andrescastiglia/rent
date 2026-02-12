import {
  Property,
  CreatePropertyInput,
  UpdatePropertyInput,
  PropertyMaintenanceTask,
  CreatePropertyMaintenanceTaskInput,
  PropertyFilters,
} from "@/types/property";
import { apiClient } from "../api";
import { getToken, getUser } from "../auth";

type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
};

type BackendUnit = {
  id: string;
  unitNumber: string;
  floor?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  area?: number | null;
  status?: string | null;
  baseRent?: number | null;
};

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
  images?: any[] | null;
  ownerId?: string | null;
  ownerWhatsapp?: string | null;
  rentPrice?: number | string | null;
  salePrice?: number | string | null;
  saleCurrency?: string | null;
  operations?: string[] | null;
  operationState?: string | null;
  allowsPets?: boolean | null;
  acceptedGuaranteeTypes?: string[] | null;
  maxOccupants?: number | null;
  units?: BackendUnit[] | null;
  features?: any[] | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

type BackendPropertyVisit = {
  id: string;
  propertyId: string;
  visitedAt: string | Date;
  interestedName: string;
  comments?: string | null;
  hasOffer?: boolean | null;
  offerAmount?: number | string | null;
  offerCurrency?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

type BackendCreatePropertyPayload = {
  companyId?: string;
  ownerId?: string;
  name: string;
  ownerWhatsapp?: string;
  propertyType: string;
  addressStreet: string;
  addressNumber?: string;
  addressApartment?: string;
  addressCity: string;
  addressState?: string;
  addressCountry?: string;
  addressPostalCode?: string;
  description?: string;
  rentPrice?: number;
  salePrice?: number;
  saleCurrency?: string;
  operations?: Array<"rent" | "sale">;
  operationState?: "available" | "rented" | "reserved" | "sold";
  allowsPets?: boolean;
  acceptedGuaranteeTypes?: string[];
  maxOccupants?: number;
  images?: string[];
};

type BackendUpdatePropertyPayload = Partial<
  Omit<BackendCreatePropertyPayload, "companyId" | "ownerId">
> & {
  ownerId?: string;
  status?: "active" | "inactive" | "under_maintenance";
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

const isPaginatedResponse = <T>(value: any): value is PaginatedResponse<T> => {
  return !!value && typeof value === "object" && Array.isArray(value.data);
};

const isUuid = (value: string | null | undefined): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

const normalizeImages = (images: any[] | null | undefined): string[] => {
  if (!Array.isArray(images)) return [];
  return images
    .map((img) => {
      if (typeof img === "string") return img;
      if (img && typeof img === "object") {
        if (typeof img.url === "string") return img.url;
        if (typeof img.path === "string") return img.path;
      }
      return null;
    })
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .map(normalizePropertyImageUrl);
};

const normalizePropertyImageUrl = (url: string): string => {
  if (!url) return url;
  const normalizeApiPathWithBase = (path: string): string => {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    if (!API_BASE_URL) return normalizedPath;
    try {
      const base = API_BASE_URL.endsWith("/")
        ? API_BASE_URL
        : `${API_BASE_URL}/`;
      const resolved = new URL(normalizedPath.replace(/^\/+/, ""), base);
      if (
        typeof window !== "undefined" &&
        window.location.protocol === "https:"
      ) {
        resolved.protocol = "https:";
      }
      return resolved.toString();
    } catch {
      return normalizedPath;
    }
  };

  if (
    url.startsWith("/uploads/") ||
    url.startsWith("uploads/") ||
    url.startsWith("/properties/images/") ||
    url.startsWith("properties/images/")
  ) {
    return normalizeApiPathWithBase(url);
  }
  try {
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return url;
    }

    const parsed = new URL(url);
    if (
      parsed.pathname.startsWith("/uploads/") ||
      parsed.pathname.startsWith("/properties/images/")
    ) {
      return normalizeApiPathWithBase(`${parsed.pathname}${parsed.search}`);
    }
    if (parsed.hostname === "rent.maese.com.ar") {
      parsed.protocol = "https:";
      return parsed.toString();
    }
    if (
      typeof window !== "undefined" &&
      window.location.protocol === "https:"
    ) {
      parsed.protocol = "https:";
      return parsed.toString();
    }
    return url;
  } catch {
    return url;
  }
};

const mapPropertyType = (
  value: string | null | undefined,
): Property["type"] => {
  switch ((value ?? "").toLowerCase()) {
    case "apartment":
      return "APARTMENT";
    case "house":
      return "HOUSE";
    case "commercial":
      return "COMMERCIAL";
    case "office":
      return "OFFICE";
    case "warehouse":
      return "WAREHOUSE";
    case "land":
      return "LAND";
    case "parking":
      return "PARKING";
    default:
      return "OTHER";
  }
};

const mapPropertyStatus = (
  value: string | null | undefined,
): Property["status"] => {
  switch ((value ?? "").toLowerCase()) {
    case "active":
      return "ACTIVE";
    case "under_maintenance":
    case "maintenance":
      return "MAINTENANCE";
    default:
      return "INACTIVE";
  }
};

const mapFrontendPropertyTypeToBackend = (
  value: Property["type"] | undefined,
): string | undefined => {
  switch (value) {
    case "APARTMENT":
      return "apartment";
    case "HOUSE":
      return "house";
    case "COMMERCIAL":
      return "commercial";
    case "OFFICE":
      return "office";
    case "WAREHOUSE":
      return "warehouse";
    case "LAND":
      return "land";
    case "PARKING":
      return "parking";
    case "OTHER":
      return "other";
    default:
      return undefined;
  }
};

const mapFrontendPropertyStatusToBackend = (
  value: Property["status"] | undefined,
): "active" | "inactive" | "under_maintenance" | undefined => {
  switch (value) {
    case "ACTIVE":
      return "active";
    case "INACTIVE":
      return "inactive";
    case "MAINTENANCE":
      return "under_maintenance";
    default:
      return undefined;
  }
};

const serializeCreatePayload = (
  data: CreatePropertyInput,
): BackendCreatePropertyPayload => {
  const backendType = mapFrontendPropertyTypeToBackend(data.type) ?? "other";
  const ownerId = isUuid(data.ownerId) ? data.ownerId : undefined;
  return {
    ownerId,
    name: data.name,
    ownerWhatsapp: data.ownerWhatsapp,
    propertyType: backendType,
    addressStreet: data.address.street,
    addressNumber: data.address.number,
    addressApartment: data.address.unit,
    addressCity: data.address.city,
    addressState: data.address.state,
    addressCountry: data.address.country,
    addressPostalCode: data.address.zipCode,
    description: data.description,
    rentPrice: data.rentPrice,
    salePrice: data.salePrice,
    saleCurrency: data.saleCurrency,
    operations: data.operations,
    operationState: data.operationState,
    allowsPets: data.allowsPets,
    acceptedGuaranteeTypes: data.acceptedGuaranteeTypes,
    maxOccupants: data.maxOccupants,
    images: Array.isArray(data.images)
      ? data.images.map(normalizePropertyImageUrl)
      : undefined,
  };
};

const serializeUpdatePayload = (
  data: UpdatePropertyInput,
): BackendUpdatePropertyPayload => {
  const payload: BackendUpdatePropertyPayload = {};
  const backendType = mapFrontendPropertyTypeToBackend(data.type);
  if (backendType) payload.propertyType = backendType;
  const backendStatus = mapFrontendPropertyStatusToBackend(data.status);
  if (backendStatus) payload.status = backendStatus;
  if (data.name !== undefined) payload.name = data.name;
  if (data.ownerWhatsapp !== undefined)
    payload.ownerWhatsapp = data.ownerWhatsapp;
  if (data.address?.street !== undefined)
    payload.addressStreet = data.address.street;
  if (data.address?.number !== undefined)
    payload.addressNumber = data.address.number;
  if (data.address?.unit !== undefined)
    payload.addressApartment = data.address.unit;
  if (data.address?.city !== undefined) payload.addressCity = data.address.city;
  if (data.address?.state !== undefined)
    payload.addressState = data.address.state;
  if (data.address?.country !== undefined)
    payload.addressCountry = data.address.country;
  if (data.address?.zipCode !== undefined)
    payload.addressPostalCode = data.address.zipCode;
  if (data.description !== undefined) payload.description = data.description;
  if (data.rentPrice !== undefined) payload.rentPrice = data.rentPrice;
  if (data.salePrice !== undefined) payload.salePrice = data.salePrice;
  if (data.saleCurrency !== undefined) payload.saleCurrency = data.saleCurrency;
  if (data.operations !== undefined) payload.operations = data.operations;
  if (data.operationState !== undefined)
    payload.operationState = data.operationState;
  if (data.allowsPets !== undefined) payload.allowsPets = data.allowsPets;
  if (data.acceptedGuaranteeTypes !== undefined)
    payload.acceptedGuaranteeTypes = data.acceptedGuaranteeTypes;
  if (data.maxOccupants !== undefined) payload.maxOccupants = data.maxOccupants;
  if (data.images !== undefined) {
    payload.images = data.images.map(normalizePropertyImageUrl);
  }
  if (isUuid(data.ownerId)) {
    payload.ownerId = data.ownerId;
  }
  return payload;
};

const mapUnitStatus = (
  value: string | null | undefined,
): Property["units"][number]["status"] => {
  switch ((value ?? "").toLowerCase()) {
    case "available":
      return "AVAILABLE";
    case "occupied":
      return "OCCUPIED";
    case "maintenance":
      return "MAINTENANCE";
    default:
      return "AVAILABLE";
  }
};

const mapOperationState = (
  value: string | null | undefined,
): NonNullable<Property["operationState"]> => {
  switch ((value ?? "").toLowerCase()) {
    case "rented":
      return "rented";
    case "reserved":
      return "reserved";
    case "sold":
      return "sold";
    default:
      return "available";
  }
};

const mapBackendUnitToUnit = (raw: BackendUnit): Property["units"][number] => {
  return {
    id: raw.id,
    unitNumber: raw.unitNumber,
    floor: raw.floor ?? undefined,
    bedrooms: Number(raw.bedrooms ?? 0),
    bathrooms: Number(raw.bathrooms ?? 0),
    area: Number(raw.area ?? 0),
    status: mapUnitStatus(raw.status),
    rentAmount: Number(raw.baseRent ?? 0),
  };
};

const mapBackendPropertyToProperty = (raw: BackendProperty): Property => {
  const backendOperations = Array.isArray(raw.operations)
    ? raw.operations.filter((item): item is string => typeof item === "string")
    : [];
  const normalizedOperations = backendOperations
    .map((item) => item.toLowerCase())
    .filter(
      (item): item is "rent" | "sale" => item === "rent" || item === "sale",
    );
  const operations: Property["operations"] =
    normalizedOperations.length > 0
      ? normalizedOperations
      : raw.rentPrice !== undefined && raw.rentPrice !== null
        ? raw.salePrice !== undefined && raw.salePrice !== null
          ? ["rent", "sale"]
          : ["rent"]
        : raw.salePrice !== undefined && raw.salePrice !== null
          ? ["sale"]
          : ["rent"];

  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? undefined,
    type: mapPropertyType(raw.propertyType),
    status: mapPropertyStatus(raw.status),
    address: {
      street: raw.addressStreet ?? "",
      number: raw.addressNumber ?? "",
      unit: undefined,
      city: raw.addressCity ?? "",
      state: raw.addressState ?? "",
      zipCode: raw.addressPostalCode ?? "",
      country: raw.addressCountry ?? "Argentina",
    },
    features: Array.isArray(raw.features)
      ? raw.features
          .map((f: any) => {
            const id =
              typeof f?.id === "string"
                ? f.id
                : Math.random().toString(36).slice(2);
            const name =
              typeof f?.name === "string"
                ? f.name
                : String(f?.featureName ?? f?.key ?? "");
            const value = typeof f?.value === "string" ? f.value : undefined;
            return { id, name, value };
          })
          .filter((f) => !!f.name)
      : [],
    units: Array.isArray(raw.units) ? raw.units.map(mapBackendUnitToUnit) : [],
    images: normalizeImages(raw.images),
    ownerId: raw.ownerId ?? "",
    ownerWhatsapp: raw.ownerWhatsapp ?? undefined,
    rentPrice:
      raw.rentPrice !== undefined && raw.rentPrice !== null
        ? Number(raw.rentPrice)
        : undefined,
    salePrice:
      raw.salePrice !== undefined && raw.salePrice !== null
        ? Number(raw.salePrice)
        : undefined,
    saleCurrency: raw.saleCurrency ?? undefined,
    operations,
    operationState: mapOperationState(raw.operationState),
    allowsPets: raw.allowsPets ?? true,
    acceptedGuaranteeTypes: Array.isArray(raw.acceptedGuaranteeTypes)
      ? raw.acceptedGuaranteeTypes
      : [],
    maxOccupants:
      raw.maxOccupants !== undefined && raw.maxOccupants !== null
        ? Number(raw.maxOccupants)
        : undefined,
    createdAt: raw.createdAt
      ? new Date(raw.createdAt).toISOString()
      : new Date().toISOString(),
    updatedAt: raw.updatedAt
      ? new Date(raw.updatedAt).toISOString()
      : new Date().toISOString(),
  };
};

const mapBackendVisitToMaintenanceTask = (
  raw: BackendPropertyVisit,
): PropertyMaintenanceTask => {
  return {
    id: raw.id,
    propertyId: raw.propertyId,
    scheduledAt: raw.visitedAt
      ? new Date(raw.visitedAt).toISOString()
      : new Date().toISOString(),
    title: raw.interestedName,
    notes: raw.comments ?? undefined,
    createdAt: raw.createdAt
      ? new Date(raw.createdAt).toISOString()
      : new Date().toISOString(),
    updatedAt: raw.updatedAt
      ? new Date(raw.updatedAt).toISOString()
      : new Date().toISOString(),
  };
};

// Mock data for development/testing
const MOCK_PROPERTIES: Property[] = [
  {
    id: "1",
    name: "Edificio Central",
    description: "Edificio de oficinas en el centro",
    type: "OFFICE",
    status: "ACTIVE",
    address: {
      street: "Av. Principal",
      number: "123",
      city: "Ciudad",
      state: "Estado",
      zipCode: "12345",
      country: "País",
    },
    features: [],
    units: [],
    images: ["/placeholder-property.svg"],
    ownerId: "owner1",
    ownerWhatsapp: "+54 9 11 5555-1234",
    rentPrice: 125000,
    salePrice: 150000,
    saleCurrency: "USD",
    operations: ["rent", "sale"],
    operationState: "available",
    allowsPets: true,
    acceptedGuaranteeTypes: ["Garantía propietaria"],
    maxOccupants: 10,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "2",
    name: "Casa Los Pinos",
    description: "Hermosa casa familiar",
    type: "HOUSE",
    status: "ACTIVE",
    address: {
      street: "Los Pinos",
      number: "456",
      city: "Ciudad",
      state: "Estado",
      zipCode: "12345",
      country: "País",
    },
    features: [],
    units: [],
    images: ["/placeholder-property.svg"],
    ownerId: "owner2",
    ownerWhatsapp: "+54 9 11 5555-5678",
    rentPrice: 89000,
    salePrice: 98000,
    saleCurrency: "USD",
    operations: ["rent", "sale"],
    operationState: "available",
    allowsPets: false,
    acceptedGuaranteeTypes: ["Seguro de caución"],
    maxOccupants: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const MOCK_MAINTENANCE_TASKS: Record<string, PropertyMaintenanceTask[]> = {
  "1": [
    {
      id: "visit-1",
      propertyId: "1",
      scheduledAt: new Date().toISOString(),
      title: "Revisión de instalación eléctrica",
      notes: "Chequeo preventivo trimestral en pasillos.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  "2": [],
};

// Use mock data in test/CI environments, real API in production
const IS_MOCK_MODE =
  process.env.NODE_ENV === "test" ||
  process.env.NEXT_PUBLIC_MOCK_MODE === "true" ||
  process.env.CI === "true";

const DELAY = 500;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const propertiesApi = {
  getAll: async (filters?: PropertyFilters): Promise<Property[]> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      let filtered = [...MOCK_PROPERTIES];
      if (filters?.ownerId) {
        filtered = filtered.filter((p) => p.ownerId === filters.ownerId);
      }
      if (filters?.minSalePrice !== undefined) {
        filtered = filtered.filter(
          (p) => (p.salePrice ?? 0) >= filters.minSalePrice!,
        );
      }
      if (filters?.maxSalePrice !== undefined) {
        filtered = filtered.filter(
          (p) => (p.salePrice ?? 0) <= filters.maxSalePrice!,
        );
      }
      if (filters?.minRent !== undefined) {
        filtered = filtered.filter(
          (p) => (p.rentPrice ?? 0) >= filters.minRent!,
        );
      }
      if (filters?.maxRent !== undefined) {
        filtered = filtered.filter(
          (p) => (p.rentPrice ?? 0) <= filters.maxRent!,
        );
      }
      return filtered;
    }

    const token = getToken();
    const queryParams = new URLSearchParams();
    if (filters?.ownerId) queryParams.append("ownerId", filters.ownerId);
    if (filters?.addressCity)
      queryParams.append("addressCity", filters.addressCity);
    if (filters?.addressState)
      queryParams.append("addressState", filters.addressState);
    if (filters?.propertyType) {
      const backendType = mapFrontendPropertyTypeToBackend(
        filters.propertyType,
      );
      if (backendType) {
        queryParams.append("propertyType", backendType);
      }
    }
    if (filters?.status) {
      const backendStatus = mapFrontendPropertyStatusToBackend(filters.status);
      if (backendStatus) {
        queryParams.append("status", backendStatus);
      }
    }
    if (filters?.minRent !== undefined)
      queryParams.append("minRent", String(filters.minRent));
    if (filters?.maxRent !== undefined)
      queryParams.append("maxRent", String(filters.maxRent));
    if (filters?.minSalePrice !== undefined)
      queryParams.append("minSalePrice", String(filters.minSalePrice));
    if (filters?.maxSalePrice !== undefined)
      queryParams.append("maxSalePrice", String(filters.maxSalePrice));
    if (filters?.bedrooms !== undefined)
      queryParams.append("bedrooms", String(filters.bedrooms));
    if (filters?.bathrooms !== undefined)
      queryParams.append("bathrooms", String(filters.bathrooms));
    if (filters?.page) queryParams.append("page", String(filters.page));
    if (filters?.limit) queryParams.append("limit", String(filters.limit));

    const endpoint =
      queryParams.toString().length > 0
        ? `/properties?${queryParams.toString()}`
        : "/properties";
    const result = await apiClient.get<
      PaginatedResponse<BackendProperty> | BackendProperty[] | any
    >(endpoint, token ?? undefined);

    if (Array.isArray(result)) {
      return result.map(mapBackendPropertyToProperty);
    }

    if (isPaginatedResponse<BackendProperty>(result)) {
      return result.data.map(mapBackendPropertyToProperty);
    }

    throw new Error("Unexpected response shape from /properties");
  },

  getById: async (id: string): Promise<Property | null> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const normalizedId = decodeURIComponent(id).split("?")[0];
      return MOCK_PROPERTIES.find((p) => p.id === normalizedId) || null;
    }

    const token = getToken();
    try {
      const result = await apiClient.get<BackendProperty>(
        `/properties/${id}`,
        token ?? undefined,
      );
      return mapBackendPropertyToProperty(result);
    } catch {
      return null;
    }
  },

  create: async (data: CreatePropertyInput): Promise<Property> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const currentUserId = getUser()?.id;
      const newProperty: Property = {
        ...data,
        images: data.images || [],
        id: Math.random().toString(36).substr(2, 9),
        status: "ACTIVE",
        ownerId: data.ownerId ?? currentUserId ?? "owner-1",
        features: (data.features || []).map((f) => ({
          ...f,
          id: Math.random().toString(36).substr(2, 9),
        })),
        units: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      MOCK_PROPERTIES.push(newProperty);
      return newProperty;
    }

    const token = getToken();
    const payload = serializeCreatePayload(data);
    const result = await apiClient.post<BackendProperty>(
      "/properties",
      payload,
      token ?? undefined,
    );
    return mapBackendPropertyToProperty(result);
  },

  update: async (id: string, data: UpdatePropertyInput): Promise<Property> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const index = MOCK_PROPERTIES.findIndex((p) => p.id === id);
      if (index === -1) throw new Error("Property not found");

      const updatedFeatures = data.features
        ? data.features.map((f) => ({
            ...f,
            id: Math.random().toString(36).substr(2, 9),
          }))
        : MOCK_PROPERTIES[index].features;

      const updatedProperty: Property = {
        ...MOCK_PROPERTIES[index],
        ...data,
        features: updatedFeatures,
        updatedAt: new Date().toISOString(),
      };
      MOCK_PROPERTIES[index] = updatedProperty;
      return updatedProperty;
    }

    const token = getToken();
    const payload = serializeUpdatePayload(data);
    const result = await apiClient.patch<BackendProperty>(
      `/properties/${id}`,
      payload,
      token ?? undefined,
    );
    return mapBackendPropertyToProperty(result);
  },

  getMaintenanceTasks: async (
    propertyId: string,
  ): Promise<PropertyMaintenanceTask[]> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      return MOCK_MAINTENANCE_TASKS[propertyId] ?? [];
    }

    const token = getToken();
    const result = await apiClient.get<BackendPropertyVisit[]>(
      `/properties/${propertyId}/visits/maintenance-tasks`,
      token ?? undefined,
    );
    return Array.isArray(result)
      ? result.map(mapBackendVisitToMaintenanceTask)
      : [];
  },

  createMaintenanceTask: async (
    propertyId: string,
    data: CreatePropertyMaintenanceTaskInput,
  ): Promise<PropertyMaintenanceTask> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const newTask: PropertyMaintenanceTask = {
        id: `visit-${Math.random().toString(36).slice(2)}`,
        propertyId,
        scheduledAt: data.scheduledAt ?? new Date().toISOString(),
        title: data.title,
        notes: data.notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      MOCK_MAINTENANCE_TASKS[propertyId] = [
        newTask,
        ...(MOCK_MAINTENANCE_TASKS[propertyId] ?? []),
      ];
      return newTask;
    }

    const token = getToken();
    const result = await apiClient.post<BackendPropertyVisit>(
      `/properties/${propertyId}/visits/maintenance-tasks`,
      {
        scheduledAt: data.scheduledAt,
        title: data.title,
        notes: data.notes,
      },
      token ?? undefined,
    );
    return mapBackendVisitToMaintenanceTask(result);
  },

  delete: async (id: string): Promise<void> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const index = MOCK_PROPERTIES.findIndex((p) => p.id === id);
      if (index !== -1) {
        MOCK_PROPERTIES.splice(index, 1);
      }
      return;
    }

    const token = getToken();
    await apiClient.delete(`/properties/${id}`, token ?? undefined);
  },

  uploadImage: async (file: File): Promise<string> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      return URL.createObjectURL(file);
    }

    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);
    const result = await apiClient.upload<string | { url?: string }>(
      "/properties/upload",
      formData,
      token ?? undefined,
    );
    if (typeof result === "string") {
      return normalizePropertyImageUrl(result);
    }
    if (result && typeof result.url === "string") {
      return normalizePropertyImageUrl(result.url);
    }
    throw new Error("Unexpected response shape from /properties/upload");
  },

  discardUploadedImages: async (
    images: string[],
  ): Promise<{ deleted: number }> => {
    if (!Array.isArray(images) || images.length === 0) {
      return { deleted: 0 };
    }

    if (IS_MOCK_MODE) {
      await delay(DELAY);
      return { deleted: images.length };
    }

    const token = getToken();
    return apiClient.post<{ deleted: number }>(
      "/properties/uploads/discard",
      {
        images: images.map(normalizePropertyImageUrl),
      },
      token ?? undefined,
    );
  },
};
