import {
  MaintenanceTicketStatus,
  MaintenanceTicketPriority,
  MaintenanceTicketArea,
  MaintenanceTicketSource,
} from "@/types/maintenance";

type MockedApiClient = {
  get: jest.Mock;
  post: jest.Mock;
  patch: jest.Mock;
  delete: jest.Mock;
};

type MockedAuth = {
  getToken: jest.Mock;
};

async function loadMaintenanceApi(isMock: boolean): Promise<{
  maintenanceApi: typeof import("./maintenance").maintenanceApi;
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

  const { maintenanceApi } = await import("./maintenance");
  return { maintenanceApi, apiClient, auth };
}

async function resolveMockDelay<T>(promise: Promise<T>): Promise<T> {
  await jest.advanceTimersByTimeAsync(500);
  return promise;
}

describe("maintenanceApi", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─── Mock mode ────────────────────────────────────────────────────────────

  describe("mock mode (IS_MOCK_MODE=true)", () => {
    describe("getAll", () => {
      it("returns all 3 mock tickets when no filters are given", async () => {
        const { maintenanceApi, apiClient } = await loadMaintenanceApi(true);
        const result = await resolveMockDelay(maintenanceApi.getAll());
        expect(result).toHaveLength(3);
        expect(apiClient.get).not.toHaveBeenCalled();
      });

      it("filters by status", async () => {
        const { maintenanceApi } = await loadMaintenanceApi(true);
        const result = await resolveMockDelay(
          maintenanceApi.getAll({ status: MaintenanceTicketStatus.OPEN }),
        );
        expect(result).toHaveLength(1);
        expect(result[0].status).toBe(MaintenanceTicketStatus.OPEN);
      });

      it("filters by priority", async () => {
        const { maintenanceApi } = await loadMaintenanceApi(true);
        const result = await resolveMockDelay(
          maintenanceApi.getAll({ priority: MaintenanceTicketPriority.URGENT }),
        );
        expect(result).toHaveLength(1);
        expect(result[0].priority).toBe(MaintenanceTicketPriority.URGENT);
      });

      it("filters by propertyId", async () => {
        const { maintenanceApi } = await loadMaintenanceApi(true);
        const result = await resolveMockDelay(
          maintenanceApi.getAll({ propertyId: "mock-prop-2" }),
        );
        expect(result).toHaveLength(1);
        expect(result[0].propertyId).toBe("mock-prop-2");
      });

      it("filters by assignedToStaffId (returns empty when none assigned)", async () => {
        const { maintenanceApi } = await loadMaintenanceApi(true);
        const result = await resolveMockDelay(
          maintenanceApi.getAll({ assignedToStaffId: "staff-xyz" }),
        );
        expect(result).toHaveLength(0);
      });

      it("filters by search term matching title", async () => {
        const { maintenanceApi } = await loadMaintenanceApi(true);
        const result = await resolveMockDelay(
          maintenanceApi.getAll({ search: "cortocircuito" }),
        );
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("mock-ticket-2");
      });

      it("filters by search term matching description", async () => {
        const { maintenanceApi } = await loadMaintenanceApi(true);
        const result = await resolveMockDelay(
          maintenanceApi.getAll({ search: "enchufes" }),
        );
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("mock-ticket-2");
      });

      it("filters by search term matching property address", async () => {
        const { maintenanceApi } = await loadMaintenanceApi(true);
        const result = await resolveMockDelay(
          maintenanceApi.getAll({ search: "florida" }),
        );
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("mock-ticket-2");
      });
    });

    describe("getOne", () => {
      it("returns the matching ticket by id", async () => {
        const { maintenanceApi } = await loadMaintenanceApi(true);
        const result = await resolveMockDelay(
          maintenanceApi.getOne("mock-ticket-1"),
        );
        expect(result.id).toBe("mock-ticket-1");
      });

      it("throws 'Ticket not found' when id does not exist", async () => {
        const { maintenanceApi } = await loadMaintenanceApi(true);
        const assertion = expect(
          maintenanceApi.getOne("nonexistent-id"),
        ).rejects.toThrow("Ticket not found");
        await jest.advanceTimersByTimeAsync(500);
        await assertion;
      });
    });

    describe("create", () => {
      it("creates a new ticket and prepends it to the list", async () => {
        const { maintenanceApi } = await loadMaintenanceApi(true);
        const newTicket = await resolveMockDelay(
          maintenanceApi.create({
            propertyId: "mock-prop-new",
            title: "Nuevo problema",
            area: MaintenanceTicketArea.OTHER,
            priority: MaintenanceTicketPriority.MEDIUM,
          }),
        );
        expect(newTicket.title).toBe("Nuevo problema");
        expect(newTicket.status).toBe(MaintenanceTicketStatus.OPEN);
        expect(newTicket.propertyId).toBe("mock-prop-new");

        const all = await resolveMockDelay(maintenanceApi.getAll());
        expect(all[0].id).toBe(newTicket.id);
        expect(all).toHaveLength(4);
      });
    });

    describe("update", () => {
      it("updates the ticket and returns the updated version", async () => {
        const { maintenanceApi } = await loadMaintenanceApi(true);
        const updated = await resolveMockDelay(
          maintenanceApi.update("mock-ticket-1", {
            title: "Título actualizado",
            status: MaintenanceTicketStatus.RESOLVED,
          }),
        );
        expect(updated.id).toBe("mock-ticket-1");
        expect(updated.title).toBe("Título actualizado");
        expect(updated.status).toBe(MaintenanceTicketStatus.RESOLVED);
      });

      it("throws 'Ticket not found' when id does not exist", async () => {
        const { maintenanceApi } = await loadMaintenanceApi(true);
        const assertion = expect(
          maintenanceApi.update("no-such-ticket", { title: "X" }),
        ).rejects.toThrow("Ticket not found");
        await jest.advanceTimersByTimeAsync(500);
        await assertion;
      });
    });

    describe("remove", () => {
      it("removes the ticket from the list", async () => {
        const { maintenanceApi } = await loadMaintenanceApi(true);
        await resolveMockDelay(maintenanceApi.remove("mock-ticket-2"));
        const all = await resolveMockDelay(maintenanceApi.getAll());
        expect(all.find((t) => t.id === "mock-ticket-2")).toBeUndefined();
      });
    });

    describe("getComments", () => {
      it("returns comments for a specific ticketId", async () => {
        const { maintenanceApi } = await loadMaintenanceApi(true);
        const comments = await resolveMockDelay(
          maintenanceApi.getComments("mock-ticket-1"),
        );
        expect(comments).toHaveLength(2);
        expect(comments.every((c) => c.ticketId === "mock-ticket-1")).toBe(
          true,
        );
      });

      it("returns empty array for a ticket with no comments", async () => {
        const { maintenanceApi } = await loadMaintenanceApi(true);
        const comments = await resolveMockDelay(
          maintenanceApi.getComments("mock-ticket-3"),
        );
        expect(comments).toHaveLength(0);
      });
    });

    describe("addComment", () => {
      it("adds a new comment and returns it", async () => {
        const { maintenanceApi } = await loadMaintenanceApi(true);
        const comment = await resolveMockDelay(
          maintenanceApi.addComment("mock-ticket-2", "Nuevo comentario", false),
        );
        expect(comment.ticketId).toBe("mock-ticket-2");
        expect(comment.body).toBe("Nuevo comentario");
        expect(comment.isInternal).toBe(false);
        expect(comment.id).toMatch(/^mock-comment-/);

        const all = await resolveMockDelay(
          maintenanceApi.getComments("mock-ticket-2"),
        );
        expect(all).toHaveLength(1);
        expect(all[0].id).toBe(comment.id);
      });
    });
  });

  // ─── shouldUseMock via mock-token ─────────────────────────────────────────

  describe("shouldUseMock via mock-token prefix", () => {
    it("takes the mock path when IS_MOCK_MODE=false but token starts with 'mock-token-'", async () => {
      const { maintenanceApi, apiClient, auth } =
        await loadMaintenanceApi(false);
      auth.getToken.mockReturnValue("mock-token-abc");

      const result = await resolveMockDelay(maintenanceApi.getAll());
      expect(result).toHaveLength(3);
      expect(apiClient.get).not.toHaveBeenCalled();
    });
  });

  // ─── Real API mode ─────────────────────────────────────────────────────────

  describe("real API mode (IS_MOCK_MODE=false)", () => {
    describe("getAll", () => {
      it("calls apiClient.get with no query string when no filters", async () => {
        const { maintenanceApi, apiClient, auth } =
          await loadMaintenanceApi(false);
        auth.getToken.mockReturnValue("token-real");
        apiClient.get.mockResolvedValue([]);

        await maintenanceApi.getAll();
        expect(apiClient.get).toHaveBeenCalledWith(
          "/maintenance/tickets",
          "token-real",
        );
      });

      it("appends query params when filters are provided", async () => {
        const { maintenanceApi, apiClient, auth } =
          await loadMaintenanceApi(false);
        auth.getToken.mockReturnValue("token-real");
        apiClient.get.mockResolvedValue([]);

        await maintenanceApi.getAll({
          status: MaintenanceTicketStatus.OPEN,
          priority: MaintenanceTicketPriority.HIGH,
          propertyId: "prop-1",
          assignedToStaffId: "staff-1",
          search: "agua",
        });

        expect(apiClient.get).toHaveBeenCalledWith(
          expect.stringContaining("status=open"),
          "token-real",
        );
        expect(apiClient.get).toHaveBeenCalledWith(
          expect.stringContaining("priority=high"),
          "token-real",
        );
        expect(apiClient.get).toHaveBeenCalledWith(
          expect.stringContaining("propertyId=prop-1"),
          "token-real",
        );
        expect(apiClient.get).toHaveBeenCalledWith(
          expect.stringContaining("assignedToStaffId=staff-1"),
          "token-real",
        );
        expect(apiClient.get).toHaveBeenCalledWith(
          expect.stringContaining("search=agua"),
          "token-real",
        );
      });

      it("handles { data: [...] } wrapper response format", async () => {
        const { maintenanceApi, apiClient, auth } =
          await loadMaintenanceApi(false);
        auth.getToken.mockReturnValue("token-real");
        apiClient.get.mockResolvedValue({
          data: [
            {
              id: "t1",
              companyId: "c1",
              propertyId: "p1",
              source: "tenant",
              title: "Test",
              area: "plumbing",
              priority: "high",
              status: "open",
              createdAt: "2024-01-01T00:00:00.000Z",
              updatedAt: "2024-01-02T00:00:00.000Z",
            },
          ],
        });

        const result = await maintenanceApi.getAll();
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("t1");
      });

      it("handles plain array response format", async () => {
        const { maintenanceApi, apiClient, auth } =
          await loadMaintenanceApi(false);
        auth.getToken.mockReturnValue("token-real");
        apiClient.get.mockResolvedValue([
          {
            id: "t2",
            companyId: "c1",
            propertyId: "p2",
            source: "owner",
            title: "Array test",
            area: "electrical",
            priority: "urgent",
            status: "in_progress",
            createdAt: new Date("2024-03-01T00:00:00.000Z"),
            updatedAt: new Date("2024-03-02T00:00:00.000Z"),
          },
        ]);

        const result = await maintenanceApi.getAll();
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("t2");
      });

      it("maps backend ticket with all optional fields null/undefined to safe defaults", async () => {
        const { maintenanceApi, apiClient, auth } =
          await loadMaintenanceApi(false);
        auth.getToken.mockReturnValue("token-real");
        apiClient.get.mockResolvedValue([
          {
            id: "t3",
            companyId: "c1",
            propertyId: "p3",
            property: null,
            reportedByUserId: null,
            reportedBy: null,
            source: "admin",
            assignedToStaffId: null,
            assignedStaff: null,
            assignedAt: null,
            title: "Minimal ticket",
            description: null,
            area: "other",
            priority: "low",
            status: "open",
            scheduledAt: null,
            resolvedAt: null,
            resolutionNotes: null,
            estimatedCost: null,
            actualCost: null,
            costCurrency: null,
            externalRef: null,
            createdAt: undefined,
            updatedAt: undefined,
          },
        ]);

        const result = await maintenanceApi.getAll();
        expect(result[0].property).toBeUndefined();
        expect(result[0].reportedByUserId).toBeUndefined();
        expect(result[0].reportedBy).toBeUndefined();
        expect(result[0].assignedToStaffId).toBeUndefined();
        expect(result[0].assignedStaff).toBeUndefined();
        expect(result[0].assignedAt).toBeUndefined();
        expect(result[0].description).toBeUndefined();
        expect(result[0].scheduledAt).toBeUndefined();
        expect(result[0].resolvedAt).toBeUndefined();
        expect(result[0].resolutionNotes).toBeUndefined();
        expect(result[0].estimatedCost).toBeUndefined();
        expect(result[0].actualCost).toBeUndefined();
        expect(result[0].costCurrency).toBe("ARS");
        expect(result[0].externalRef).toBeUndefined();
        expect(result[0].createdAt).toBeDefined();
        expect(result[0].updatedAt).toBeDefined();
      });

      it("maps backend ticket with all optional fields fully provided", async () => {
        const { maintenanceApi, apiClient, auth } =
          await loadMaintenanceApi(false);
        auth.getToken.mockReturnValue("token-real");
        apiClient.get.mockResolvedValue([
          {
            id: "t4",
            companyId: "c1",
            propertyId: "p4",
            property: { id: "p4", address: "Calle Falsa 123" },
            reportedByUserId: "u1",
            reportedBy: {
              id: "u1",
              firstName: "Juan",
              lastName: "Pérez",
              email: "juan@example.com",
            },
            source: MaintenanceTicketSource.TENANT,
            assignedToStaffId: "s1",
            assignedStaff: {
              id: "s1",
              user: { firstName: "María", lastName: "García" },
            },
            assignedAt: "2024-04-01T10:00:00.000Z",
            title: "Full ticket",
            description: "Descripción completa",
            area: MaintenanceTicketArea.PLUMBING,
            priority: MaintenanceTicketPriority.HIGH,
            status: MaintenanceTicketStatus.IN_PROGRESS,
            scheduledAt: "2024-04-05T09:00:00.000Z",
            resolvedAt: "2024-04-06T09:00:00.000Z",
            resolutionNotes: "Resuelto correctamente",
            estimatedCost: 500,
            actualCost: 480,
            costCurrency: "USD",
            externalRef: "EXT-001",
            createdAt: "2024-04-01T00:00:00.000Z",
            updatedAt: "2024-04-06T00:00:00.000Z",
          },
        ]);

        const result = await maintenanceApi.getAll();
        expect(result[0].property).toEqual({
          id: "p4",
          address: "Calle Falsa 123",
        });
        expect(result[0].reportedByUserId).toBe("u1");
        expect(result[0].reportedBy?.email).toBe("juan@example.com");
        expect(result[0].assignedToStaffId).toBe("s1");
        expect(result[0].assignedStaff?.user.firstName).toBe("María");
        expect(result[0].assignedAt).toBe("2024-04-01T10:00:00.000Z");
        expect(result[0].description).toBe("Descripción completa");
        expect(result[0].estimatedCost).toBe(500);
        expect(result[0].actualCost).toBe(480);
        expect(result[0].costCurrency).toBe("USD");
        expect(result[0].externalRef).toBe("EXT-001");
      });
    });

    describe("getOne", () => {
      it("calls apiClient.get with the ticket id and maps the result", async () => {
        const { maintenanceApi, apiClient, auth } =
          await loadMaintenanceApi(false);
        auth.getToken.mockReturnValue("token-real");
        apiClient.get.mockResolvedValue({
          id: "t1",
          companyId: "c1",
          propertyId: "p1",
          source: "tenant",
          title: "Test getOne",
          area: "plumbing",
          priority: "high",
          status: "open",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-02T00:00:00.000Z",
        });

        const result = await maintenanceApi.getOne("t1");
        expect(apiClient.get).toHaveBeenCalledWith(
          "/maintenance/tickets/t1",
          "token-real",
        );
        expect(result.id).toBe("t1");
        expect(result.title).toBe("Test getOne");
      });
    });

    describe("create", () => {
      it("calls apiClient.post and maps the result", async () => {
        const { maintenanceApi, apiClient, auth } =
          await loadMaintenanceApi(false);
        auth.getToken.mockReturnValue("token-real");
        apiClient.post.mockResolvedValue({
          id: "new-t1",
          companyId: "c1",
          propertyId: "p1",
          source: "admin",
          title: "New ticket",
          area: "other",
          priority: "medium",
          status: "open",
          createdAt: "2024-05-01T00:00:00.000Z",
          updatedAt: "2024-05-01T00:00:00.000Z",
        });

        const input = {
          propertyId: "p1",
          title: "New ticket",
          area: MaintenanceTicketArea.OTHER,
          priority: MaintenanceTicketPriority.MEDIUM,
        };
        const result = await maintenanceApi.create(input);

        expect(apiClient.post).toHaveBeenCalledWith(
          "/maintenance/tickets",
          input,
          "token-real",
        );
        expect(result.id).toBe("new-t1");
      });
    });

    describe("update", () => {
      it("calls apiClient.patch and maps the result", async () => {
        const { maintenanceApi, apiClient, auth } =
          await loadMaintenanceApi(false);
        auth.getToken.mockReturnValue("token-real");
        apiClient.patch.mockResolvedValue({
          id: "t1",
          companyId: "c1",
          propertyId: "p1",
          source: "tenant",
          title: "Updated title",
          area: "plumbing",
          priority: "high",
          status: "resolved",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-05-01T00:00:00.000Z",
        });

        const result = await maintenanceApi.update("t1", {
          title: "Updated title",
          status: MaintenanceTicketStatus.RESOLVED,
        });

        expect(apiClient.patch).toHaveBeenCalledWith(
          "/maintenance/tickets/t1",
          { title: "Updated title", status: MaintenanceTicketStatus.RESOLVED },
          "token-real",
        );
        expect(result.title).toBe("Updated title");
      });
    });

    describe("remove", () => {
      it("calls apiClient.delete with the ticket id", async () => {
        const { maintenanceApi, apiClient, auth } =
          await loadMaintenanceApi(false);
        auth.getToken.mockReturnValue("token-real");
        apiClient.delete.mockResolvedValue(undefined);

        await maintenanceApi.remove("t1");

        expect(apiClient.delete).toHaveBeenCalledWith(
          "/maintenance/tickets/t1",
          "token-real",
        );
      });
    });

    describe("getComments", () => {
      it("calls apiClient.get for comments and maps plain array result", async () => {
        const { maintenanceApi, apiClient, auth } =
          await loadMaintenanceApi(false);
        auth.getToken.mockReturnValue("token-real");
        apiClient.get.mockResolvedValue([
          {
            id: "c1",
            ticketId: "t1",
            userId: "u1",
            user: { firstName: "Ana", lastName: "López" },
            body: "Un comentario",
            isInternal: true,
            createdAt: "2024-01-01T00:00:00.000Z",
          },
        ]);

        const result = await maintenanceApi.getComments("t1");
        expect(apiClient.get).toHaveBeenCalledWith(
          "/maintenance/tickets/t1/comments",
          "token-real",
        );
        expect(result).toHaveLength(1);
        expect(result[0].body).toBe("Un comentario");
        expect(result[0].user).toEqual({ firstName: "Ana", lastName: "López" });
      });

      it("handles { data: [...] } wrapper response format for comments", async () => {
        const { maintenanceApi, apiClient, auth } =
          await loadMaintenanceApi(false);
        auth.getToken.mockReturnValue("token-real");
        apiClient.get.mockResolvedValue({
          data: [
            {
              id: "c2",
              ticketId: "t1",
              userId: null,
              user: null,
              body: "Comentario sin usuario",
              isInternal: null,
              createdAt: undefined,
            },
          ],
        });

        const result = await maintenanceApi.getComments("t1");
        expect(result).toHaveLength(1);
        expect(result[0].userId).toBeUndefined();
        expect(result[0].user).toBeUndefined();
        expect(result[0].isInternal).toBe(false);
        expect(result[0].createdAt).toBeDefined();
      });

      it("maps comment with createdAt as a Date object", async () => {
        const { maintenanceApi, apiClient, auth } =
          await loadMaintenanceApi(false);
        auth.getToken.mockReturnValue("token-real");
        apiClient.get.mockResolvedValue([
          {
            id: "c3",
            ticketId: "t1",
            body: "Date object test",
            createdAt: new Date("2024-06-01T00:00:00.000Z"),
          },
        ]);

        const result = await maintenanceApi.getComments("t1");
        expect(result[0].createdAt).toBe("2024-06-01T00:00:00.000Z");
      });
    });

    describe("addComment", () => {
      it("calls apiClient.post and maps the resulting comment", async () => {
        const { maintenanceApi, apiClient, auth } =
          await loadMaintenanceApi(false);
        auth.getToken.mockReturnValue("token-real");
        apiClient.post.mockResolvedValue({
          id: "c-new",
          ticketId: "t1",
          userId: "u1",
          user: { firstName: "Carlos", lastName: "Ruiz" },
          body: "Nuevo comentario real",
          isInternal: true,
          createdAt: "2024-07-01T00:00:00.000Z",
        });

        const result = await maintenanceApi.addComment(
          "t1",
          "Nuevo comentario real",
          true,
        );

        expect(apiClient.post).toHaveBeenCalledWith(
          "/maintenance/tickets/t1/comments",
          { body: "Nuevo comentario real", isInternal: true },
          "token-real",
        );
        expect(result.id).toBe("c-new");
        expect(result.body).toBe("Nuevo comentario real");
        expect(result.isInternal).toBe(true);
      });
    });
  });
});
