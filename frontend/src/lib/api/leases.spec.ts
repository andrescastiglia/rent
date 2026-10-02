export {};
const oldEnv = { ...process.env };
const date = "2026-10-01T00:00:00Z";
const raw = {
  id: "lease",
  companyId: "company",
  propertyId: "property",
  ownerId: "owner",
  tenantId: "tenant",
  contractType: "rental",
  status: "active",
  monthlyRent: "1500.50",
  securityDeposit: "1000",
  currency: "USD",
  startDate: date,
  endDate: "2027-10-01",
  createdAt: date,
  updatedAt: date,
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
  jest.doMock("../auth", () => ({
    getToken: () => "token",
    getUser: () => ({ companyId: "company", id: "user" }),
  }));
  jest.doMock("./properties", () => ({
    propertiesApi: {
      getById: jest.fn().mockResolvedValue({
        id: "property",
        name: "Casa",
        address: { street: "Mitre", city: "Rosario" },
      }),
    },
  }));
  jest.doMock("./tenants", () => ({
    tenantsApi: {
      getById: jest.fn().mockResolvedValue({ id: "tenant", firstName: "Ana" }),
    },
  }));
  return { api: (await import("./leases")).leasesApi, client };
}
afterEach(() => {
  process.env = { ...oldEnv };
  jest.useRealTimers();
  jest.restoreAllMocks();
});
it("preserves page totals, filters and currency when reading contracts", async () => {
  const { api, client } = await load();
  client.get.mockResolvedValue({ data: [raw], total: 45, page: 2, limit: 20 });
  expect(
    await api.getPage({
      page: 2,
      limit: 20,
      propertyAddress: "Mitre",
      status: "ACTIVE",
      contractType: "rental",
      includeFinalized: false,
    }),
  ).toMatchObject({
    total: 45,
    page: 2,
    limit: 20,
    data: [{ rentAmount: 1500.5, depositAmount: 1000, currency: "USD" }],
  });
  expect(client.get).toHaveBeenCalledWith(
    expect.stringContaining("propertyAddress=Mitre"),
    "token",
  );
  expect(client.get.mock.calls[0][0]).toContain("includeFinalized=false");
});
it("retrieves later pages, accepts legacy arrays and rejects malformed responses", async () => {
  const { api, client } = await load();
  client.get
    .mockResolvedValueOnce({ data: [raw], total: 2, page: 1, limit: 1 })
    .mockResolvedValueOnce({
      data: [{ ...raw, id: "later" }],
      total: 2,
      page: 2,
      limit: 1,
    });
  expect((await api.getAll({ limit: 1 })).map((x) => x.id)).toEqual([
    "lease",
    "later",
  ]);
  expect(client.get.mock.calls[1][0]).toContain("page=2");
  client.get.mockResolvedValue([raw]);
  expect((await api.getAll())[0].id).toBe("lease");
  client.get.mockResolvedValue({ broken: true });
  await expect(api.getAll()).rejects.toThrow("Unexpected response");
});
it("retains relations, economic rules, dates and zero values from historical contracts", async () => {
  const { api, client } = await load();
  client.get.mockResolvedValue({
    ...raw,
    buyer: { id: "buyer", dni: "123", user: { firstName: "Luis" } },
    tenant: { dni: "321", user: { firstName: "Ana", isActive: false } },
    property: {
      id: "property",
      name: "Casa",
      addressStreet: "Mitre",
      images: ["photo", { url: "image" }, {}, null],
    },
    paymentDueDay: 0,
    billingFrequency: "monthly",
    billingDay: 10,
    autoGenerateInvoices: false,
    lateFeeValue: 0,
    inflationIndexType: "ipc",
    documents: ["doc", null, 42],
    confirmedAt: date,
    nextAdjustmentDate: date,
    lastAdjustmentDate: date,
    renewalAlertLastSentAt: date,
    template: { id: "template", name: "Modelo", templateFormat: "html" },
  });
  expect(await api.getById("lease")).toMatchObject({
    tenant: { firstName: "Ana", dni: "321", status: "INACTIVE" },
    buyer: { firstName: "Luis" },
    property: { images: ["photo", "image"] },
    paymentDueDay: 0,
    autoGenerateInvoices: false,
    lateFeeValue: 0,
    inflationIndexType: "ipc",
    documents: ["doc"],
  });
  client.get.mockRejectedValue(new Error("Denied"));
  expect(await api.getById("foreign")).toBeNull();
});
it.each(["active", "finalized", "draft", null])(
  "normalizes historical %s status and missing optional fields",
  async (status) => {
    const { api, client } = await load();
    client.get.mockResolvedValue({
      id: "lease",
      status,
      inflationIndexType: "unsupported",
      documents: null,
    });
    const contract = await api.getById("lease");
    expect(contract?.status).toBe(
      status === "active"
        ? "ACTIVE"
        : status === "finalized"
          ? "FINALIZED"
          : "DRAFT",
    );
    expect(contract?.inflationIndexType).toBeUndefined();
    expect(contract?.documents).toEqual([]);
  },
);
it("translates financial fields at creation and preserves omitted fields on edit and renewal", async () => {
  const { api, client } = await load();
  await api.create({
    propertyId: "property",
    ownerId: "owner",
    tenantId: "tenant",
    contractType: "rental",
    startDate: date,
    endDate: "2027-10-01",
    rentAmount: 1500,
    depositAmount: 0,
    currency: "USD",
    autoGenerateInvoices: false,
    terms: "Condiciones",
  } as any);
  expect(client.post.mock.calls[0]).toEqual([
    "/contracts",
    expect.objectContaining({
      companyId: "company",
      monthlyRent: 1500,
      securityDeposit: 0,
      autoGenerateInvoices: false,
      termsAndConditions: "Condiciones",
    }),
    "token",
  ]);
  await api.update("lease", { rentAmount: 1600 });
  expect(client.patch.mock.calls[0]).toEqual([
    "/contracts/lease",
    { monthlyRent: 1600 },
    "token",
  ]);
  await api.renew("lease", { rentAmount: 1700 });
  expect(client.patch.mock.calls[1]).toEqual([
    "/contracts/lease/renew",
    { monthlyRent: 1700 },
    "token",
  ]);
  await api.delete("lease");
  expect(client.delete).toHaveBeenCalledWith("/contracts/lease", "token");
});
it("separates draft rendering, editing and confirmation operations", async () => {
  const { api, client } = await load();
  await api.renderDraft("lease", "template");
  await api.updateDraftText("lease", "Revisado", "html");
  await api.confirmDraft("lease", "Firmado", "html");
  expect(client.post.mock.calls).toEqual([
    ["/contracts/lease/draft/render", { templateId: "template" }, "token"],
    [
      "/contracts/lease/confirm",
      { finalText: "Firmado", finalFormat: "html" },
      "token",
    ],
  ]);
  expect(client.patch).toHaveBeenCalledWith(
    "/contracts/lease/draft-text",
    { draftText: "Revisado", draftFormat: "html" },
    "token",
  );
});
it("sends templates and DOCX imports with the original binary", async () => {
  const { api, client } = await load();
  const template = {
    id: "template",
    name: "Modelo",
    contractType: "rental",
    templateBody: "Texto",
    templateFormat: "html",
    isActive: false,
    createdAt: date,
    updatedAt: date,
  };
  client.get.mockResolvedValue([template]);
  client.post.mockResolvedValue(template);
  client.patch.mockResolvedValue(template);
  expect((await api.getTemplates("rental"))[0]).toMatchObject({
    templateFormat: "html",
    isActive: false,
  });
  await api.createTemplate({
    name: "Modelo",
    contractType: "rental",
    templateBody: "Texto",
  });
  await api.updateTemplate("template", { isActive: true });
  const file = new File(["DOCX"], "model.docx");
  await api.importTemplateDocx(file, "rental", " Modelo ");
  const form = client.post.mock.calls[1][1] as FormData;
  expect(form.get("file")).toBe(file);
  expect(form.get("name")).toBe("Modelo");
});
it("imports current contracts preserving stable key and explicit zero amounts", async () => {
  const { api, client } = await load();
  const file = new File(["contract"], "signed.pdf", {
    type: "application/pdf",
  });
  await api.importCurrentContract({
    file,
    idempotencyKey: "stable",
    propertyId: "property",
    ownerId: "owner",
    tenantId: "tenant",
    buyerId: "buyer",
    contractType: "rental",
    startDate: date,
    endDate: date,
    rentAmount: 0,
    depositAmount: 0,
    fiscalValue: 0,
    currency: "USD",
    notes: "Importado",
  });
  const form = client.post.mock.calls[0][1] as FormData;
  expect(form.get("file")).toBe(file);
  expect(form.get("idempotencyKey")).toBe("stable");
  expect(form.get("monthlyRent")).toBe("0");
  expect(form.get("fiscalValue")).toBe("0");
});
it("supports the demo contract lifecycle without HTTP calls", async () => {
  jest.useFakeTimers();
  const { api, client } = await load(true);
  const finish = async <T>(value: Promise<T>) => {
    await jest.runAllTimersAsync();
    return value;
  };
  const templates = await finish(api.getTemplates());
  const created = await finish(
    api.create({
      propertyId: "property",
      tenantId: "tenant",
      contractType: "rental",
      status: "DRAFT",
      startDate: date,
      endDate: "2027-10-01",
      rentAmount: 1500,
      depositAmount: 0,
      currency: "ARS",
    } as any),
  );
  expect((await finish(api.getById(created.id)))?.property?.name).toBe("Casa");
  expect(
    (await finish(api.update(created.id, { rentAmount: 1600 }))).rentAmount,
  ).toBe(1600);
  expect(
    (
      await finish(
        api.renderDraft(
          created.id,
          templates.find((t) => t.contractType === "rental")?.id,
        ),
      )
    ).draftContractText,
  ).toBeTruthy();
  await finish(api.updateDraftText(created.id, "Texto revisado"));
  expect((await finish(api.confirmDraft(created.id))).status).toBe("ACTIVE");
  const renewed = await finish(api.renew(created.id));
  expect(renewed.previousLeaseId).toBe(created.id);
  expect((await finish(api.getById(created.id)))?.status).toBe("FINALIZED");
  await finish(api.getAll({ includeFinalized: true }));
  await finish(api.getPage({ propertyAddress: "Mitre", limit: 1 }));
  const template = await finish(
    api.createTemplate({
      name: "Demo",
      contractType: "rental",
      templateBody: "Texto",
    }),
  );
  expect(
    (await finish(api.updateTemplate(template.id, { isActive: false })))
      .isActive,
  ).toBe(false);
  await finish(api.delete(renewed.id));
  expect(await finish(api.getById(renewed.id))).toBeNull();
  expect(client.get).not.toHaveBeenCalled();
});
