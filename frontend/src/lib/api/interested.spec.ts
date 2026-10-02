import type { CreateInterestedProfileInput } from "@/types/interested";

async function load(mock = false, token: string | null = "crm-token") {
  jest.resetModules();
  localStorage.clear();
  if (token) localStorage.setItem("auth_token", token);
  const client = {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  jest.doMock("../api", () => ({ apiClient: client, IS_MOCK_MODE: mock }));
  return { api: (await import("./interested")).interestedApi, client };
}
const base = {
  id: "profile",
  firstName: "Ana",
  lastName: "Gomez",
  phone: "123456",
  createdAt: "2026-09-01",
  updatedAt: "2026-10-01",
};
const input: CreateInterestedProfileInput = {
  firstName: "Ana",
  lastName: "Gomez",
  phone: "123456",
  status: "interested",
  operation: "rent",
};
const property = {
  id: "property",
  name: "Casa",
  propertyType: "house",
  status: "active",
  ownerId: "owner",
  addressStreet: "Calle",
  addressNumber: "10",
  addressApartment: "A",
  addressCity: "Ciudad",
  addressState: "Provincia",
  addressPostalCode: "1000",
  addressCountry: "Argentina",
  rentPrice: "100",
  salePrice: "1000",
  saleCurrency: "USD",
  createdAt: "2026-09-01",
  updatedAt: "2026-10-01",
  units: [
    {
      id: "unit",
      unitNumber: "1",
      bedrooms: "2",
      bathrooms: "1",
      area: "60",
      baseRent: "100",
      status: "occupied",
    },
  ],
};
afterEach(() => {
  localStorage.clear();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("interested transport contract", () => {
  it("forwards all supported filters, caps the page size and maps numerical/date values", async () => {
    const { api, client } = await load();
    client.get.mockResolvedValue({
      data: [
        {
          ...base,
          operations: ["rent", "sale", "bad"],
          peopleCount: "2",
          minAmount: "0",
          maxAmount: "100",
          verifiedMonthlyIncome: "1000",
          guaranteeTypes: ["Garante"],
          preferredZones: ["Centro"],
          desiredFeatures: ["Balcón"],
          status: "interested",
          lastContactAt: "2026-09-02",
          nextContactAt: "2026-10-02",
          consentRecordedAt: "2026-09-03",
        },
      ],
      total: 1,
      page: 2,
      limit: 100,
    });
    const result = await api.getAll({
      name: "Ana Gomez",
      phone: "123",
      operation: "rent",
      propertyTypePreference: "house",
      status: "interested",
      qualificationLevel: "sql",
      minVerifiedMonthlyIncome: 0,
      page: 2,
      limit: 500,
    });
    expect(client.get).toHaveBeenCalledWith(
      "/interested?name=Ana+Gomez&phone=123&operation=rent&propertyTypePreference=house&status=interested&qualificationLevel=sql&minVerifiedMonthlyIncome=0&page=2&limit=100",
      "crm-token",
    );
    expect(result).toMatchObject({ page: 2, limit: 100, total: 1 });
    expect(result.data[0]).toMatchObject({
      operations: ["rent", "sale"],
      peopleCount: 2,
      minAmount: 0,
      maxAmount: 100,
      verifiedMonthlyIncome: 1000,
      guaranteeTypes: ["Garante"],
      preferredZones: ["Centro"],
      desiredFeatures: ["Balcón"],
      lastContactAt: "2026-09-02T00:00:00.000Z",
      nextContactAt: "2026-10-02T00:00:00.000Z",
      consentRecordedAt: "2026-09-03T00:00:00.000Z",
    });
  });
  it("supports unfiltered unauthenticated requests and historical operation/status representations", async () => {
    const { api, client } = await load(false, null);
    client.get.mockResolvedValue({
      data: [
        { id: "legacy-rent", operation: "rent", convertedToTenantId: "tenant" },
        {
          id: "legacy-sale",
          operation: "sale",
          convertedToSaleAgreementId: "agreement",
        },
        { id: "unknown", operation: "bad" },
        { id: "explicit-buyer", status: "buyer" },
        { id: "explicit-tenant", status: "tenant" },
      ],
      total: 5,
      page: 1,
      limit: 10,
    });
    const result = await api.getAll();
    expect(client.get).toHaveBeenCalledWith("/interested", undefined);
    expect(result.data.map((item) => item.status)).toEqual([
      "tenant",
      "buyer",
      "interested",
      "buyer",
      "tenant",
    ]);
    expect(result.data.map((item) => item.operations)).toEqual([
      ["rent"],
      ["sale"],
      ["rent"],
      ["rent"],
      ["rent"],
    ]);
    expect(result.data[2]).toMatchObject({
      guaranteeTypes: [],
      desiredFeatures: [],
      preferredZones: [],
    });
    expect(result.data[2].minAmount).toBeUndefined();
    expect(result.data[2].lastContactAt).toBeUndefined();
  });
  it("retains conversion to an independent buyer without requiring a sale agreement", async () => {
    const { api, client } = await load();
    client.get.mockResolvedValue({
      data: [{ ...base, convertedToBuyerId: "buyer" }],
      total: 1,
      page: 1,
      limit: 10,
    });
    expect((await api.getAll()).data[0]).toMatchObject({
      convertedToBuyerId: "buyer",
      status: "buyer",
    });
  });
  it("creates and updates the profile using the supplied partial body and token", async () => {
    const { api, client } = await load();
    client.post.mockResolvedValue({ ...base, status: "interested" });
    client.patch.mockResolvedValue({ ...base, status: "tenant" });
    expect((await api.create(input)).id).toBe("profile");
    expect(client.post).toHaveBeenCalledWith("/interested", input, "crm-token");
    const patch = {
      verifiedMonthlyIncome: 0,
      notes: "",
      consentContact: false,
    };
    expect((await api.update("profile", patch)).status).toBe("tenant");
    expect(client.patch).toHaveBeenCalledWith(
      "/interested/profile",
      patch,
      "crm-token",
    );
    await api.sendInitialMessage("profile");
    expect(client.post).toHaveBeenCalledWith(
      "/interested/profile/send-initial-message",
      {},
      "crm-token",
    );
    await api.remove("profile");
    expect(client.delete).toHaveBeenCalledWith(
      "/interested/profile",
      "crm-token",
    );
  });
  it("maps summary histories, activity timestamps, match scores and nested visit/property evidence", async () => {
    const { api, client } = await load();
    client.get.mockResolvedValue({
      profile: base,
      stageHistory: [{ id: "history", changedAt: "2026-10-01" }],
      activities: [
        {
          id: "activity",
          type: "task",
          status: "completed",
          dueAt: "2026-10-01",
          completedAt: "2026-10-02",
          createdAt: "2026-09-01",
          updatedAt: "2026-10-01",
        },
        { id: "empty" },
      ],
      matches: [
        {
          id: "match",
          score: "8.5",
          matchReasons: ["Ciudad"],
          contactedAt: "2026-10-01",
          property,
          createdAt: "2026-09-01",
          updatedAt: "2026-10-01",
        },
        { id: "unmatched" },
      ],
      visits: [
        { id: "visit", visitedAt: "2026-10-01", offerAmount: "100", property },
        { id: "no-offer", visitedAt: "2026-10-01", offerAmount: null },
      ],
    });
    const summary = await api.getSummary("profile");
    expect(client.get).toHaveBeenCalledWith(
      "/interested/profile/summary",
      "crm-token",
    );
    expect(summary.stageHistory[0].changedAt).toBe("2026-10-01T00:00:00.000Z");
    expect(summary.activities[0].completedAt).toBe("2026-10-02T00:00:00.000Z");
    expect(summary.activities[1].dueAt).toBeUndefined();
    expect(summary.matches[0]).toMatchObject({
      score: 8.5,
      property: {
        type: "HOUSE",
        status: "ACTIVE",
        operations: ["rent", "sale"],
        address: { number: "10" },
        units: [{ bedrooms: 2, rentAmount: 100, status: "OCCUPIED" }],
      },
    });
    expect(summary.matches[1].property).toBeUndefined();
    expect(summary.visits[0].offerAmount).toBe(100);
    expect(summary.visits[1].offerAmount).toBeUndefined();
    client.get.mockResolvedValue({ profile: base });
    expect(await api.getSummary("profile")).toMatchObject({
      stageHistory: [],
      activities: [],
      matches: [],
      visits: [],
    });
  });
  it.each([
    { type: "apartment", expected: "APARTMENT" },
    { type: "house", expected: "HOUSE" },
    { type: "commercial", expected: "COMMERCIAL" },
    { type: "office", expected: "OFFICE" },
    { type: "warehouse", expected: "WAREHOUSE" },
    { type: "land", expected: "LAND" },
    { type: "parking", expected: "PARKING" },
    { type: "unlisted", expected: "OTHER" },
  ])(
    "maps $type properties while discarding matches with no property",
    async ({ type, expected }) => {
      const { api, client } = await load();
      client.get.mockResolvedValue([
        { property: { ...property, propertyType: type } },
        { property: null },
      ]);
      const matches = await api.getMatches("profile");
      expect(matches).toHaveLength(1);
      expect(matches[0].type).toBe(expected);
      expect(client.get).toHaveBeenCalledWith(
        "/interested/profile/matches",
        "crm-token",
      );
    },
  );
  it("maps explicit operations and maintenance status, zero rental values and unit fallbacks", async () => {
    const { api, client } = await load();
    client.get.mockResolvedValue([
      {
        property: {
          id: "property",
          status: "under_maintenance",
          operations: ["rent", "sale", "bad"],
          rentPrice: 0,
          units: [
            { id: "u", status: "maintenance" },
            { id: "v", status: "unknown" },
          ],
        },
      },
    ]);
    const [match] = await api.getMatches("profile");
    expect(match).toMatchObject({
      status: "MAINTENANCE",
      operations: ["rent", "sale"],
      rentPrice: 0,
      address: {
        street: "",
        number: "",
        city: "",
        state: "",
        zipCode: "",
        country: "Argentina",
      },
      units: [
        { status: "MAINTENANCE", bedrooms: 0, rentAmount: 0 },
        { status: "AVAILABLE" },
      ],
    });
  });
  it.each([
    { amounts: { rentPrice: 0 }, expected: ["rent"] },
    { amounts: { salePrice: "100" }, expected: ["sale"] },
    { amounts: {}, expected: ["rent"] },
  ])(
    "derives historical property operations from the available amounts",
    async ({ amounts, expected }) => {
      const { api, client } = await load();
      client.get.mockResolvedValue([
        { property: { id: "property", status: "inactive", ...amounts } },
      ]);
      const [match] = await api.getMatches("profile");
      expect(match.operations).toEqual(expected);
      expect(match.status).toBe("INACTIVE");
      expect(match.units).toEqual([]);
    },
  );
  it("maps a timeline, refreshes suggestions and updates the specified match only", async () => {
    const { api, client } = await load();
    client.get.mockResolvedValue([{ id: "event", at: "2026-10-01" }]);
    expect((await api.getTimeline("profile"))[0].at).toBe(
      "2026-10-01T00:00:00.000Z",
    );
    client.post.mockResolvedValue([{ id: "match" }]);
    expect((await api.refreshMatches("profile"))[0].id).toBe("match");
    expect(client.post).toHaveBeenCalledWith(
      "/interested/profile/matches/refresh",
      {},
      "crm-token",
    );
    client.patch.mockResolvedValue({ id: "match", status: "accepted" });
    expect(
      (await api.updateMatch("profile", "match", "accepted", "Confirmado"))
        .status,
    ).toBe("accepted");
    expect(client.patch).toHaveBeenCalledWith(
      "/interested/profile/matches/match",
      { status: "accepted", notes: "Confirmado" },
      "crm-token",
    );
  });
  it("changes stage and creates or updates activities with exact date and status values", async () => {
    const { api, client } = await load();
    client.post
      .mockResolvedValueOnce({ ...base, status: "buyer" })
      .mockResolvedValueOnce({
        id: "activity",
        dueAt: "2026-10-01",
        completedAt: null,
      });
    expect(
      (await api.changeStage("profile", "buyer", "Interés confirmado")).status,
    ).toBe("buyer");
    expect(client.post).toHaveBeenCalledWith(
      "/interested/profile/stage",
      { toStatus: "buyer", reason: "Interés confirmado" },
      "crm-token",
    );
    const payload = {
      type: "task" as const,
      subject: "Llamar",
      dueAt: "2026-10-01",
      markReserved: false,
    };
    expect((await api.addActivity("profile", payload)).dueAt).toBe(
      "2026-10-01T00:00:00.000Z",
    );
    expect(client.post).toHaveBeenCalledWith(
      "/interested/profile/activities",
      payload,
      "crm-token",
    );
    client.patch.mockResolvedValue({
      id: "activity",
      status: "completed",
      completedAt: "2026-10-02",
    });
    await api.updateActivity("profile", "activity", { status: "completed" });
    expect(client.patch).toHaveBeenCalledWith(
      "/interested/profile/activities/activity",
      { status: "completed" },
      "crm-token",
    );
  });
  it("creates and lists scoped reservations while preserving source and release evidence", async () => {
    const { api, client } = await load();
    const reservation = {
      id: "reservation",
      companyId: "company",
      propertyId: "property",
      status: "released",
      notes: "Nota",
      reservedByUserId: "admin",
      reservedAt: "2026-10-01",
      releasedAt: "2026-10-02",
      createdAt: "2026-09-01",
      updatedAt: "2026-10-02",
      property,
    };
    client.post.mockResolvedValue(reservation);
    const payload = {
      propertyId: "property",
      notes: "Nota",
      activitySource: "visit",
    };
    expect(await api.createReservation("profile", payload)).toMatchObject({
      id: "reservation",
      notes: "Nota",
      reservedByUserId: "admin",
      releasedAt: "2026-10-02T00:00:00.000Z",
    });
    expect(client.post).toHaveBeenCalledWith(
      "/interested/profile/reservations",
      payload,
      "crm-token",
    );
    client.get.mockResolvedValue([reservation, { id: "empty" }]);
    const list = await api.getReservations("profile");
    expect(client.get).toHaveBeenCalledWith(
      "/interested/profile/reservations",
      "crm-token",
    );
    expect(list[1].property).toBeUndefined();
    expect(list[1].releasedAt).toBeUndefined();
  });
  it("returns server metrics and duplicate evidence without fabricating frontend results", async () => {
    const { api, client } = await load();
    const metrics = {
      totalLeads: 3,
      conversionRate: 20,
      byStage: { interested: 3 },
    };
    client.get
      .mockResolvedValueOnce(metrics)
      .mockResolvedValueOnce([{ profileIds: ["one", "two"] }]);
    expect(await api.getMetrics()).toBe(metrics);
    expect(await api.getDuplicates()).toEqual([{ profileIds: ["one", "two"] }]);
    expect(client.get).toHaveBeenNthCalledWith(
      1,
      "/interested/metrics/overview",
      "crm-token",
    );
    expect(client.get).toHaveBeenNthCalledWith(
      2,
      "/interested/duplicates",
      "crm-token",
    );
  });
  it("forwards tenant and buyer conversions without adding artificial fiscal or identity data", async () => {
    const { api, client } = await load();
    client.post.mockResolvedValue({
      profile: base,
      tenant: { id: "tenant" },
      buyer: { id: "buyer" },
    });
    const tenantPayload = { dni: "12345678" };
    await api.convertToTenant("profile", tenantPayload);
    expect(client.post).toHaveBeenCalledWith(
      "/interested/profile/convert/tenant",
      tenantPayload,
      "crm-token",
    );
    const buyerPayload = {
      email: "buyer@example.invalid",
      folderId: "folder",
      totalAmount: 100,
      installmentCount: 2,
      installmentAmount: 50,
      startDate: "2026-10-01",
      currency: "ARS",
    };
    await api.convertToBuyer("profile", buyerPayload);
    expect(client.post).toHaveBeenCalledWith(
      "/interested/profile/convert/buyer",
      buyerPayload,
      "crm-token",
    );
  });
  it("propagates denied access without substituting demo data or success", async () => {
    const { api, client } = await load();
    const denied = Object.assign(new Error("Forbidden"), { status: 403 });
    client.get.mockRejectedValue(denied);
    client.post.mockRejectedValue(denied);
    await expect(api.getAll()).rejects.toBe(denied);
    await expect(api.getSummary("profile")).rejects.toBe(denied);
    await expect(api.convertToBuyer("profile", {})).rejects.toBe(denied);
  });
});

describe("interested explicit demo mode", () => {
  async function finish<T>(promise: Promise<T>): Promise<T> {
    const [value] = await Promise.all([
      promise,
      jest.advanceTimersByTimeAsync(300),
    ]);
    return value;
  }
  it("filters fixture leads and supports create, partial update and delete", async () => {
    const { api, client } = await load(true);
    jest.useFakeTimers();
    expect(
      (await finish(api.getAll({ name: "Lucia", status: "interested" }))).data,
    ).toHaveLength(1);
    const created = await finish(
      api.create({
        ...input,
        lastContactAt: new Date("2026-09-01"),
        nextContactAt: new Date("2026-10-01"),
        consentRecordedAt: new Date("2026-09-02"),
      }),
    );
    expect(created.lastContactAt).toBe("2026-09-01T00:00:00.000Z");
    const updated = await finish(
      api.update(created.id, {
        operations: ["sale"],
        lastContactAt: new Date("2026-10-03"),
        nextContactAt: new Date("2026-10-04"),
        consentRecordedAt: new Date("2026-10-05"),
      }),
    );
    expect(updated).toMatchObject({
      operation: "sale",
      operations: ["sale"],
      nextContactAt: "2026-10-04T00:00:00.000Z",
    });
    expect(
      (await finish(api.update(created.id, { operation: "rent" }))).operations,
    ).toEqual(["rent"]);
    expect(
      (await finish(api.update(created.id, { notes: "Texto" }))).operation,
    ).toBe("rent");
    await finish(api.sendInitialMessage(created.id));
    await finish(api.remove(created.id));
    await finish(api.remove("unknown"));
    await expect(finish(api.update("unknown", {}))).rejects.toThrow(
      "Interested profile not found",
    );
    expect(client.post).not.toHaveBeenCalled();
    expect(client.patch).not.toHaveBeenCalled();
  });
  it("returns explicit demo summary, timeline, metrics, empty matches and duplicates", async () => {
    const { api, client } = await load(true);
    jest.useFakeTimers();
    expect(await finish(api.getSummary("int-1"))).toMatchObject({
      profile: { id: "int-1" },
      stageHistory: [],
      activities: [],
      matches: [],
      visits: [],
    });
    await expect(finish(api.getSummary("unknown"))).rejects.toThrow(
      "Not found",
    );
    expect(await finish(api.getTimeline("int-1"))).toEqual([]);
    expect(await finish(api.refreshMatches("int-1"))).toEqual([]);
    expect(await finish(api.getMatches("int-1"))).toEqual([]);
    expect(await finish(api.getDuplicates())).toEqual([]);
    expect(await finish(api.getMetrics())).toMatchObject({
      totalLeads: 2,
      conversionRate: 0,
    });
    expect((await finish(api.changeStage("int-1", "tenant"))).status).toBe(
      "tenant",
    );
    await expect(finish(api.changeStage("unknown", "buyer"))).rejects.toThrow(
      "Not found",
    );
    expect(client.get).not.toHaveBeenCalled();
  });
  it("creates a demo activity with pending default or explicit completion and rejects unsupported edits", async () => {
    const { api } = await load(true);
    jest.useFakeTimers();
    expect(
      (
        await finish(
          api.addActivity("int-1", { type: "task", subject: "Llamar" }),
        )
      ).status,
    ).toBe("pending");
    expect(
      (
        await finish(
          api.addActivity("int-1", {
            type: "task",
            subject: "Llamar",
            status: "completed",
          }),
        )
      ).status,
    ).toBe("completed");
    await expect(
      finish(api.updateActivity("int-1", "activity", {})),
    ).rejects.toThrow("Not available in mock");
    await expect(
      finish(api.updateMatch("int-1", "match", "accepted")),
    ).rejects.toThrow("Not available in mock");
  });
  it("reuses tenant conversion identifiers and handles optional demo emails", async () => {
    const { api } = await load(true);
    jest.useFakeTimers();
    expect((await finish(api.convertToTenant("int-2", {}))).tenant.id).toBe(
      "1",
    );
    const converted = await finish(
      api.convertToTenant("int-1", { email: "ana@example.invalid" }),
    );
    expect(converted.tenant.id).toBe("tenant-int-1");
    expect(converted.user.email).toBe("ana@example.invalid");
    await expect(finish(api.convertToTenant("unknown", {}))).rejects.toThrow(
      "Interested profile not found",
    );
  });
  it("supports a demo buyer independently or with the explicitly supplied payment plan", async () => {
    const { api } = await load(true);
    jest.useFakeTimers();
    const independent = await finish(api.convertToBuyer("int-1", {}));
    expect(independent.buyer.id).toBe("buyer-int-1");
    expect(independent.agreement).toBeNull();
    expect(independent.user.email).toContain("interesado.int-1");
    const planned = await finish(
      api.convertToBuyer("int-1", {
        folderId: "folder",
        email: "buyer@example.invalid",
      }),
    );
    expect(planned.agreement.id).toBe("sale-int-1");
    expect(planned.user.email).toBe("buyer@example.invalid");
    const blank = await finish(
      api.create({
        ...input,
        firstName: undefined,
        lastName: undefined,
        email: "known@example.invalid",
      }),
    );
    const knownEmail = await finish(api.convertToBuyer(blank.id, {}));
    expect(knownEmail.buyer).toMatchObject({
      firstName: "",
      lastName: "",
      email: "known@example.invalid",
    });
    await expect(finish(api.convertToBuyer("unknown", {}))).rejects.toThrow(
      "Interested profile not found",
    );
  });
});
