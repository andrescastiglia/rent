export {};
const originalEnv = { ...process.env };
const originalFetch = global.fetch;
async function load(mock = false) {
  jest.resetModules();
  process.env = {
    ...originalEnv,
    NODE_ENV: mock ? "test" : "production",
    CI: "",
    NEXT_PUBLIC_MOCK_MODE: "",
  };
  const expired = jest.fn(() => false),
    logout = jest.fn(),
    toast = jest.fn(),
    metric = jest.fn();
  const recover = jest.fn(async (_endpoint, _method, _body, execute) =>
    execute("durable-key"),
  );
  jest.doMock("./auth", () => ({ isTokenExpired: expired }));
  jest.doMock("./forceLogout", () => ({ forceLogout: logout }));
  jest.doMock("./toastBus", () => ({ emitToast: toast }));
  jest.doMock("./frontend-metrics", () => ({
    reportApiError: metric,
    getCurrentPath: () => "/es/payments",
  }));
  jest.doMock("./domain-request", () => ({
    needsDomainRecovery: (endpoint: string, method: string) =>
      endpoint === "/properties" && method === "POST",
    recoverDomainRequest: recover,
  }));
  const mod = await import("./api");
  process.env = { ...originalEnv };
  return { ...mod, expired, logout, toast, metric, recover };
}
afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
  jest.useRealTimers();
});
it("blocks expired sessions before network calls and preserves the active form on an HTTP401", async () => {
  const { apiClient, expired, logout, toast } = await load();
  global.fetch = jest.fn();
  expired.mockReturnValue(true);
  await expect(apiClient.get("/leases", "expired")).rejects.toThrow(
    "SESSION_EXPIRED",
  );
  await expect(
    apiClient.upload("/properties/upload", new FormData(), "expired"),
  ).rejects.toThrow("SESSION_EXPIRED");
  expect(global.fetch).not.toHaveBeenCalled();
  expect(logout).toHaveBeenCalledTimes(2);
  expired.mockReturnValue(false);
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 401,
    json: async () => ({ message: "Unauthenticated" }),
  });
  await expect(
    apiClient.patch("/leases/id", {}, "valid"),
  ).rejects.toMatchObject({ status: 401 });
  expect(toast).toHaveBeenCalledWith({
    kind: "error",
    namespace: "auth",
    key: "errors.unauthorized",
  });
  expect(logout).toHaveBeenCalledTimes(2);
});
it("uses a single durable mutation key and honors a caller supplied key", async () => {
  const { apiClient, recover } = await load();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ id: "property" }),
  });
  expect(
    await apiClient.post("/properties", { name: "House" }, "valid"),
  ).toEqual({ id: "property" });
  expect(recover).toHaveBeenCalledTimes(1);
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/properties"),
    expect.objectContaining({
      headers: {
        "Idempotency-Key": "durable-key",
        Authorization: "Bearer valid",
        "Content-Type": "application/json",
      },
      body: '{"name":"House"}',
    }),
  );
  await apiClient.post("/properties", { name: "House" }, "valid", {
    "idempotency-key": "explicit",
  });
  expect(recover).toHaveBeenCalledTimes(1);
  expect(global.fetch).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({
      headers: expect.objectContaining({ "idempotency-key": "explicit" }),
    }),
  );
});
it("lets the browser choose multipart boundaries for uploads and form POSTs", async () => {
  const { apiClient, recover } = await load();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ url: "file" }),
  });
  const data = new FormData();
  data.append("file", new Blob(["x"]), "proof.txt");
  await apiClient.upload("/properties/upload", data, "valid");
  await apiClient.post("/properties", data, "valid");
  await apiClient.upload("/properties/upload", data);
  expect(recover).not.toHaveBeenCalled();
  for (const call of jest.mocked(global.fetch).mock.calls) {
    const options = call[1]!;
    expect(options.body).toBe(data);
    expect(options.headers).not.toHaveProperty("Content-Type");
  }
  expect(jest.mocked(global.fetch).mock.calls[2][1]?.headers).toEqual({});
});
it.each([false, true])(
  "reports network failure for multipart=%s without rewriting the error",
  async (upload) => {
    const { apiClient, metric } = await load();
    const error = new TypeError("offline");
    global.fetch = jest.fn().mockRejectedValue(error);
    const request = upload
      ? apiClient.upload("/upload", new FormData())
      : apiClient.get("/invoices");
    await expect(request).rejects.toBe(error);
    expect(metric).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 0, path: "/es/payments" }),
    );
  },
);
it.each([false, true])(
  "uses the HTTP error fallback when the response is not JSON, multipart=%s",
  async (upload) => {
    const { apiClient, metric } = await load();
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Server unavailable",
      json: async () => {
        throw new SyntaxError("invalid");
      },
    });
    await expect(
      upload
        ? apiClient.upload("/upload", new FormData())
        : apiClient.get("/invoices"),
    ).rejects.toThrow("Server unavailable");
    expect(metric).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    );
  },
);
it("provides a generic error when the provider gives no message and reports upload401", async () => {
  const { apiClient, toast } = await load();
  global.fetch = jest
    .fn()
    .mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
  await expect(apiClient.upload("/upload", new FormData())).rejects.toThrow(
    "Upload failed",
  );
  await expect(apiClient.delete("/unused")).rejects.toThrow(
    "API request failed",
  );
  expect(toast).toHaveBeenCalledTimes(2);
});
it("exercises demo login, registration approval and dashboard without real credentials", async () => {
  jest.useFakeTimers();
  const { apiClient } = await load(true);
  const finish = async <T>(pending: Promise<T>) => {
    await jest.advanceTimersByTimeAsync(350);
    return pending;
  };
  const login = await finish(
    apiClient.post<{ accessToken: string; user: Record<string, unknown> }>(
      "/auth/login",
      { email: "admin@example.com", password: "admin123" },
    ),
  );
  expect(login.accessToken).toMatch(/^mock-token-/);
  expect(login.user).not.toHaveProperty("password");
  const invalid = expect(
    apiClient.post("/auth/login", { email: "invalid", password: "no" }),
  ).rejects.toThrow("Credenciales inválidas");
  await jest.advanceTimersByTimeAsync(350);
  await invalid;
  const duplicate = expect(
    apiClient.post("/auth/register", { email: "admin@example.com" }),
  ).rejects.toThrow("El email ya está registrado");
  await jest.advanceTimersByTimeAsync(350);
  await duplicate;
  const request = {
    email: "new@example.com",
    password: "secret",
    firstName: "Ana",
    lastName: "Nueva",
    role: "owner",
    phone: "1",
  };
  expect(await finish(apiClient.post("/auth/register", request))).toMatchObject(
    { pendingApproval: true },
  );
  const blocked = expect(
    apiClient.post("/auth/login", request),
  ).rejects.toThrow("user.blocked");
  await jest.advanceTimersByTimeAsync(350);
  await blocked;
  expect(
    await finish(
      apiClient.post("/auth/register", {
        ...request,
        email: "tenant@example.com",
        phone: undefined,
        role: "admin",
      }),
    ),
  ).toMatchObject({ pendingApproval: true });
  expect(await finish(apiClient.get("/dashboard/stats"))).toMatchObject({
    currencyCode: "ARS",
    totalProperties: 5,
  });
  expect(await finish(apiClient.post("/auth/unknown", {}))).toBeNull();
});
