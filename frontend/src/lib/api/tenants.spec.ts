export {};
const oldEnv = { ...process.env };
const raw = {
  id: "user",
  tenantEntityId: "tenant",
  firstName: "Ana",
  lastName: "Pérez",
  email: "ana@test.com",
  phone: "123",
  dni: "12345678",
  createdAt: "2026-10-01",
  updatedAt: "2026-10-01",
};
async function load(mock = false) {
  jest.resetModules();
  process.env = {
    ...oldEnv,
    NODE_ENV: mock ? "test" : "production",
    CI: "",
    NEXT_PUBLIC_MOCK_MODE: "",
  };
  const client = {
    get: jest.fn().mockResolvedValue(raw),
    post: jest.fn().mockResolvedValue(raw),
    patch: jest.fn().mockResolvedValue(raw),
    delete: jest.fn(),
  };
  jest.doMock("../api", () => ({ apiClient: client, IS_MOCK_MODE: mock }));
  jest.doMock("../auth", () => ({ getToken: () => "token" }));
  return { api: (await import("./tenants")).tenantsApi, client };
}
afterEach(() => {
  process.env = { ...oldEnv };
  jest.useRealTimers();
  jest.restoreAllMocks();
});
it("collects all pages while retaining filters and canonical tenant identifiers", async () => {
  const { api, client } = await load();
  client.get
    .mockResolvedValueOnce({ data: [raw], total: 2, page: 1, limit: 1 })
    .mockResolvedValueOnce({
      data: [{ ...raw, id: "later" }],
      total: 2,
      page: 2,
      limit: 1,
    });
  const people = await api.getAll({
    name: "Pérez",
    dni: "12345678",
    email: "ana@test.com",
    limit: 1,
  });
  expect(people.map((p) => p.id)).toEqual(["user", "later"]);
  expect(people[0].tenantEntityId).toBe("tenant");
  expect(client.get.mock.calls[1][0]).toContain("page=2");
  client.get.mockResolvedValue({ data: [raw], total: 5, page: 2, limit: 1 });
  expect(await api.getAll({ page: 2, limit: 1 })).toHaveLength(1);
  client.get.mockResolvedValue([raw]);
  expect(await api.getAll()).toHaveLength(1);
  client.get.mockResolvedValue({ invalid: true });
  await expect(api.getAll()).rejects.toThrow("Unexpected response");
});
it("preserves full tenant profiles, zero income/score and alternate nested user records", async () => {
  const { api, client } = await load();
  client.get.mockResolvedValue({
    ...raw,
    cuil: "20-12345678-0",
    dateOfBirth: "1990-04-03T00:00:00Z",
    nationality: "Argentina",
    occupation: "Profesional",
    employer: "Empresa",
    monthlyIncome: 0,
    creditScore: 0,
    employmentStatus: "employed",
    emergencyContactName: "Luis",
    emergencyContactPhone: "456",
    emergencyContactRelationship: "Familia",
    notes: "Observación",
    isActive: false,
    contactConsent: true,
    preferredContactChannel: "email",
  });
  expect(await api.getById("user")).toMatchObject({
    tenantEntityId: "tenant",
    dateOfBirth: "1990-04-03",
    monthlyIncome: 0,
    creditScore: 0,
    occupation: "Profesional",
    status: "INACTIVE",
    contactConsent: true,
    preferredContactChannel: "email",
  });
  client.get.mockResolvedValue({
    id: "nested",
    user: {
      firstName: "Luis",
      lastName: "Pérez",
      email: "luis@test.com",
      phone: "123",
      isActive: true,
    },
  });
  expect(await api.getById("nested")).toMatchObject({
    firstName: "Luis",
    status: "ACTIVE",
    dni: "",
  });
  client.get.mockRejectedValue(new Error("Denied"));
  expect(await api.getById("foreign")).toBeNull();
});
it("whitelists only persisted profile fields and refuses UUID values masquerading as DNI", async () => {
  const { api, client } = await load();
  const data = {
    firstName: " Ana ",
    email: " ana@test.com ",
    phone: " 123 ",
    dni: "12345678",
    cuil: "20-123",
    monthlyIncome: 0,
    notes: "Datos",
    emergencyContactName: " Luis ",
    emergencyContactPhone: " 456 ",
    status: "INACTIVE",
    address: { street: "Ignored" },
  };
  await api.create(data as any);
  expect(client.post.mock.calls[0][1]).not.toHaveProperty("status");
  expect(client.post.mock.calls[0][1]).not.toHaveProperty("address");
  await api.update("user", data as any);
  const patch = client.patch.mock.calls[0][1];
  expect(patch).toMatchObject({
    firstName: "Ana",
    email: "ana@test.com",
    phone: "123",
    dni: "12345678",
    monthlyIncome: 0,
  });
  expect(patch).not.toHaveProperty("status");
  expect(patch).not.toHaveProperty("address");
  await api.update("user", {
    dni: "11111111-1111-4111-8111-111111111111",
    firstName: "  ",
  });
  expect(client.patch.mock.calls[1][1]).not.toHaveProperty("dni");
  expect(client.patch.mock.calls[1][1]).not.toHaveProperty("firstName");
  await api.delete("user");
  expect(client.delete).toHaveBeenCalledWith("/tenants/user", "token");
});
it("maps lease history and CRM activities from their own endpoints", async () => {
  const { api, client } = await load();
  const activity = {
    id: "activity",
    tenantId: "tenant",
    type: "note",
    status: "completed",
    subject: "Llamada",
    body: "Texto",
    dueAt: "2026-10-01",
    completedAt: "2026-10-02",
    metadata: { channel: "phone" },
    createdAt: "2026-10-01",
    updatedAt: "2026-10-02",
  };
  client.get.mockResolvedValue([activity]);
  client.post.mockResolvedValue(activity);
  client.patch.mockResolvedValue(activity);
  expect((await api.getActivities("user"))[0]).toMatchObject({
    subject: "Llamada",
    metadata: { channel: "phone" },
  });
  await api.createActivity("user", { type: "note", subject: "Llamada" });
  await api.updateActivity("user", "activity", { status: "completed" });
  expect(client.patch.mock.calls[0][0]).toBe(
    "/tenants/user/activities/activity",
  );
  client.get.mockResolvedValue([
    {
      id: "lease",
      propertyId: "property",
      ownerId: "owner",
      tenantId: "tenant",
      status: "active",
      monthlyRent: "1500",
      securityDeposit: "0",
      currency: "USD",
      startDate: "2026-10-01",
      endDate: "2027-10-01",
      documents: ["doc"],
      property: {
        id: "property",
        name: "Casa",
        addressStreet: "Mitre",
        images: [{ url: "photo" }, null],
      },
    },
  ]);
  expect((await api.getLeaseHistory("user"))[0]).toMatchObject({
    rentAmount: 1500,
    currency: "USD",
    property: { images: ["photo"] },
  });
  client.get.mockResolvedValue(null);
  expect(await api.getActivities("user")).toEqual([]);
  expect(await api.getLeaseHistory("user")).toEqual([]);
});
it("adapts the own-portal summary without changing its account balance", async () => {
  const { api, client } = await load();
  await api.getMyProfile();
  expect(client.get).toHaveBeenLastCalledWith("/tenants/me", "token");
  client.get.mockResolvedValue({
    activeLease: null,
    currentBalance: 1250.25,
    pendingInvoicesCount: 2,
    nextPaymentDueDate: "2026-10-10",
  });
  expect(await api.getMySummary()).toMatchObject({
    accountBalance: 1250.25,
    pendingInvoicesCount: 2,
    nextPaymentDue: "2026-10-10",
  });
  client.get.mockResolvedValue({
    monthlySummary: { period: "2026-10", pendingAmount: 15 },
  });
  expect((await api.getMySummary()).monthlySummary.pendingAmount).toBe(15);
});
it("supports demo people and activity history without external calls", async () => {
  jest.useFakeTimers();
  const { api, client } = await load(true);
  const finish = async <T>(value: Promise<T>) => {
    await jest.runAllTimersAsync();
    return value;
  };
  const created = await finish(
    api.create({
      firstName: "Prueba",
      lastName: "Demo",
      phone: "123",
      email: "demo@test.com",
      dni: "1",
      status: "ACTIVE",
    } as any),
  );
  expect(
    (await finish(api.getAll({ name: "Demo" }))).map((t) => t.id),
  ).toContain(created.id);
  await finish(api.getAll());
  expect((await finish(api.getById(created.id)))?.id).toBe(created.id);
  expect(
    (await finish(api.update(created.id, { firstName: "Editada" }))).firstName,
  ).toBe("Editada");
  const activity = await finish(
    api.createActivity(created.id, {
      type: "note",
      subject: "Nota",
      body: "Texto",
      dueAt: "2026-10-01",
    }),
  );
  expect(
    (
      await finish(
        api.updateActivity(created.id, activity.id, { status: "completed" }),
      )
    ).status,
  ).toBe("completed");
  expect(await finish(api.getActivities(created.id))).toHaveLength(1);
  expect(await finish(api.getLeaseHistory(created.id))).toEqual([]);
  await finish(api.getMyProfile());
  expect((await finish(api.getMySummary())).accountBalance).toBe(0);
  await finish(api.delete(created.id));
  expect(client.get).not.toHaveBeenCalled();
});
