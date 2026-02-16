import {
  Property,
  PropertyFeature,
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

const toOptionalNumber = (
  value: number | string | null | undefined,
): number | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  return Number(value);
};

const toIsoDate = (value?: string | Date): string => {
  return value ? new Date(value).toISOString() : new Date().toISOString();
};

const isApiRelativeImagePath = (value: string): boolean =>
  value.startsWith("/uploads/") ||
  value.startsWith("uploads/") ||
  value.startsWith("/properties/images/") ||
  value.startsWith("properties/images/");

const shouldForceHttps = (): boolean =>
  typeof window !== "undefined" && window.location.protocol === "https:";

const forceHttpsWhenNeeded = (url: URL): string => {
  if (shouldForceHttps()) {
    url.protocol = "https:";
  }
  return url.toString();
};

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
      return forceHttpsWhenNeeded(resolved);
    } catch {
      return normalizedPath;
    }
  };

  if (isApiRelativeImagePath(url)) {
    return normalizeApiPathWithBase(url);
  }

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return url;
  }

  try {
    const parsed = new URL(url);
    return normalizeAbsoluteImageUrl(parsed, normalizeApiPathWithBase);
  } catch {
    return url;
  }
};

const normalizeAbsoluteImageUrl = (
  parsed: URL,
  normalizeApiPathWithBase: (path: string) => string,
): string => {
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

  return forceHttpsWhenNeeded(parsed);
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
  const setIfDefined = <K extends keyof BackendUpdatePropertyPayload>(
    key: K,
    value: BackendUpdatePropertyPayload[K] | undefined,
  ) => {
    if (value !== undefined) {
      payload[key] = value;
    }
  };

  const backendType = mapFrontendPropertyTypeToBackend(data.type);
  if (backendType) {
    payload.propertyType = backendType;
  }
  const backendStatus = mapFrontendPropertyStatusToBackend(data.status);
  if (backendStatus) {
    payload.status = backendStatus;
  }

  const directFields: Array<
    [
      keyof BackendUpdatePropertyPayload,
      (
        | BackendUpdatePropertyPayload[keyof BackendUpdatePropertyPayload]
        | undefined
      ),
    ]
  > = [
    ["name", data.name],
    ["ownerWhatsapp", data.ownerWhatsapp],
    ["description", data.description],
    ["rentPrice", data.rentPrice],
    ["salePrice", data.salePrice],
    ["saleCurrency", data.saleCurrency],
    ["operations", data.operations],
    ["operationState", data.operationState],
    ["allowsPets", data.allowsPets],
    ["acceptedGuaranteeTypes", data.acceptedGuaranteeTypes],
    ["maxOccupants", data.maxOccupants],
  ];

  for (const [key, value] of directFields) {
    setIfDefined(key, value);
  }

  const addressFields: Array<
    [keyof BackendUpdatePropertyPayload, string | undefined]
  > = [
    ["addressStreet", data.address?.street],
    ["addressNumber", data.address?.number],
    ["addressApartment", data.address?.unit],
    ["addressCity", data.address?.city],
    ["addressState", data.address?.state],
    ["addressCountry", data.address?.country],
    ["addressPostalCode", data.address?.zipCode],
  ];

  for (const [key, value] of addressFields) {
    setIfDefined(key, value);
  }

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

const hasNumericValue = (value: number | string | null | undefined): boolean =>
  value !== undefined && value !== null;

const resolveOperationsFromPrices = (
  raw: BackendProperty,
): Property["operations"] => {
  const hasRentPrice = hasNumericValue(raw.rentPrice);
  const hasSalePrice = hasNumericValue(raw.salePrice);

  if (hasRentPrice && hasSalePrice) {
    return ["rent", "sale"];
  }

  if (hasRentPrice) {
    return ["rent"];
  }

  if (hasSalePrice) {
    return ["sale"];
  }

  return ["rent"];
};

const resolvePropertyOperations = (
  raw: BackendProperty,
): Property["operations"] => {
  const backendOperations = Array.isArray(raw.operations)
    ? raw.operations.filter((item): item is string => typeof item === "string")
    : [];

  const normalizedOperations = backendOperations
    .map((item) => item.toLowerCase())
    .filter(
      (item): item is "rent" | "sale" => item === "rent" || item === "sale",
    );

  if (normalizedOperations.length > 0) {
    return normalizedOperations;
  }

  return resolveOperationsFromPrices(raw);
};

const mapBackendFeatures = (
  features: any[] | null | undefined,
): Property["features"] => {
  if (!Array.isArray(features)) {
    return [];
  }

  return features
    .map((feature: any) => {
      const id =
        typeof feature?.id === "string"
          ? feature.id
          : Math.random().toString(36).slice(2);
      const name =
        typeof feature?.name === "string"
          ? feature.name
          : String(feature?.featureName ?? feature?.key ?? "");
      const value =
        typeof feature?.value === "string" ? feature.value : undefined;
      return { id, name, value };
    })
    .filter((feature) => Boolean(feature.name));
};

const mapBackendPropertyToProperty = (raw: BackendProperty): Property => {
  const operations = resolvePropertyOperations(raw);

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
    features: mapBackendFeatures(raw.features),
    units: Array.isArray(raw.units) ? raw.units.map(mapBackendUnitToUnit) : [],
    images: normalizeImages(raw.images),
    ownerId: raw.ownerId ?? "",
    ownerWhatsapp: raw.ownerWhatsapp ?? undefined,
    rentPrice: toOptionalNumber(raw.rentPrice),
    salePrice: toOptionalNumber(raw.salePrice),
    saleCurrency: raw.saleCurrency ?? undefined,
    operations,
    operationState: mapOperationState(raw.operationState),
    allowsPets: raw.allowsPets ?? true,
    acceptedGuaranteeTypes: Array.isArray(raw.acceptedGuaranteeTypes)
      ? raw.acceptedGuaranteeTypes
      : [],
    maxOccupants: toOptionalNumber(raw.maxOccupants),
    createdAt: toIsoDate(raw.createdAt),
    updatedAt: toIsoDate(raw.updatedAt),
  };
};

const mapBackendVisitToMaintenanceTask = (
  raw: BackendPropertyVisit,
): PropertyMaintenanceTask => {
  return {
    id: raw.id,
    propertyId: raw.propertyId,
    scheduledAt: toIsoDate(raw.visitedAt),
    title: raw.interestedName,
    notes: raw.comments ?? undefined,
    createdAt: toIsoDate(raw.createdAt),
    updatedAt: toIsoDate(raw.updatedAt),
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

const applyMockPropertyFilters = (
  properties: Property[],
  filters?: PropertyFilters,
): Property[] => {
  const predicates: Array<(property: Property) => boolean> = [];

  if (filters?.ownerId) {
    predicates.push((property) => property.ownerId === filters.ownerId);
  }
  addMinPricePredicate(predicates, filters?.minSalePrice, "salePrice");
  addMaxPricePredicate(predicates, filters?.maxSalePrice, "salePrice");
  addMinPricePredicate(predicates, filters?.minRent, "rentPrice");
  addMaxPricePredicate(predicates, filters?.maxRent, "rentPrice");

  return predicates.reduce(
    (result, predicate) => result.filter(predicate),
    [...properties],
  );
};

const addMinPricePredicate = (
  predicates: Array<(property: Property) => boolean>,
  min: number | undefined,
  key: "salePrice" | "rentPrice",
) => {
  if (min === undefined) {
    return;
  }

  predicates.push((property) => (property[key] ?? 0) >= min);
};

const addMaxPricePredicate = (
  predicates: Array<(property: Property) => boolean>,
  max: number | undefined,
  key: "salePrice" | "rentPrice",
) => {
  if (max === undefined) {
    return;
  }

  predicates.push((property) => (property[key] ?? 0) <= max);
};

const buildPropertiesQueryParams = (
  filters?: PropertyFilters,
): URLSearchParams => {
  const queryParams = new URLSearchParams();
  if (!filters) {
    return queryParams;
  }

  const appendStringParam = (key: string, value?: string) => {
    if (value) {
      queryParams.append(key, value);
    }
  };
  const appendNumberParam = (key: string, value?: number) => {
    if (value !== undefined) {
      queryParams.append(key, String(value));
    }
  };

  appendStringParam("ownerId", filters.ownerId);
  appendStringParam("addressCity", filters.addressCity);
  appendStringParam("addressState", filters.addressState);
  if (filters.propertyType) {
    const backendType = mapFrontendPropertyTypeToBackend(filters.propertyType);
    if (backendType) {
      queryParams.append("propertyType", backendType);
    }
  }
  if (filters.status) {
    const backendStatus = mapFrontendPropertyStatusToBackend(filters.status);
    if (backendStatus) {
      queryParams.append("status", backendStatus);
    }
  }

  appendNumberParam("minRent", filters.minRent);
  appendNumberParam("maxRent", filters.maxRent);
  appendNumberParam("minSalePrice", filters.minSalePrice);
  appendNumberParam("maxSalePrice", filters.maxSalePrice);
  appendNumberParam("bedrooms", filters.bedrooms);
  appendNumberParam("bathrooms", filters.bathrooms);
  appendNumberParam("page", filters.page);
  appendNumberParam("limit", filters.limit);

  return queryParams;
};

export const propertiesApi = {
  getAll: async (filters?: PropertyFilters): Promise<Property[]> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      return applyMockPropertyFilters(MOCK_PROPERTIES, filters);
    }

    const token = getToken();
    const queryParams = buildPropertiesQueryParams(filters);

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
      const currentUserId = (getUser()?.id as string | undefined) ?? undefined;
      const newProperty: Property = {
        name: data.name,
        description: data.description,
        type: data.type,
        address: data.address,
        images: data.images || [],
        id: Math.random().toString(36).substr(2, 9),
        status: "ACTIVE",
        ownerId: data.ownerId ?? currentUserId ?? "owner-1",
        features: (data.features || []).map((f): PropertyFeature => {
          const feature: PropertyFeature = {
            name: f.name,
            value: f.value,
            id: Math.random().toString(36).substring(2, 11),
          };
          return feature;
        }),
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
        ? data.features.map((f): PropertyFeature => {
            const feature: PropertyFeature = {
              name: f.name,
              value: f.value,
              id: Math.random().toString(36).substring(2, 11),
            };
            return feature;
          })
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
