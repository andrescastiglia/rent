export {};

type MockedApiClient = {
  get: jest.Mock;
  post: jest.Mock;
  patch: jest.Mock;
  delete: jest.Mock;
};

type MockedAuth = {
  getToken: jest.Mock;
};

async function loadBuyersApi(isMock: boolean): Promise<{
  buyersApi: typeof import("./buyers").buyersApi;
  apiClient: MockedApiClient;
  auth: MockedAuth;
}> {
  jest.resetModules();

  const apiClient: MockedApiClient = {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  };
  const auth: MockedAuth = { getToken: jest.fn() };

  jest.doMock("../api", () => ({ apiClient, IS_MOCK_MODE: isMock }));
  jest.doMock("../auth", () => auth);

  const { buyersApi } = await import("./buyers");
  return { buyersApi, apiClient, auth };
}

async function resolveMockDelay<T>(promise: Promise<T>): Promise<T> {
  await jest.advanceTimersByTimeAsync(500);
  return promise;
}

describe("buyersApi", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─── Mock mode ─────────────────────────────────────────────────────────────

  describe("mock mode (IS_MOCK_MODE=true)", () => {
    describe("getAll", () => {
      it("returns an empty array when no buyers have been created", async () => {
        const { buyersApi, apiClient } = await loadBuyersApi(true);
        const result = await resolveMockDelay(buyersApi.getAll());
        expect(result).toEqual([]);
        expect(apiClient.get).not.toHaveBeenCalled();
      });

      it("returns all buyers when no name filter is given", async () => {
        const { buyersApi } = await loadBuyersApi(true);
        await resolveMockDelay(
          buyersApi.create({ firstName: "Juan", lastName: "Pérez" }),
        );
        await resolveMockDelay(
          buyersApi.create({ firstName: "Ana", lastName: "García" }),
        );
        const result = await resolveMockDelay(buyersApi.getAll());
        expect(result).toHaveLength(2);
      });

      it("filters by name case-insensitively", async () => {
        const { buyersApi } = await loadBuyersApi(true);
        await resolveMockDelay(
          buyersApi.create({ firstName: "Juan", lastName: "Pérez" }),
        );
        await resolveMockDelay(
          buyersApi.create({ firstName: "Ana", lastName: "García" }),
        );
        const result = await resolveMockDelay(
          buyersApi.getAll({ name: "juan" }),
        );
        expect(result).toHaveLength(1);
        expect(result[0].firstName).toBe("Juan");
      });

      it("returns empty array when name filter does not match any buyer", async () => {
        const { buyersApi } = await loadBuyersApi(true);
        await resolveMockDelay(
          buyersApi.create({ firstName: "Juan", lastName: "Pérez" }),
        );
        const result = await resolveMockDelay(
          buyersApi.getAll({ name: "nobody" }),
        );
        expect(result).toEqual([]);
      });

      it("matches against full name (firstName + lastName)", async () => {
        const { buyersApi } = await loadBuyersApi(true);
        await resolveMockDelay(
          buyersApi.create({ firstName: "Carlos", lastName: "Rodríguez" }),
        );
        const result = await resolveMockDelay(
          buyersApi.getAll({ name: "carlos rodríguez" }),
        );
        expect(result).toHaveLength(1);
        expect(result[0].firstName).toBe("Carlos");
      });
    });

    describe("getById", () => {
      it("returns null when the buyer does not exist", async () => {
        const { buyersApi } = await loadBuyersApi(true);
        const result = await resolveMockDelay(buyersApi.getById("nonexistent"));
        expect(result).toBeNull();
      });

      it("returns the buyer when the id exists", async () => {
        const { buyersApi } = await loadBuyersApi(true);
        const created = await resolveMockDelay(
          buyersApi.create({ firstName: "María", lastName: "López" }),
        );
        const found = await resolveMockDelay(buyersApi.getById(created.id));
        expect(found).not.toBeNull();
        expect(found?.id).toBe(created.id);
        expect(found?.firstName).toBe("María");
        expect(found?.lastName).toBe("López");
      });
    });

    describe("create", () => {
      it("creates a new buyer with all provided fields", async () => {
        const { buyersApi } = await loadBuyersApi(true);
        const input = {
          firstName: "Pedro",
          lastName: "González",
          email: "pedro@example.com",
          phone: "+54 9 11 1234-5678",
          dni: "30123456",
          notes: "Interesado en propiedades en Palermo",
          interestedProfileId: "profile-1",
        };
        const result = await resolveMockDelay(buyersApi.create(input));
        expect(result.firstName).toBe("Pedro");
        expect(result.lastName).toBe("González");
        expect(result.email).toBe("pedro@example.com");
        expect(result.phone).toBe("+54 9 11 1234-5678");
        expect(result.dni).toBe("30123456");
        expect(result.notes).toBe("Interesado en propiedades en Palermo");
        expect(result.interestedProfileId).toBe("profile-1");
        expect(result.id).toBeDefined();
        expect(result.createdAt).toBeDefined();
        expect(result.updatedAt).toBeDefined();
      });

      it("sets nullable fields to null when omitted", async () => {
        const { buyersApi } = await loadBuyersApi(true);
        const result = await resolveMockDelay(
          buyersApi.create({ firstName: "Min", lastName: "Buyer" }),
        );
        expect(result.email).toBeNull();
        expect(result.phone).toBeNull();
        expect(result.dni).toBeNull();
        expect(result.notes).toBeNull();
        expect(result.interestedProfileId).toBeNull();
      });

      it("prepends the new buyer to the list (most recent first)", async () => {
        const { buyersApi } = await loadBuyersApi(true);
        await resolveMockDelay(
          buyersApi.create({ firstName: "First", lastName: "Buyer" }),
        );
        const second = await resolveMockDelay(
          buyersApi.create({ firstName: "Second", lastName: "Buyer" }),
        );
        const all = await resolveMockDelay(buyersApi.getAll());
        expect(all).toHaveLength(2);
        expect(all[0].id).toBe(second.id);
      });

      it("does not call apiClient.post", async () => {
        const { buyersApi, apiClient } = await loadBuyersApi(true);
        await resolveMockDelay(
          buyersApi.create({ firstName: "Test", lastName: "Buyer" }),
        );
        expect(apiClient.post).not.toHaveBeenCalled();
      });
    });

    describe("update", () => {
      it("updates and returns the updated buyer", async () => {
        const { buyersApi } = await loadBuyersApi(true);
        const created = await resolveMockDelay(
          buyersApi.create({ firstName: "Jorge", lastName: "López" }),
        );
        const updated = await resolveMockDelay(
          buyersApi.update(created.id, {
            firstName: "Jorge Actualizado",
            notes: "nueva nota",
          }),
        );
        expect(updated.id).toBe(created.id);
        expect(updated.firstName).toBe("Jorge Actualizado");
        expect(updated.notes).toBe("nueva nota");
        expect(updated.lastName).toBe("López");
      });

      it("persists the update in the MOCK_BUYERS list", async () => {
        const { buyersApi } = await loadBuyersApi(true);
        const created = await resolveMockDelay(
          buyersApi.create({ firstName: "Test", lastName: "Buyer" }),
        );
        await resolveMockDelay(
          buyersApi.update(created.id, { firstName: "Updated" }),
        );
        const found = await resolveMockDelay(buyersApi.getById(created.id));
        expect(found?.firstName).toBe("Updated");
      });

      it("throws 'Buyer not found' when id does not exist", async () => {
        const { buyersApi } = await loadBuyersApi(true);
        const assertion = expect(
          buyersApi.update("nonexistent-id", { firstName: "Nobody" }),
        ).rejects.toThrow("Buyer not found");
        await jest.advanceTimersByTimeAsync(500);
        await assertion;
      });
    });
  });

  // ─── Real API mode ─────────────────────────────────────────────────────────

  describe("real API mode (IS_MOCK_MODE=false)", () => {
    describe("getAll", () => {
      it("calls apiClient.get('/buyers', token) with no filters", async () => {
        const { buyersApi, apiClient, auth } = await loadBuyersApi(false);
        auth.getToken.mockReturnValue("token-real");
        apiClient.get.mockResolvedValue([]);

        await buyersApi.getAll();
        expect(apiClient.get).toHaveBeenCalledWith("/buyers", "token-real");
      });

      it("appends name query param when provided", async () => {
        const { buyersApi, apiClient, auth } = await loadBuyersApi(false);
        auth.getToken.mockReturnValue("tok");
        apiClient.get.mockResolvedValue([]);

        await buyersApi.getAll({ name: "Juan" });
        expect(apiClient.get).toHaveBeenCalledWith(
          expect.stringContaining("name=Juan"),
          "tok",
        );
      });

      it("appends email query param when provided", async () => {
        const { buyersApi, apiClient, auth } = await loadBuyersApi(false);
        auth.getToken.mockReturnValue("tok");
        apiClient.get.mockResolvedValue([]);

        await buyersApi.getAll({ email: "juan@test.com" });
        const calledUrl: string = apiClient.get.mock.calls[0][0] as string;
        expect(calledUrl).toContain("email=");
        expect(calledUrl).toContain("juan");
      });

      it("appends phone and limit query params when provided", async () => {
        const { buyersApi, apiClient, auth } = await loadBuyersApi(false);
        auth.getToken.mockReturnValue("tok");
        apiClient.get.mockResolvedValue([]);

        await buyersApi.getAll({ phone: "5551234", limit: 20 });
        expect(apiClient.get).toHaveBeenCalledWith(
          expect.stringContaining("phone=5551234"),
          "tok",
        );
        expect(apiClient.get).toHaveBeenCalledWith(
          expect.stringContaining("limit=20"),
          "tok",
        );
      });

      it("maps array response using mapBuyer with user fallbacks", async () => {
        const { buyersApi, apiClient, auth } = await loadBuyersApi(false);
        auth.getToken.mockReturnValue("tok");
        apiClient.get.mockResolvedValue([
          {
            id: "b1",
            userId: "u1",
            companyId: "c1",
            user: {
              id: "u1",
              firstName: "Carlos",
              lastName: "Ruiz",
              email: "carlos@example.com",
              phone: "111-222",
            },
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ]);

        const result = await buyersApi.getAll();
        expect(result).toHaveLength(1);
        expect(result[0].firstName).toBe("Carlos");
        expect(result[0].lastName).toBe("Ruiz");
        expect(result[0].email).toBe("carlos@example.com");
        expect(result[0].phone).toBe("111-222");
        expect(result[0].userId).toBe("u1");
      });

      it("maps paginated response { data, total, page, limit }", async () => {
        const { buyersApi, apiClient, auth } = await loadBuyersApi(false);
        auth.getToken.mockReturnValue("tok");
        apiClient.get.mockResolvedValue({
          data: [
            {
              id: "b2",
              firstName: "Ana",
              lastName: "Martínez",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
          total: 1,
          page: 1,
          limit: 10,
        });

        const result = await buyersApi.getAll();
        expect(result).toHaveLength(1);
        expect(result[0].firstName).toBe("Ana");
        expect(result[0].lastName).toBe("Martínez");
      });
    });

    describe("getById", () => {
      it("calls apiClient.get('/buyers/:id', token) and maps the result", async () => {
        const { buyersApi, apiClient, auth } = await loadBuyersApi(false);
        auth.getToken.mockReturnValue("tok");
        apiClient.get.mockResolvedValue({
          id: "b1",
          firstName: "Test",
          lastName: "User",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        });

        const result = await buyersApi.getById("b1");
        expect(apiClient.get).toHaveBeenCalledWith("/buyers/b1", "tok");
        expect(result?.id).toBe("b1");
        expect(result?.firstName).toBe("Test");
      });

      it("returns null when apiClient.get throws", async () => {
        const { buyersApi, apiClient, auth } = await loadBuyersApi(false);
        auth.getToken.mockReturnValue("tok");
        apiClient.get.mockRejectedValue(new Error("Not Found"));

        const result = await buyersApi.getById("nonexistent");
        expect(result).toBeNull();
      });
    });

    describe("create", () => {
      it("calls apiClient.post('/buyers', data, token) and maps the result", async () => {
        const { buyersApi, apiClient, auth } = await loadBuyersApi(false);
        auth.getToken.mockReturnValue("tok");
        const input = { firstName: "Nuevo", lastName: "Comprador" };
        const backendResponse = {
          id: "b-new",
          firstName: "Nuevo",
          lastName: "Comprador",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        };
        apiClient.post.mockResolvedValue(backendResponse);

        const result = await buyersApi.create(input);
        expect(apiClient.post).toHaveBeenCalledWith("/buyers", input, "tok");
        expect(result.id).toBe("b-new");
        expect(result.firstName).toBe("Nuevo");
      });
    });

    describe("update", () => {
      it("calls apiClient.patch('/buyers/:id', data, token) and maps the result", async () => {
        const { buyersApi, apiClient, auth } = await loadBuyersApi(false);
        auth.getToken.mockReturnValue("tok");
        const patchData = { firstName: "Updated" };
        const backendResponse = {
          id: "b1",
          firstName: "Updated",
          lastName: "Buyer",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        };
        apiClient.patch.mockResolvedValue(backendResponse);

        const result = await buyersApi.update("b1", patchData);
        expect(apiClient.patch).toHaveBeenCalledWith(
          "/buyers/b1",
          patchData,
          "tok",
        );
        expect(result.firstName).toBe("Updated");
        expect(result.lastName).toBe("Buyer");
      });
    });

    // ─── mapBuyer fallback logic ──────────────────────────────────────────────

    describe("mapBuyer fallback logic", () => {
      it("uses user.firstName and user.lastName when direct fields are absent", async () => {
        const { buyersApi, apiClient, auth } = await loadBuyersApi(false);
        auth.getToken.mockReturnValue("tok");
        apiClient.get.mockResolvedValue({
          id: "b1",
          user: {
            id: "u1",
            firstName: "DesdUser",
            lastName: "ApellidoUser",
            email: "user@e.com",
            phone: "999",
          },
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        });

        const result = await buyersApi.getById("b1");
        expect(result?.firstName).toBe("DesdUser");
        expect(result?.lastName).toBe("ApellidoUser");
        expect(result?.email).toBe("user@e.com");
        expect(result?.phone).toBe("999");
        expect(result?.userId).toBe("u1");
      });

      it("prefers direct fields over user fields when both are present", async () => {
        const { buyersApi, apiClient, auth } = await loadBuyersApi(false);
        auth.getToken.mockReturnValue("tok");
        apiClient.get.mockResolvedValue({
          id: "b1",
          firstName: "Directo",
          lastName: "Campo",
          email: "directo@e.com",
          user: {
            firstName: "UserField",
            lastName: "UserField",
            email: "user@e.com",
          },
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        });

        const result = await buyersApi.getById("b1");
        expect(result?.firstName).toBe("Directo");
        expect(result?.lastName).toBe("Campo");
        expect(result?.email).toBe("directo@e.com");
      });

      it("falls back to empty string when both direct and user firstName are absent", async () => {
        const { buyersApi, apiClient, auth } = await loadBuyersApi(false);
        auth.getToken.mockReturnValue("tok");
        apiClient.get.mockResolvedValue({
          id: "b1",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        });

        const result = await buyersApi.getById("b1");
        expect(result?.firstName).toBe("");
        expect(result?.lastName).toBe("");
        expect(result?.email).toBeNull();
        expect(result?.phone).toBeNull();
        expect(result?.dni).toBeNull();
        expect(result?.notes).toBeNull();
      });

      it("maps interestedProfileId and companyId correctly", async () => {
        const { buyersApi, apiClient, auth } = await loadBuyersApi(false);
        auth.getToken.mockReturnValue("tok");
        apiClient.get.mockResolvedValue({
          id: "b1",
          companyId: "comp-1",
          interestedProfileId: "profile-99",
          firstName: "Test",
          lastName: "Buyer",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        });

        const result = await buyersApi.getById("b1");
        expect(result?.companyId).toBe("comp-1");
        expect(result?.interestedProfileId).toBe("profile-99");
      });
    });
  });
});
