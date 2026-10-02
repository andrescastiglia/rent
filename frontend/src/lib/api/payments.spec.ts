export {};
const oldEnv = { ...process.env };
async function load(mock = false, token: string | null = "token") {
  jest.resetModules();
  process.env = {
    ...oldEnv,
    NODE_ENV: mock ? "test" : "production",
    NEXT_PUBLIC_MOCK_MODE: "",
    CI: "",
  };
  const client = {
    get: jest.fn().mockResolvedValue({ id: "record" }),
    post: jest.fn().mockResolvedValue({ id: "record" }),
    patch: jest.fn().mockResolvedValue({ id: "record" }),
  };
  jest.doMock("../api", () => ({ apiClient: client, IS_MOCK_MODE: mock }));
  jest.doMock("../auth", () => ({ getToken: () => token }));
  return { ...(await import("./payments")), client };
}
afterEach(() => {
  process.env = { ...oldEnv };
  jest.useRealTimers();
  jest.restoreAllMocks();
});
it("preserves payment pagination and sends all financial filters to the server", async () => {
  const { paymentsApi: api, client } = await load();
  const page = { data: [{ id: "payment" }], total: 45, page: 3, limit: 20 };
  client.get.mockResolvedValue(page);
  expect(
    await api.getAll({
      search: " REC ",
      tenantId: "tenant",
      leaseId: "lease",
      propertyId: "property",
      method: "cash",
      status: "completed",
      activityType: "monthly",
      fromDate: "2026-09-01",
      toDate: "2026-10-01",
      page: 3,
      limit: 20,
    }),
  ).toEqual(page);
  const query = new URL(client.get.mock.calls[0][0], "http://api.test")
    .searchParams;
  expect(Object.fromEntries(query)).toEqual({
    search: "REC",
    tenantId: "tenant",
    status: "completed",
    method: "cash",
    activityType: "monthly",
    leaseId: "lease",
    propertyId: "property",
    fromDate: "2026-09-01",
    toDate: "2026-10-01",
    page: "3",
    limit: "20",
  });
  await api.getById("payment");
  expect(client.get).toHaveBeenLastCalledWith("/payments/payment", "token");
  client.get.mockRejectedValue(
    Object.assign(new Error("Missing"), { status: 404 }),
  );
  expect(await api.getById("foreign")).toBeNull();
});
it("forwards amounts and items exactly, separates confirmation from cancellation and retains refund keys", async () => {
  const { paymentsApi: api, client } = await load();
  const input = {
    tenantAccountId: "account",
    amount: 100.25,
    currencyCode: "USD",
    paymentDate: "2026-10-01",
    method: "cash",
    items: [{ description: "Canon", amount: 100.25, quantity: 1 }],
  };
  await api.create(input as any);
  await api.confirm("payment");
  await api.cancel("payment");
  await api.update("payment", { notes: "Revisado" });
  await api.refund(
    "payment/id",
    { amount: 25.25, reason: "Corrección" },
    "stable-key",
  );
  await api.listRefunds("payment/id");
  expect(client.post.mock.calls).toEqual([
    ["/payments", input, "token"],
    [
      "/payments/payment%2Fid/refunds",
      { amount: 25.25, reason: "Corrección" },
      "token",
      { "Idempotency-Key": "stable-key" },
    ],
  ]);
  expect(client.patch.mock.calls).toEqual([
    ["/payments/payment/confirm", {}, "token"],
    ["/payments/payment/cancel", {}, "token"],
    ["/payments/payment", { notes: "Revisado" }, "token"],
  ]);
  expect(client.get).toHaveBeenLastCalledWith(
    "/payments/payment%2Fid/refunds",
    "token",
  );
});
it("keeps invoice totals, credit notes and tenant accounts on their canonical routes", async () => {
  const { invoicesApi, tenantAccountsApi, client } = await load();
  client.get.mockResolvedValue({ data: [], total: 42, page: 2, limit: 20 });
  expect(
    await invoicesApi.getAll({
      search: " INV ",
      leaseId: "lease",
      status: "pending",
      page: 2,
      limit: 20,
    }),
  ).toMatchObject({ total: 42, page: 2 });
  await invoicesApi.getById("invoice");
  await invoicesApi.listCreditNotes("invoice");
  await tenantAccountsApi.getByLease("lease");
  await tenantAccountsApi.getBalance("account");
  await tenantAccountsApi.getMovements("account");
  await tenantAccountsApi.getReceiptsByTenant("tenant");
  expect(client.get.mock.calls.map((call) => call[0])).toEqual([
    "/invoices?search=INV&status=pending&leaseId=lease&page=2&limit=20",
    "/invoices/invoice",
    "/invoices/invoice/credit-notes",
    "/tenant-accounts/lease/lease",
    "/tenant-accounts/account/balance",
    "/tenant-accounts/account/movements",
    "/payments/tenant/tenant/receipts",
  ]);
  client.get.mockRejectedValue(
    Object.assign(new Error("Missing"), { status: 404 }),
  );
  expect(await invoicesApi.getById("foreign")).toBeNull();
  expect(await tenantAccountsApi.getByLease("foreign")).toBeNull();
});
it("creates and updates receipt templates without changing unspecified options", async () => {
  const { paymentDocumentTemplatesApi: api, client } = await load();
  await api.list();
  await api.list("receipt");
  await api.create({
    type: "receipt",
    name: "Recibo",
    templateBody: "Texto",
    isActive: false,
    isDefault: false,
  });
  await api.update("template", { isDefault: true });
  expect(client.get.mock.calls).toEqual([
    ["/payment-templates", "token"],
    ["/payment-templates?type=receipt", "token"],
  ]);
  expect(client.post.mock.calls[0][1]).toMatchObject({
    isActive: false,
    isDefault: false,
  });
  expect(client.patch).toHaveBeenCalledWith(
    "/payment-templates/template",
    { isDefault: true },
    "token",
  );
});
it("downloads financial PDFs with authentication and frees their temporary links", async () => {
  const { paymentsApi, invoicesApi } = await load();
  const fetchMock = jest
    .fn()
    .mockResolvedValue({ ok: true, blob: async () => new Blob(["pdf"]) });
  global.fetch = fetchMock;
  URL.createObjectURL = jest.fn(() => "blob:pdf");
  URL.revokeObjectURL = jest.fn();
  jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  await paymentsApi.downloadReceiptPdf("payment", "REC");
  await invoicesApi.downloadPdf("invoice", "INV");
  await invoicesApi.downloadCreditNotePdf("credit", "NC");
  await paymentsApi.downloadRefund("payment", {
    id: "refund",
    document_number: "REF",
  } as any);
  expect(
    fetchMock.mock.calls.every(
      (call) => call[1].headers.Authorization === "Bearer token",
    ),
  ).toBe(true);
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(4);
  expect(document.querySelector("a[download]")).toBeNull();
  fetchMock.mockResolvedValue({ ok: false });
  await expect(
    paymentsApi.downloadReceiptPdf("payment", "REC"),
  ).rejects.toThrow();
  await expect(invoicesApi.downloadPdf("invoice", "INV")).rejects.toThrow();
  await expect(
    invoicesApi.downloadCreditNotePdf("credit", "NC"),
  ).rejects.toThrow();
  await expect(
    paymentsApi.downloadRefund("payment", { id: "refund" } as any),
  ).rejects.toThrow();
});
it("supports the local payment lifecycle and keeps template defaults unique", async () => {
  jest.useFakeTimers();
  const {
    paymentsApi,
    invoicesApi,
    tenantAccountsApi,
    paymentDocumentTemplatesApi,
    client,
  } = await load(true);
  const finish = async <T>(value: Promise<T>) => {
    await jest.runAllTimersAsync();
    return value;
  };
  const account = await finish(tenantAccountsApi.getByLease("demo-lease"));
  expect(await finish(tenantAccountsApi.getByLease("demo-lease"))).toEqual(
    account,
  );
  expect(await finish(tenantAccountsApi.getBalance(account!.id))).toMatchObject(
    { balance: 0 },
  );
  expect(
    (await finish(tenantAccountsApi.getMovements(account!.id))).length,
  ).toBeGreaterThan(0);
  const payment = await finish(
    paymentsApi.create({
      tenantAccountId: account!.id,
      amount: 125,
      currencyCode: "USD",
      paymentDate: "2026-10-01",
      method: "cash",
      items: [
        { description: "Canon", amount: 100, quantity: 2, type: "charge" },
        { description: "Bonificación", amount: 25, type: "discount" },
      ],
    } as any),
  );
  expect(
    (
      await finish(
        paymentsApi.update(payment.id, {
          items: [
            { description: "Canon", amount: 100, quantity: 2, type: "charge" },
            {
              description: "Descuento",
              amount: 25,
              type: "discount",
              quantity: 1,
            },
          ],
        }),
      )
    ).amount,
  ).toBe(175);
  expect(
    (await finish(paymentsApi.confirm(payment.id))).receipt?.currencyCode,
  ).toBe("USD");
  expect((await finish(paymentsApi.getById(payment.id)))?.status).toBe(
    "completed",
  );
  expect(
    (
      await finish(
        paymentsApi.getAll({
          status: "completed",
          method: "cash",
          leaseId: "demo-lease",
          activityType: "monthly",
          search: "Canon",
          page: 1,
          limit: 1,
        }),
      )
    ).total,
  ).toBeGreaterThanOrEqual(0);
  expect(
    (await finish(tenantAccountsApi.getReceiptsByTenant("tenant"))).length,
  ).toBeGreaterThan(0);
  expect((await finish(paymentsApi.cancel(payment.id))).status).toBe(
    "cancelled",
  );
  const invoices = await finish(invoicesApi.getAll());
  expect((await finish(invoicesApi.getById(invoices.data[0].id)))?.id).toBe(
    invoices.data[0].id,
  );
  await finish(
    invoicesApi.getAll({
      status: "pending",
      leaseId: "lease",
      search: "INV",
      page: 2,
      limit: 1,
    }),
  );
  expect(await finish(invoicesApi.listCreditNotes("invoice"))).toEqual([]);
  const template = await finish(
    paymentDocumentTemplatesApi.create({
      name: "Demo",
      type: "receipt",
      templateBody: "Texto",
      isDefault: true,
    }),
  );
  await finish(
    paymentDocumentTemplatesApi.update(template.id, {
      name: "Nuevo",
      isDefault: true,
    }),
  );
  expect(
    (await finish(paymentDocumentTemplatesApi.list("receipt"))).filter(
      (t) => t.isDefault,
    ),
  ).toHaveLength(1);
  await finish(paymentDocumentTemplatesApi.list());
  expect(client.get).not.toHaveBeenCalled();
});

it("distinguishes an unavailable financial record from a missing record", async () => {
  const { paymentsApi, invoicesApi, client } = await load();
  const error = new Error("offline");
  client.get.mockRejectedValue(error);
  await expect(paymentsApi.getById("payment")).rejects.toBe(error);
  await expect(invoicesApi.getById("invoice")).rejects.toBe(error);
});

it("does not turn authorization failures into empty lists, missing records, or successful mutations", async () => {
  const {
    paymentsApi,
    invoicesApi,
    tenantAccountsApi,
    paymentDocumentTemplatesApi,
    client,
  } = await load(false, null);
  const denied = Object.assign(new Error("No autorizado"), { status: 403 });
  client.get.mockRejectedValue(denied);
  client.post.mockRejectedValue(denied);
  client.patch.mockRejectedValue(denied);
  const requests = [
    () => paymentsApi.getAll(),
    () => paymentsApi.getById("payment"),
    () => invoicesApi.getAll(),
    () => invoicesApi.getById("invoice"),
    () => invoicesApi.listCreditNotes("invoice"),
    () => tenantAccountsApi.getByLease("lease"),
    () => tenantAccountsApi.getBalance("account"),
    () => tenantAccountsApi.getMovements("account"),
    () => tenantAccountsApi.getReceiptsByTenant("tenant"),
    () => paymentDocumentTemplatesApi.list(),
    () => paymentsApi.listRefunds("payment"),
    () =>
      paymentsApi.create({
        tenantAccountId: "account",
        amount: 25.5,
        method: "cash",
        paymentDate: "2026-10-02",
        currencyCode: "ARS",
      }),
    () => paymentsApi.update("payment", { notes: "Revisar" }),
    () => paymentsApi.confirm("payment"),
    () => paymentsApi.cancel("payment"),
    () =>
      paymentsApi.refund("payment", { amount: 5, reason: "Corrección" }, "key"),
    () =>
      paymentDocumentTemplatesApi.create({
        type: "receipt",
        name: "Recibo",
        templateBody: "Total",
      }),
    () => paymentDocumentTemplatesApi.update("template", { name: "Recibo" }),
  ];
  for (const request of requests) await expect(request()).rejects.toBe(denied);
  expect(client.get).toHaveBeenCalledWith("/payments", undefined);
  expect(client.get).toHaveBeenCalledWith("/invoices", undefined);
  expect(client.post).toHaveBeenCalledWith(
    "/payments/payment/refunds",
    { amount: 5, reason: "Corrección" },
    undefined,
    { "Idempotency-Key": "key" },
  );
});

it("validates demo financial references and preserves explicit totals when editing pending payments", async () => {
  jest.useFakeTimers();
  const {
    paymentsApi,
    invoicesApi,
    tenantAccountsApi,
    paymentDocumentTemplatesApi,
  } = await load(true);
  const finish = async <T>(request: Promise<T>) => {
    await jest.runAllTimersAsync();
    return request;
  };
  const created = await finish(
    paymentsApi.create({
      tenantAccountId: "ta1",
      amount: 25.5,
      paymentDate: "2026-10-02",
      method: "cash",
      currencyCode: "ARS",
    }),
  );
  expect(created.items).toEqual([]);
  expect(
    (await finish(paymentsApi.update(created.id, { amount: 30.25 }))).amount,
  ).toBe(30.25);
  const updated = await finish(
    paymentsApi.update(created.id, {
      items: [{ description: "Ajuste", amount: 15.5 }],
      activityType: "extraordinary",
    }),
  );
  expect(updated).toMatchObject({
    amount: 15.5,
    activityType: "extraordinary",
    items: [{ quantity: 1, type: "charge" }],
  });
  await finish(paymentsApi.confirm(created.id));
  const forbiddenEdit = expect(
    paymentsApi.update(created.id, { amount: 1 }),
  ).rejects.toThrow("Only pending payments");
  await jest.runAllTimersAsync();
  await forbiddenEdit;
  for (const operation of [
    () => paymentsApi.confirm("missing"),
    () => paymentsApi.cancel("missing"),
    () => paymentsApi.update("missing", {}),
    () => tenantAccountsApi.getBalance("missing"),
    () => paymentDocumentTemplatesApi.update("missing", { name: "Otra" }),
  ]) {
    const rejected = expect(operation()).rejects.toThrow("not found");
    await jest.runAllTimersAsync();
    await rejected;
  }
  expect(await finish(paymentsApi.getById("missing"))).toBeNull();
  expect(await finish(invoicesApi.getById("missing"))).toBeNull();
  expect((await finish(paymentsApi.getAll())).page).toBe(1);
  expect(
    (
      await finish(
        paymentsApi.getAll({
          leaseId: "unknown",
          propertyId: "foreign",
          tenantId: "foreign",
        }),
      )
    ).data,
  ).toEqual([]);
  const standard = await finish(
    paymentDocumentTemplatesApi.create({
      type: "invoice",
      name: "Opcional",
      templateBody: "Texto",
      isActive: false,
    }),
  );
  expect(standard).toMatchObject({ isDefault: false, isActive: false });
  expect(
    (
      await finish(
        paymentDocumentTemplatesApi.update(standard.id, { isDefault: false }),
      )
    ).isDefault,
  ).toBe(false);
});
