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

async function loadAiApi(isMock: boolean): Promise<{
  aiApi: typeof import("./ai").aiApi;
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

  const { aiApi } = await import("./ai");
  return { aiApi, apiClient, auth };
}

describe("aiApi", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─── Mock mode ─────────────────────────────────────────────────────────────

  describe("mock mode (IS_MOCK_MODE=true)", () => {
    describe("getToolsStatus", () => {
      it("returns { mode: 'NONE', tools: [] } without calling apiClient", async () => {
        const { aiApi, apiClient } = await loadAiApi(true);
        const result = await aiApi.getToolsStatus();
        expect(result).toEqual({ mode: "NONE", tools: [] });
        expect(apiClient.get).not.toHaveBeenCalled();
      });
    });
  });

  // ─── Real API mode ─────────────────────────────────────────────────────────

  describe("real API mode (IS_MOCK_MODE=false)", () => {
    describe("getToolsStatus", () => {
      it("calls apiClient.get('/ai/tools', token) and returns the result", async () => {
        const { aiApi, apiClient, auth } = await loadAiApi(false);
        auth.getToken.mockReturnValue("token-abc");
        const mockResponse = {
          mode: "FULL" as const,
          tools: [
            {
              name: "search",
              description: "Search properties",
              mutability: "readonly" as const,
              enabled: true,
              allowedRoles: ["admin"],
            },
          ],
        };
        apiClient.get.mockResolvedValue(mockResponse);

        const result = await aiApi.getToolsStatus();
        expect(apiClient.get).toHaveBeenCalledWith("/ai/tools", "token-abc");
        expect(result).toEqual(mockResponse);
      });

      it("passes undefined as token when getToken returns null", async () => {
        const { aiApi, apiClient, auth } = await loadAiApi(false);
        auth.getToken.mockReturnValue(null);
        apiClient.get.mockResolvedValue({ mode: "NONE", tools: [] });

        await aiApi.getToolsStatus();
        expect(apiClient.get).toHaveBeenCalledWith("/ai/tools", undefined);
      });

      it("calls getToken exactly once", async () => {
        const { aiApi, apiClient, auth } = await loadAiApi(false);
        auth.getToken.mockReturnValue("tok");
        apiClient.get.mockResolvedValue({ mode: "NONE", tools: [] });

        await aiApi.getToolsStatus();
        expect(auth.getToken).toHaveBeenCalledTimes(1);
      });
    });

    describe("respond", () => {
      it("calls apiClient.post with prompt and undefined conversationId by default", async () => {
        const { aiApi, apiClient, auth } = await loadAiApi(false);
        auth.getToken.mockReturnValue("token-respond");
        const mockResponse = {
          mode: "FULL" as const,
          conversationId: "conv-1",
          model: "gpt-4",
          outputText: "Aquí está la información solicitada.",
        };
        apiClient.post.mockResolvedValue(mockResponse);

        const result = await aiApi.respond("¿Cuántos alquileres activos hay?");
        expect(apiClient.post).toHaveBeenCalledWith(
          "/ai/tools/respond",
          {
            prompt: "¿Cuántos alquileres activos hay?",
            conversationId: undefined,
          },
          "token-respond",
        );
        expect(result).toEqual(mockResponse);
      });

      it("passes conversationId when provided in params", async () => {
        const { aiApi, apiClient, auth } = await loadAiApi(false);
        auth.getToken.mockReturnValue("token-respond");
        apiClient.post.mockResolvedValue({
          mode: "FULL" as const,
          conversationId: "conv-42",
          model: "gpt-4",
          outputText: "Respuesta de seguimiento.",
        });

        await aiApi.respond("¿Y las propiedades?", {
          conversationId: "conv-42",
        });
        expect(apiClient.post).toHaveBeenCalledWith(
          "/ai/tools/respond",
          { prompt: "¿Y las propiedades?", conversationId: "conv-42" },
          "token-respond",
        );
      });

      it("passes undefined as token when getToken returns null", async () => {
        const { aiApi, apiClient, auth } = await loadAiApi(false);
        auth.getToken.mockReturnValue(null);
        apiClient.post.mockResolvedValue({
          mode: "NONE" as const,
          conversationId: "c1",
          model: "m1",
          outputText: "",
        });

        await aiApi.respond("test");
        expect(apiClient.post).toHaveBeenCalledWith(
          "/ai/tools/respond",
          expect.any(Object),
          undefined,
        );
      });

      it("includes usage and toolState when backend returns them", async () => {
        const { aiApi, apiClient, auth } = await loadAiApi(false);
        auth.getToken.mockReturnValue("tok");
        const mockResponse = {
          mode: "READONLY" as const,
          conversationId: "c1",
          model: "gpt-4",
          outputText: "ok",
          usage: { inputTokens: 10, outputTokens: 5 },
          toolState: { lastQuery: "propiedades" },
        };
        apiClient.post.mockResolvedValue(mockResponse);

        const result = await aiApi.respond("test");
        expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
        expect(result.toolState).toEqual({ lastQuery: "propiedades" });
      });
    });

    describe("getConversation", () => {
      it("calls apiClient.get with conversationId in path", async () => {
        const { aiApi, apiClient, auth } = await loadAiApi(false);
        auth.getToken.mockReturnValue("token-conv");
        const mockConv = {
          conversationId: "conv-42",
          messages: [
            {
              id: "msg-1",
              role: "user" as const,
              content: "Hola",
              createdAt: "2026-01-01T00:00:00.000Z",
            },
            {
              id: "msg-2",
              role: "assistant" as const,
              content: "Hola, ¿cómo puedo ayudarte?",
              model: "gpt-4",
              createdAt: "2026-01-01T00:00:01.000Z",
            },
          ],
        };
        apiClient.get.mockResolvedValue(mockConv);

        const result = await aiApi.getConversation("conv-42");
        expect(apiClient.get).toHaveBeenCalledWith(
          "/ai/tools/conversations/conv-42",
          "token-conv",
        );
        expect(result).toEqual(mockConv);
        expect(result.messages).toHaveLength(2);
      });

      it("passes undefined as token when getToken returns null", async () => {
        const { aiApi, apiClient, auth } = await loadAiApi(false);
        auth.getToken.mockReturnValue(null);
        apiClient.get.mockResolvedValue({ conversationId: "c1", messages: [] });

        await aiApi.getConversation("c1");
        expect(apiClient.get).toHaveBeenCalledWith(
          "/ai/tools/conversations/c1",
          undefined,
        );
      });

      it("uses the conversationId in the URL path correctly", async () => {
        const { aiApi, apiClient, auth } = await loadAiApi(false);
        auth.getToken.mockReturnValue("tok");
        apiClient.get.mockResolvedValue({
          conversationId: "special-id-123",
          messages: [],
        });

        await aiApi.getConversation("special-id-123");
        const calledUrl: string = apiClient.get.mock.calls[0][0] as string;
        expect(calledUrl).toContain("special-id-123");
        expect(calledUrl).toMatch(/\/ai\/tools\/conversations\/special-id-123/);
      });
    });
  });
});
