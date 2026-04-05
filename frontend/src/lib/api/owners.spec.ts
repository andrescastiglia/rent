type MockedApiClient = {
  get: jest.Mock;
  post: jest.Mock;
  patch: jest.Mock;
  delete: jest.Mock;
};

type MockedAuth = {
  getToken: jest.Mock;
};

async function loadOwnersApi(isMock: boolean): Promise<{
  apiClient: MockedApiClient;
  auth: MockedAuth;
  ownersApi: typeof import("./owners").ownersApi;
}> {
  jest.resetModules();

  if (!isMock) {
    process.env.NODE_ENV = "production";
    process.env.CI = "";
    process.env.NEXT_PUBLIC_MOCK_MODE = "";
  }

  const apiClient: MockedApiClient = {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  };

  const auth: MockedAuth = {
    getToken: jest.fn(),
  };

  jest.doMock("../api", () => ({ apiClient }));
  jest.doMock("../auth", () => ({ getToken: auth.getToken }));

  const { ownersApi } = await import("./owners");

  if (!isMock) {
    process.env.NODE_ENV = "test";
  }

  return { ownersApi, apiClient, auth };
}

async function resolveMockDelay<T>(promise: Promise<T>): Promise<T> {
  await jest.advanceTimersByTimeAsync(500);
  return promise;
}

describe("ownersApi", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("mock mode", () => {
    it("getAll returns the MOCK_OWNERS array with 2 entries", async () => {
      const { ownersApi, apiClient } = await loadOwnersApi(true);
      const result = await resolveMockDelay(ownersApi.getAll());
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("owner1");
      expect(result[0].firstName).toBe("Carlos");
      expect(result[1].id).toBe("owner2");
      expect(result[1].firstName).toBe("Ana");
      expect(apiClient.get).not.toHaveBeenCalled();
    });

    it("getById returns the owner when the id exists", async () => {
      const { ownersApi } = await loadOwnersApi(true);
      const result = await resolveMockDelay(ownersApi.getById("owner1"));
      expect(result).not.toBeNull();
      expect(result?.id).toBe("owner1");
      expect(result?.email).toBe("carlos.rodriguez@example.com");
    });

    it("getById returns null when the id does not exist", async () => {
      const { ownersApi } = await loadOwnersApi(true);
      const result = await resolveMockDelay(ownersApi.getById("nonexistent"));
      expect(result).toBeNull();
    });

    it("create adds a new owner to MOCK_OWNERS and returns it", async () => {
      const { ownersApi } = await loadOwnersApi(true);
      const input = {
        firstName: "Juan",
        lastName: "Pérez",
        email: "juan.perez@example.com",
        phone: "+54 9 11 5555-9999",
        taxId: "20-11111111-1",
        taxIdType: "CUIT" as const,
        address: "Av. Corrientes 1234",
        city: "Buenos Aires",
        state: "CABA",
        country: "Argentina",
        postalCode: "1043",
        bankName: "Banco BBVA",
        bankAccountType: "savings" as const,
        bankAccountNumber: "123456",
        bankCbu: "0170000000000000000003",
        bankAlias: "juan.perez.alq",
        paymentMethod: "bank_transfer" as const,
        commissionRate: 9,
        notes: "Nuevo propietario",
      };
      const created = await resolveMockDelay(ownersApi.create(input));
      expect(created.firstName).toBe("Juan");
      expect(created.lastName).toBe("Pérez");
      expect(created.id).toBeDefined();
      expect(created.companyId).toBe("company-1");
      expect(created.taxIdType).toBe("CUIT");
      expect(created.commissionRate).toBe(9);

      const all = await resolveMockDelay(ownersApi.getAll());
      expect(all).toHaveLength(3);
      expect(all[0].id).toBe(created.id);
    });

    it("create uses defaults for omitted fields", async () => {
      const { ownersApi } = await loadOwnersApi(true);
      const created = await resolveMockDelay(
        ownersApi.create({ firstName: "Min", lastName: "Owner" }),
      );
      expect(created.taxIdType).toBe("CUIT");
      expect(created.country).toBe("Argentina");
      expect(created.paymentMethod).toBe("bank_transfer");
      expect(created.commissionRate).toBe(0);
      expect(created.email).toBeNull();
    });

    it("update with existing id updates and returns the updated owner", async () => {
      const { ownersApi } = await loadOwnersApi(true);
      const updated = await resolveMockDelay(
        ownersApi.update("owner1", {
          firstName: "Carlos Updated",
          commissionRate: 12,
        }),
      );
      expect(updated.id).toBe("owner1");
      expect(updated.firstName).toBe("Carlos Updated");
      expect(updated.commissionRate).toBe(12);
      expect(updated.lastName).toBe("Rodríguez");
    });

    it("update with non-existing id throws 'Owner not found'", async () => {
      const { ownersApi } = await loadOwnersApi(true);
      const updatePromise = expect(
        ownersApi.update("nonexistent", { firstName: "Nobody" }),
      ).rejects.toThrow("Owner not found");
      await jest.advanceTimersByTimeAsync(500);
      await updatePromise;
    });

    it("getActivities returns an empty array", async () => {
      const { ownersApi } = await loadOwnersApi(true);
      const result = await resolveMockDelay(ownersApi.getActivities("owner1"));
      expect(result).toEqual([]);
    });

    it("updateActivity returns activity with passed data", async () => {
      const { ownersApi } = await loadOwnersApi(true);
      const result = await resolveMockDelay(
        ownersApi.updateActivity("owner1", "activity1", {
          status: "done",
          body: "completed task",
          completedAt: "2026-03-01T00:00:00.000Z",
        }),
      );
      expect(result.id).toBe("activity1");
      expect(result.ownerId).toBe("owner1");
      expect(result.status).toBe("done");
      expect(result.body).toBe("completed task");
      expect(result.completedAt).toBe("2026-03-01T00:00:00.000Z");
      expect(result.type).toBe("task");
    });

    it("updateActivity uses defaults when optional fields are omitted", async () => {
      const { ownersApi } = await loadOwnersApi(true);
      const result = await resolveMockDelay(
        ownersApi.updateActivity("owner1", "activity2", {}),
      );
      expect(result.status).toBe("pending");
      expect(result.body).toBeNull();
      expect(result.completedAt).toBeNull();
    });

    it("getSettlements returns an empty array", async () => {
      const { ownersApi } = await loadOwnersApi(true);
      const result = await resolveMockDelay(ownersApi.getSettlements("owner1"));
      expect(result).toEqual([]);
    });

    it("registerSettlementPayment returns a mock settlement object using payload values", async () => {
      const { ownersApi } = await loadOwnersApi(true);
      const result = await resolveMockDelay(
        ownersApi.registerSettlementPayment("owner1", "settlement1", {
          paymentDate: "2026-01-15",
          reference: "REF-001",
          notes: "test note",
          amount: 85000,
        }),
      );
      expect(result.id).toBe("settlement1");
      expect(result.ownerId).toBe("owner1");
      expect(result.netAmount).toBe(85000);
      expect(result.status).toBe("completed");
      expect(result.processedAt).toBe("2026-01-15");
      expect(result.transferReference).toBe("REF-001");
      expect(result.notes).toBe("test note");
      expect(result.currencyCode).toBe("ARS");
    });

    it("registerSettlementPayment uses defaults when payload fields are omitted", async () => {
      const { ownersApi } = await loadOwnersApi(true);
      const result = await resolveMockDelay(
        ownersApi.registerSettlementPayment("owner2", "settlement2", {}),
      );
      expect(result.netAmount).toBe(90000);
      expect(result.transferReference).toBeNull();
      expect(result.notes).toBeNull();
    });

    it("listSettlementPayments returns an empty array", async () => {
      const { ownersApi } = await loadOwnersApi(true);
      const result = await resolveMockDelay(ownersApi.listSettlementPayments());
      expect(result).toEqual([]);
    });

    it("getMyProfile returns the first mock owner", async () => {
      const { ownersApi } = await loadOwnersApi(true);
      const result = await resolveMockDelay(ownersApi.getMyProfile());
      expect(result.id).toBe("owner1");
      expect(result.firstName).toBe("Carlos");
    });

    it("getMySummary returns a mock summary object", async () => {
      const { ownersApi } = await loadOwnersApi(true);
      const result = await resolveMockDelay(ownersApi.getMySummary());
      expect(result).toEqual({
        propertiesCount: 3,
        activeLeases: 2,
        pendingSettlements: 1,
        totalIncomeCurrentMonth: 150000,
        currencyCode: "ARS",
      });
    });
  });

  describe("real API mode", () => {
    it("getAll calls apiClient.get('/owners', token) and maps results via mapOwner using user fallbacks", async () => {
      const { ownersApi, apiClient, auth } = await loadOwnersApi(false);
      auth.getToken.mockReturnValue("token-xyz");
      apiClient.get.mockResolvedValue([
        {
          id: "1",
          userId: "u1",
          companyId: "c1",
          user: {
            firstName: "John",
            lastName: "Doe",
            email: "john@example.com",
            phone: "555-1111",
          },
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "2",
          userId: "u2",
          companyId: "c1",
          firstName: "Direct",
          lastName: "Name",
          email: null,
          taxId: "20-99999999-9",
          taxIdType: "CUIT",
          address: "Calle 123",
          city: "Córdoba",
          state: "Córdoba",
          country: "Argentina",
          postalCode: "5000",
          bankName: "Banco Macro",
          bankAccountType: "checking",
          bankAccountNumber: "654321",
          bankCbu: "0110000000000000000099",
          bankAlias: "direct.name",
          paymentMethod: "bank_transfer",
          commissionRate: 7,
          notes: "nota",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ]);

      const result = await ownersApi.getAll();

      expect(apiClient.get).toHaveBeenCalledWith("/owners", "token-xyz");
      expect(result).toHaveLength(2);
      expect(result[0].firstName).toBe("John");
      expect(result[0].lastName).toBe("Doe");
      expect(result[0].email).toBe("john@example.com");
      expect(result[0].phone).toBe("555-1111");
      expect(result[1].firstName).toBe("Direct");
      expect(result[1].email).toBeNull();
      expect(result[1].taxId).toBe("20-99999999-9");
      expect(result[1].bankAlias).toBe("direct.name");
    });

    it("getById calls apiClient.get('/owners/id', token) and maps result", async () => {
      const { ownersApi, apiClient, auth } = await loadOwnersApi(false);
      auth.getToken.mockReturnValue("token-xyz");
      apiClient.get.mockResolvedValue({
        id: "owner1",
        userId: "u1",
        companyId: "c1",
        firstName: "Carlos",
        lastName: "Rodriguez",
        email: "carlos@example.com",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });

      const result = await ownersApi.getById("owner1");

      expect(apiClient.get).toHaveBeenCalledWith("/owners/owner1", "token-xyz");
      expect(result).not.toBeNull();
      expect(result?.id).toBe("owner1");
      expect(result?.firstName).toBe("Carlos");
    });

    it("getById returns null when apiClient throws", async () => {
      const { ownersApi, apiClient, auth } = await loadOwnersApi(false);
      auth.getToken.mockReturnValue("token-xyz");
      apiClient.get.mockRejectedValue(new Error("Not found"));

      const result = await ownersApi.getById("nonexistent");

      expect(result).toBeNull();
    });

    it("create calls apiClient.post('/owners', data, token) and maps result via mapOwner", async () => {
      const { ownersApi, apiClient, auth } = await loadOwnersApi(false);
      auth.getToken.mockReturnValue("token-xyz");
      apiClient.post.mockResolvedValue({
        id: "new-owner",
        userId: "u1",
        companyId: "c1",
        firstName: "New",
        lastName: "Owner",
        email: "new@example.com",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });

      const input = {
        firstName: "New",
        lastName: "Owner",
        email: "new@example.com",
      };
      const result = await ownersApi.create(input);

      expect(apiClient.post).toHaveBeenCalledWith(
        "/owners",
        input,
        "token-xyz",
      );
      expect(result.id).toBe("new-owner");
      expect(result.firstName).toBe("New");
    });

    it("update calls apiClient.patch('/owners/id', data, token) and maps result via mapOwner", async () => {
      const { ownersApi, apiClient, auth } = await loadOwnersApi(false);
      auth.getToken.mockReturnValue("token-xyz");
      apiClient.patch.mockResolvedValue({
        id: "owner1",
        userId: "u1",
        companyId: "c1",
        firstName: "Updated",
        lastName: "Owner",
        email: "updated@example.com",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      });

      const result = await ownersApi.update("owner1", { firstName: "Updated" });

      expect(apiClient.patch).toHaveBeenCalledWith(
        "/owners/owner1",
        { firstName: "Updated" },
        "token-xyz",
      );
      expect(result.firstName).toBe("Updated");
    });

    it("getActivities calls apiClient.get with correct URL", async () => {
      const { ownersApi, apiClient, auth } = await loadOwnersApi(false);
      auth.getToken.mockReturnValue("token-xyz");
      apiClient.get.mockResolvedValue([]);

      const result = await ownersApi.getActivities("owner1");

      expect(apiClient.get).toHaveBeenCalledWith(
        "/owners/owner1/activities",
        "token-xyz",
      );
      expect(result).toEqual([]);
    });

    it("updateActivity calls apiClient.patch with correct URL", async () => {
      const { ownersApi, apiClient, auth } = await loadOwnersApi(false);
      auth.getToken.mockReturnValue("token-xyz");
      const mockActivity = {
        id: "act1",
        ownerId: "owner1",
        type: "task",
        status: "done",
        subject: "Test",
        body: "done body",
        completedAt: "2026-02-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-02-01T00:00:00.000Z",
      };
      apiClient.patch.mockResolvedValue(mockActivity);

      const data = { status: "done" as const, body: "done body" };
      const result = await ownersApi.updateActivity("owner1", "act1", data);

      expect(apiClient.patch).toHaveBeenCalledWith(
        "/owners/owner1/activities/act1",
        data,
        "token-xyz",
      );
      expect(result.id).toBe("act1");
      expect(result.status).toBe("done");
    });

    it("getSettlements calls apiClient.get with status and limit params and maps via mapSettlement", async () => {
      const { ownersApi, apiClient, auth } = await loadOwnersApi(false);
      auth.getToken.mockReturnValue("token-xyz");
      const rawSettlement = {
        id: "s1",
        ownerId: "owner1",
        ownerName: "Carlos Rodriguez",
        period: "2026-01",
        grossAmount: "100000",
        commissionAmount: "10000",
        withholdingsAmount: "500",
        netAmount: "89500",
        status: "pending",
        scheduledDate: "2026-01-15",
        processedAt: null,
        transferReference: null,
        notes: null,
        receiptPdfUrl: null,
        receiptName: null,
        currencyCode: "ARS",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
      apiClient.get.mockResolvedValue([rawSettlement]);

      const result = await ownersApi.getSettlements("owner1", "pending", 5);

      expect(apiClient.get).toHaveBeenCalledWith(
        "/owners/owner1/settlements?status=pending&limit=5",
        "token-xyz",
      );
      expect(result).toHaveLength(1);
      expect(result[0].grossAmount).toBe(100000);
      expect(result[0].commissionAmount).toBe(10000);
      expect(result[0].withholdingsAmount).toBe(500);
      expect(result[0].netAmount).toBe(89500);
      expect(result[0].scheduledDate).toBe("2026-01-15");
      expect(result[0].processedAt).toBeNull();
    });

    it("getSettlements uses default status='all' and limit=12 when not provided", async () => {
      const { ownersApi, apiClient, auth } = await loadOwnersApi(false);
      auth.getToken.mockReturnValue("token-xyz");
      apiClient.get.mockResolvedValue([]);

      await ownersApi.getSettlements("owner1");

      expect(apiClient.get).toHaveBeenCalledWith(
        "/owners/owner1/settlements?status=all&limit=12",
        "token-xyz",
      );
    });

    it("registerSettlementPayment calls apiClient.post and maps via mapSettlement", async () => {
      const { ownersApi, apiClient, auth } = await loadOwnersApi(false);
      auth.getToken.mockReturnValue("token-xyz");
      const rawSettlement = {
        id: "s1",
        ownerId: "owner1",
        ownerName: "Carlos Rodriguez",
        period: "2026-01",
        grossAmount: 100000,
        commissionAmount: 10000,
        withholdingsAmount: 0,
        netAmount: 90000,
        status: "completed",
        scheduledDate: null,
        processedAt: "2026-01-15",
        transferReference: "REF-001",
        notes: "pagado",
        receiptPdfUrl: "http://example.com/receipt.pdf",
        receiptName: "receipt.pdf",
        currencyCode: "ARS",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-15T00:00:00.000Z",
      };
      apiClient.post.mockResolvedValue(rawSettlement);

      const payload = {
        paymentDate: "2026-01-15",
        reference: "REF-001",
        notes: "pagado",
        amount: 90000,
      };
      const result = await ownersApi.registerSettlementPayment(
        "owner1",
        "s1",
        payload,
      );

      expect(apiClient.post).toHaveBeenCalledWith(
        "/owners/owner1/settlements/s1/pay",
        payload,
        "token-xyz",
      );
      expect(result.id).toBe("s1");
      expect(result.status).toBe("completed");
      expect(result.transferReference).toBe("REF-001");
      expect(result.receiptPdfUrl).toBe("http://example.com/receipt.pdf");
    });

    it("listSettlementPayments calls apiClient.get and maps results via mapSettlement", async () => {
      const { ownersApi, apiClient, auth } = await loadOwnersApi(false);
      auth.getToken.mockReturnValue("token-xyz");
      apiClient.get.mockResolvedValue([
        {
          id: "s1",
          ownerId: "owner1",
          ownerName: "Carlos",
          period: "2026-01",
          grossAmount: 100000,
          commissionAmount: 10000,
          withholdingsAmount: 0,
          netAmount: 90000,
          status: "completed",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ]);

      const result = await ownersApi.listSettlementPayments(50);

      expect(apiClient.get).toHaveBeenCalledWith(
        "/owners/settlements/payments?limit=50",
        "token-xyz",
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("s1");
      expect(result[0].currencyCode).toBe("ARS");
    });

    it("listSettlementPayments uses default limit=100 when not provided", async () => {
      const { ownersApi, apiClient, auth } = await loadOwnersApi(false);
      auth.getToken.mockReturnValue("token-xyz");
      apiClient.get.mockResolvedValue([]);

      await ownersApi.listSettlementPayments();

      expect(apiClient.get).toHaveBeenCalledWith(
        "/owners/settlements/payments?limit=100",
        "token-xyz",
      );
    });

    it("getMyProfile calls apiClient.get('/owners/me', token) and maps result via mapOwner user fallbacks", async () => {
      const { ownersApi, apiClient, auth } = await loadOwnersApi(false);
      auth.getToken.mockReturnValue("token-xyz");
      apiClient.get.mockResolvedValue({
        id: "me",
        userId: "u1",
        companyId: "c1",
        user: {
          firstName: "My",
          lastName: "Profile",
          email: "me@example.com",
          phone: "123-4567",
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });

      const result = await ownersApi.getMyProfile();

      expect(apiClient.get).toHaveBeenCalledWith("/owners/me", "token-xyz");
      expect(result.firstName).toBe("My");
      expect(result.lastName).toBe("Profile");
      expect(result.email).toBe("me@example.com");
      expect(result.phone).toBe("123-4567");
    });

    it("getMySummary calls apiClient.get('/owners/me/summary') and maps primary alias fields", async () => {
      const { ownersApi, apiClient, auth } = await loadOwnersApi(false);
      auth.getToken.mockReturnValue("token-xyz");
      apiClient.get.mockResolvedValue({
        activeLeaseCount: 5,
        pendingSettlementsCount: 3,
        totalIncomeCurrentMonth: 200000,
        properties: [{}, {}, {}, {}],
        currencyCode: "USD",
      });

      const result = await ownersApi.getMySummary();

      expect(apiClient.get).toHaveBeenCalledWith(
        "/owners/me/summary",
        "token-xyz",
      );
      expect(result).toEqual({
        propertiesCount: 4,
        activeLeases: 5,
        pendingSettlements: 3,
        totalIncomeCurrentMonth: 200000,
        currencyCode: "USD",
      });
    });

    it("getMySummary maps alternative alias fields (activeLeases, pendingSettlements, totalIncome, propertiesCount)", async () => {
      const { ownersApi, apiClient, auth } = await loadOwnersApi(false);
      auth.getToken.mockReturnValue("token-xyz");
      apiClient.get.mockResolvedValue({
        activeLeases: 3,
        pendingSettlements: 1,
        totalIncome: 150000,
        propertiesCount: 2,
      });

      const result = await ownersApi.getMySummary();

      expect(result).toEqual({
        propertiesCount: 2,
        activeLeases: 3,
        pendingSettlements: 1,
        totalIncomeCurrentMonth: 150000,
        currencyCode: "ARS",
      });
    });

    it("getMySummary falls back to zeroes and 'ARS' when raw response has no matching fields", async () => {
      const { ownersApi, apiClient, auth } = await loadOwnersApi(false);
      auth.getToken.mockReturnValue("token-xyz");
      apiClient.get.mockResolvedValue({});

      const result = await ownersApi.getMySummary();

      expect(result).toEqual({
        propertiesCount: 0,
        activeLeases: 0,
        pendingSettlements: 0,
        totalIncomeCurrentMonth: 0,
        currencyCode: "ARS",
      });
    });

    it("downloadSettlementReceipt triggers file download when response is ok", async () => {
      const { ownersApi, auth } = await loadOwnersApi(false);
      auth.getToken.mockReturnValue("token-abc");

      const blob = new Blob(["pdf content"], { type: "application/pdf" });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        blob: jest.fn().mockResolvedValue(blob),
      });
      URL.createObjectURL = jest.fn().mockReturnValue("blob:mock-url");
      URL.revokeObjectURL = jest.fn();
      const clickSpy = jest
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});

      await ownersApi.downloadSettlementReceipt(
        "settlement-1",
        "custom-name.pdf",
      );

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/owners/settlements/settlement-1/receipt"),
        expect.objectContaining({
          method: "GET",
          headers: { Authorization: "Bearer token-abc" },
        }),
      );
      expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");

      clickSpy.mockRestore();
    });

    it("downloadSettlementReceipt uses default filename when none is provided", async () => {
      const { ownersApi, auth } = await loadOwnersApi(false);
      auth.getToken.mockReturnValue("token-abc");

      const blob = new Blob(["pdf"], { type: "application/pdf" });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        blob: jest.fn().mockResolvedValue(blob),
      });
      URL.createObjectURL = jest.fn().mockReturnValue("blob:mock-url-2");
      URL.revokeObjectURL = jest.fn();
      const clickSpy = jest
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});
      const appendSpy = jest.spyOn(document.body, "appendChild");

      await ownersApi.downloadSettlementReceipt("settlement-99");

      const link = appendSpy.mock.calls[0][0] as HTMLAnchorElement;
      expect(link.download).toBe("recibo-liquidacion-settlement-99.pdf");

      clickSpy.mockRestore();
      appendSpy.mockRestore();
    });

    it("downloadSettlementReceipt omits Authorization header when there is no token", async () => {
      const { ownersApi, auth } = await loadOwnersApi(false);
      auth.getToken.mockReturnValue(null);

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        blob: jest.fn(),
      });

      await expect(
        ownersApi.downloadSettlementReceipt("settlement-1"),
      ).rejects.toThrow("Failed to download owner settlement receipt");

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: "GET", headers: undefined }),
      );
    });

    it("downloadSettlementReceipt throws when response is not ok", async () => {
      const { ownersApi, auth } = await loadOwnersApi(false);
      auth.getToken.mockReturnValue("token-abc");

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        blob: jest.fn(),
      });

      await expect(
        ownersApi.downloadSettlementReceipt("settlement-1"),
      ).rejects.toThrow("Failed to download owner settlement receipt");
    });
  });
});
