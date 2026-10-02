import type { CreateStaffInput } from "@/types/staff";

async function load(mock = false, token: string | null = "staff-token") {
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
  return { api: (await import("./staff")).staffApi, client };
}
const raw = {
  id: "staff",
  userId: "user",
  companyId: "company",
  specialization: "maintenance",
  hourlyRate: 25,
  currency: "ARS",
  serviceAreas: ["Zona"],
  certifications: ["Certificada"],
  notes: "Nota",
  rating: 4,
  totalJobs: 2,
  createdAt: "2026-09-01",
  updatedAt: "2026-10-01",
  deletedAt: "2026-10-02",
  user: {
    id: "user",
    firstName: "Ana",
    lastName: "Gomez",
    email: "ana@example.invalid",
    phone: "123",
    isActive: false,
  },
};
const input: CreateStaffInput = {
  firstName: "Ana",
  lastName: "Gomez",
  specialization: "maintenance",
  email: "ana@example.invalid",
};
afterEach(() => {
  localStorage.clear();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("staff transport contract", () => {
  it("maps both supported list response shapes and forwards encoded filters with the actual session token", async () => {
    const { api, client } = await load();
    client.get
      .mockResolvedValueOnce([raw])
      .mockResolvedValueOnce({ data: [raw] });
    const first = await api.getAll({
      specialization: "maintenance",
      search: "Ana Gomez",
    });
    expect(client.get).toHaveBeenNthCalledWith(
      1,
      "/staff?specialization=maintenance&search=Ana+Gomez",
      "staff-token",
    );
    expect(first[0]).toMatchObject({
      hourlyRate: 25,
      currency: "ARS",
      serviceAreas: ["Zona"],
      totalJobs: 2,
      deletedAt: "2026-10-02T00:00:00.000Z",
      user: { isActive: false, email: "ana@example.invalid" },
    });
    expect((await api.getAll())[0].id).toBe("staff");
    expect(client.get).toHaveBeenNthCalledWith(2, "/staff", "staff-token");
  });
  it("retains zero values and safely defaults absent optional data and nested user fields", async () => {
    const { api, client } = await load(false, null);
    client.get.mockResolvedValue({
      id: "staff",
      userId: "user",
      companyId: "company",
      specialization: "cleaning",
      hourlyRate: 0,
      rating: 0,
      totalJobs: null,
      user: null,
    });
    const staff = await api.getOne("staff");
    expect(client.get).toHaveBeenCalledWith("/staff/staff", undefined);
    expect(staff).toMatchObject({
      hourlyRate: 0,
      currency: "USD",
      serviceAreas: [],
      certifications: [],
      rating: 0,
      totalJobs: 0,
      user: { id: "user", isActive: true },
    });
    expect(staff.createdAt).toEqual(
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    );
    expect(staff.deletedAt).toBeUndefined();
  });
  it("creates, updates, deactivates and reactivates using the intended endpoints and payloads", async () => {
    const { api, client } = await load();
    client.post.mockResolvedValue(raw);
    client.patch.mockResolvedValue(raw);
    expect((await api.create(input)).id).toBe("staff");
    expect(client.post).toHaveBeenCalledWith("/staff", input, "staff-token");
    const patch = { hourlyRate: 0, notes: "" };
    await api.update("staff", patch);
    expect(client.patch).toHaveBeenCalledWith(
      "/staff/staff",
      patch,
      "staff-token",
    );
    await api.remove("staff");
    expect(client.delete).toHaveBeenCalledWith("/staff/staff", "staff-token");
    expect((await api.activate("staff")).id).toBe("staff");
    expect(client.patch).toHaveBeenCalledWith(
      "/staff/staff/activate",
      {},
      "staff-token",
    );
  });
  it("propagates a denied read or mutation without reporting a successful staff record", async () => {
    const { api, client } = await load();
    const denied = Object.assign(new Error("Forbidden"), { status: 403 });
    client.get.mockRejectedValue(denied);
    client.post.mockRejectedValue(denied);
    await expect(api.getAll()).rejects.toBe(denied);
    await expect(api.create(input)).rejects.toBe(denied);
  });
});

describe("staff demo CRUD", () => {
  async function finish<T>(promise: Promise<T>): Promise<T> {
    const [value] = await Promise.all([
      promise,
      jest.advanceTimersByTimeAsync(500),
    ]);
    return value;
  }
  it.each([
    { mode: true, token: "staff-token" },
    { mode: false, token: "mock-token-admin" },
  ])(
    "uses the demo fixtures only for explicit mock mode or a mock session",
    async ({ mode, token }) => {
      const { api, client } = await load(mode, token);
      jest.useFakeTimers();
      expect(
        await finish(
          api.getAll({ specialization: "maintenance", search: "Carlos" }),
        ),
      ).toHaveLength(1);
      expect(
        await finish(api.getAll({ search: "ana.martinez@example.com" })),
      ).toHaveLength(1);
      expect((await finish(api.getOne("mock-staff-1"))).user.firstName).toBe(
        "Carlos",
      );
      expect(client.get).not.toHaveBeenCalled();
    },
  );
  it("supports creation, partial updates, removal and explicit reactivation", async () => {
    const { api, client } = await load(true);
    jest.useFakeTimers();
    const created = await finish(api.create(input));
    expect(created).toMatchObject({
      specialization: "maintenance",
      currency: "USD",
      totalJobs: 0,
      serviceAreas: [],
      certifications: [],
    });
    const updated = await finish(
      api.update(created.id, {
        firstName: "Nueva",
        lastName: "Persona",
        email: "new@example.invalid",
        phone: "123456",
        specialization: "legal",
        hourlyRate: 0,
        currency: "ARS",
        serviceAreas: ["Centro"],
        certifications: ["Título"],
        notes: "Referencia",
      }),
    );
    expect(updated).toMatchObject({
      specialization: "legal",
      hourlyRate: 0,
      currency: "ARS",
      notes: "Referencia",
      user: { firstName: "Nueva", phone: "123456" },
    });
    const unchanged = await finish(api.update(created.id, {}));
    expect(unchanged.hourlyRate).toBe(0);
    expect(unchanged.user.firstName).toBe("Nueva");
    await finish(api.remove(created.id));
    expect((await finish(api.getOne(created.id))).user.isActive).toBe(false);
    expect((await finish(api.activate(created.id))).user.isActive).toBe(true);
    await finish(api.remove("unknown"));
    expect(client.post).not.toHaveBeenCalled();
    expect(client.patch).not.toHaveBeenCalled();
    expect(client.delete).not.toHaveBeenCalled();
  });
  it("rejects nonexistent demo records and preserves explicitly supplied optional values", async () => {
    const { api } = await load(true);
    jest.useFakeTimers();
    const created = await finish(
      api.create({
        ...input,
        hourlyRate: 10,
        currency: "BRL",
        serviceAreas: ["Centro"],
        certifications: ["A"],
        notes: "Nota",
        phone: "123",
      }),
    );
    expect(created).toMatchObject({
      currency: "BRL",
      serviceAreas: ["Centro"],
      certifications: ["A"],
    });
    await expect(finish(api.getOne("unknown"))).rejects.toThrow(
      "Staff not found",
    );
    await expect(finish(api.update("unknown", {}))).rejects.toThrow(
      "Staff not found",
    );
    await expect(finish(api.activate("unknown"))).rejects.toThrow(
      "Staff not found",
    );
  });
});
