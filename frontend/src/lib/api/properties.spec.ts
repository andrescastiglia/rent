import type { PropertyFilters } from "@/types/property";

const previousEnv = { ...process.env };
const ownerId = "11111111-1111-4111-8111-111111111111";
const raw = {
  id: "property",
  name: "Casa",
  propertyType: "house",
  status: "active",
  addressStreet: "Mitre",
  addressCity: "Rosario",
  ownerId,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-02",
};
async function load(mock = false) {
  jest.resetModules();
  process.env = {
    ...previousEnv,
    NODE_ENV: mock ? "test" : "production",
    CI: "",
    NEXT_PUBLIC_MOCK_MODE: "",
    NEXT_PUBLIC_API_URL: "http://localhost:3001/api",
  };
  const client = {
    get: jest.fn().mockResolvedValue(raw),
    post: jest.fn().mockResolvedValue(raw),
    patch: jest.fn().mockResolvedValue(raw),
    delete: jest.fn(),
    upload: jest.fn(),
  };
  jest.doMock("../api", () => ({ apiClient: client, IS_MOCK_MODE: mock }));
  jest.doMock("../auth", () => ({
    getToken: () => "session-token",
    getUser: () => ({ id: "user", companyId: "company" }),
  }));
  return { api: (await import("./properties")).propertiesApi, client };
}
afterEach(() => {
  process.env = { ...previousEnv };
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("Properties transport contract", () => {
  it("preserves pagination and every server filter, including zero values", async () => {
    const { api, client } = await load();
    client.get.mockResolvedValue({
      data: [raw],
      total: 83,
      page: 3,
      limit: 20,
    });
    const filters: PropertyFilters = {
      page: 3,
      limit: 20,
      ownerId,
      search: " Mitre ",
      operation: "sale",
      operationState: "available",
      order: "address",
      addressCity: "Rosario",
      addressState: "Santa Fe",
      propertyType: "HOUSE",
      status: "ACTIVE",
      minRent: 0,
      maxRent: 100,
      minSalePrice: 0,
      maxSalePrice: 100000,
      bedrooms: 0,
      bathrooms: 1,
    };
    const result = await api.getPage(filters);
    expect(result).toMatchObject({
      total: 83,
      page: 3,
      limit: 20,
      data: [{ id: "property", type: "HOUSE", address: { street: "Mitre" } }],
    });
    const query = new URL(client.get.mock.calls[0][0], "http://api.test")
      .searchParams;
    expect(Object.fromEntries(query)).toMatchObject({
      page: "3",
      limit: "20",
      minRent: "0",
      search: "Mitre",
      propertyType: "house",
      addressState: "Santa Fe",
      operation: "sale",
    });
    expect(client.get.mock.calls[0][1]).toBe("session-token");
  });
  it("collects later pages and refuses invalid response shapes", async () => {
    const { api, client } = await load();
    client.get
      .mockResolvedValueOnce({ data: [raw], total: 2, page: 1, limit: 1 })
      .mockResolvedValueOnce({
        data: [{ ...raw, id: "later" }],
        total: 2,
        page: 2,
        limit: 1,
      });
    expect((await api.getAll({ limit: 1 })).map((p) => p.id)).toEqual([
      "property",
      "later",
    ]);
    expect(client.get.mock.calls[1][0]).toContain("page=2");
    client.get.mockResolvedValue({ unexpected: true });
    await expect(api.getPage()).rejects.toThrow("Unexpected response");
    client.get.mockResolvedValue([raw]);
    expect((await api.getPage()).total).toBe(1);
  });
  it.each([
    "apartment",
    "house",
    "commercial",
    "office",
    "warehouse",
    "land",
    "parking",
    "other",
  ])(
    "maps %s properties without losing prices, images or units",
    async (type) => {
      const { api, client } = await load();
      client.get.mockResolvedValue({
        ...raw,
        propertyType: type,
        rentPrice: "1250.50",
        salePrice: "50000",
        operations: ["SALE", "invalid"],
        operationState: "sold",
        allowsPets: false,
        maxOccupants: 0,
        acceptedGuaranteeTypes: ["insurance"],
        images: [
          "/properties/images/id",
          { url: "http://rent.maese.com.ar/photo.jpg" },
          { path: "uploads/photo.jpg" },
          null,
          { url: "" },
        ],
        features: [
          { id: "feature", name: "Balcony", value: "yes" },
          { key: "Garage" },
          {},
        ],
        units: [
          {
            id: "unit",
            unitNumber: "A",
            bedrooms: "2",
            bathrooms: 1,
            area: "80",
            baseRent: "300",
            status: "rented",
          },
        ],
      });
      expect(await api.getById("property")).toMatchObject({
        type: type.toUpperCase(),
        rentPrice: 1250.5,
        salePrice: 50000,
        operations: ["sale"],
        operationState: "sold",
        allowsPets: false,
        maxOccupants: 0,
        units: [{ bedrooms: 2, rentAmount: 300 }],
        features: [{ name: "Balcony" }, { name: "Garage" }],
      });
    },
  );
  it.each(["active", "inactive", "under_maintenance", "maintenance"])(
    "maps %s state and historical missing values",
    async (status) => {
      const { api, client } = await load();
      client.get.mockResolvedValue({
        id: "p",
        status,
        rentPrice: 0,
        salePrice: null,
        features: null,
        images: null,
      });
      const result = await api.getById("p");
      expect(result?.operations).toEqual(["rent"]);
      expect(result?.status).toBe(
        status === "active"
          ? "ACTIVE"
          : status.includes("maintenance")
            ? "MAINTENANCE"
            : "INACTIVE",
      );
      expect(result?.images).toEqual([]);
      client.get.mockRejectedValue(new Error("403"));
      expect(await api.getById("foreign")).toBeNull();
    },
  );
  it("serializes create and partial edit without clearing existing photos or fields", async () => {
    const { api, client } = await load();
    await api.create({
      name: "Casa",
      ownerId,
      type: "HOUSE",
      address: {
        street: "Mitre",
        number: "30",
        city: "Rosario",
        state: "SF",
        zipCode: "2000",
        country: "Argentina",
      },
      images: ["/properties/images/id"],
      operations: ["rent"],
      allowsPets: false,
    } as any);
    expect(client.post.mock.calls[0]).toEqual([
      "/properties",
      expect.objectContaining({
        ownerId,
        propertyType: "house",
        addressStreet: "Mitre",
        allowsPets: false,
      }),
      "session-token",
    ]);
    await api.update("property", { name: "Nuevo" });
    expect(client.patch.mock.calls[0]).toEqual([
      "/properties/property",
      { name: "Nuevo" },
      "session-token",
    ]);
    await api.update("property", {
      type: "OFFICE",
      status: "MAINTENANCE",
      images: [],
      address: { city: "Córdoba" },
    } as any);
    expect(client.patch.mock.calls[1][1]).toMatchObject({
      propertyType: "office",
      status: "under_maintenance",
      images: [],
      addressCity: "Córdoba",
    });
    await api.delete("property");
    expect(client.delete).toHaveBeenCalledWith(
      "/properties/property",
      "session-token",
    );
  });
  it("uploads the binary and checks returned URL before using it", async () => {
    const { api, client } = await load();
    const file = new File(["image"], "photo.png", { type: "image/png" });
    client.upload
      .mockResolvedValueOnce("/properties/images/id")
      .mockResolvedValueOnce({ url: "/uploads/photo.png" })
      .mockResolvedValueOnce({});
    expect(await api.uploadImage(file)).toContain("/properties/images/id");
    expect((client.upload.mock.calls[0][1] as FormData).get("file")).toBe(file);
    expect(client.upload.mock.calls[0][0]).toBe("/properties/upload");
    expect(await api.uploadImage(file)).toContain("/uploads/photo.png");
    await expect(api.uploadImage(file)).rejects.toThrow("Unexpected response");
    expect(await api.discardUploadedImages([])).toEqual({ deleted: 0 });
    await api.discardUploadedImages(["/properties/images/id"]);
    expect(client.post).toHaveBeenCalledWith(
      "/properties/uploads/discard",
      { images: [expect.stringContaining("/properties/images/id")] },
      "session-token",
    );
  });
  it("keeps visits and maintenance routes separate and maps their dates and offers", async () => {
    const { api, client } = await load();
    const visit = {
      id: "visit",
      propertyId: "property",
      visitedAt: "2026-10-01",
      comments: "Reparación",
      interestedName: "Contacto",
      offerAmount: "15000",
      hasOffer: true,
      offerCurrency: "USD",
      result: "offer",
    };
    client.get.mockResolvedValue([visit]);
    client.post.mockResolvedValue(visit);
    client.patch.mockResolvedValue(visit);
    expect((await api.getVisits("property"))[0]).toMatchObject({
      id: "visit",
      offerAmount: 15000,
    });
    expect((await api.getMaintenanceTasks("property"))[0].id).toBe("visit");
    await api.createVisit("property", {
      interestedName: "Contacto",
      visitedAt: "2026-10-01",
    });
    await api.updateVisitResult("property", "visit", {
      result: "offer",
      offerAmount: 15000,
      offerCurrency: "USD",
    });
    await api.createMaintenanceTask("property", {
      title: "Reparación",
      notes: "Agua",
      scheduledAt: "2026-10-01",
    });
    expect(client.patch.mock.calls[0][0]).toBe(
      "/properties/property/visits/visit/result",
    );
    expect(client.post.mock.calls[1][0]).toBe(
      "/properties/property/visits/maintenance-tasks",
    );
    client.get.mockResolvedValue(null);
    expect(await api.getVisits("property")).toEqual([]);
    expect(await api.getMaintenanceTasks("property")).toEqual([]);
  });
});

describe("Property demo journey", () => {
  it("allows filtering, editing, visits and deletion without making network calls", async () => {
    jest.useFakeTimers();
    const { api, client } = await load(true);
    const finish = async <T>(promise: Promise<T>): Promise<T> => {
      await jest.runAllTimersAsync();
      return promise;
    };
    const created = await finish(
      api.create({
        name: "Prueba",
        type: "HOUSE",
        address: { street: "Demo", city: "Rosario" },
        images: [],
        features: [{ name: "Balcony" }],
      } as any),
    );
    const page = await finish(
      api.getPage({ search: "Prueba", order: "address" }),
    );
    expect(page.data.map((p) => p.id)).toContain(created.id);
    await finish(
      api.getAll({
        page: 1,
        limit: 1,
        ownerId: created.ownerId,
        propertyType: "HOUSE",
        status: "ACTIVE",
        addressCity: "Rosario",
        minRent: 0,
        maxRent: 999999,
        minSalePrice: 0,
        maxSalePrice: 999999,
      }),
    );
    expect(
      (
        await finish(
          api.getById(encodeURIComponent(created.id) + "?origin=list"),
        )
      )?.id,
    ).toBe(created.id);
    expect(
      (
        await finish(
          api.update(created.id, {
            name: "Editada",
            features: [{ name: "Garage" }],
          } as any),
        )
      ).name,
    ).toBe("Editada");
    const visit = await finish(
      api.createVisit(created.id, { interestedName: "Persona" }),
    );
    expect(
      (
        await finish(
          api.updateVisitResult(created.id, visit.id, { result: "interested" }),
        )
      ).result,
    ).toBe("interested");
    expect(await finish(api.getVisits(created.id))).toHaveLength(1);
    await finish(api.createMaintenanceTask(created.id, { title: "Servicio" }));
    expect(await finish(api.getMaintenanceTasks(created.id))).toHaveLength(1);
    await finish(api.delete(created.id));
    expect(await finish(api.getById(created.id))).toBeNull();
    expect(client.get).not.toHaveBeenCalled();
    expect(client.post).not.toHaveBeenCalled();
  });
});
