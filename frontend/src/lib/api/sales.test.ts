import { salesApi } from "./sales";
import { getToken } from "../auth";

jest.mock("../auth", () => ({ getToken: jest.fn() }));

describe("sale receipt downloads", () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    global.fetch = fetchMock;
    fetchMock.mockReset();
    (getToken as jest.Mock).mockReturnValue("user-token");
    URL.createObjectURL = jest.fn().mockReturnValue("blob:receipt");
    URL.revokeObjectURL = jest.fn();
    jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it("sends the session token and releases the downloaded blob", async () => {
    const blob = new Blob(["pdf"], { type: "application/pdf" });
    fetchMock.mockResolvedValue({ ok: true, blob: async () => blob });
    await salesApi.downloadReceiptPdf("receipt-1", "SREC-1");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/sales/receipts/receipt-1/pdf"),
      {
        headers: { Authorization: "Bearer user-token" },
      },
    );
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:receipt");
    expect(document.querySelector("a[download]")).toBeNull();
  });

  it("rejects denied downloads without generating a fake document", async () => {
    (getToken as jest.Mock).mockReturnValue(null);
    fetchMock.mockResolvedValue({ ok: false });
    await expect(
      salesApi.downloadReceiptPdf("receipt-1", "SREC-1"),
    ).rejects.toThrow("Failed to download");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});

describe("sales API routing and mock isolation", () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
    jest.useRealTimers();
  });

  async function load(mock: boolean) {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: mock ? "test" : "production",
      CI: "",
      NEXT_PUBLIC_MOCK_MODE: "",
    };
    const apiClient = {
      get: jest.fn().mockResolvedValue([]),
      post: jest.fn().mockResolvedValue({ id: "created" }),
    };
    jest.doMock("../api", () => ({ apiClient }));
    jest.doMock("../auth", () => ({ getToken: () => "sales-token" }));
    const { salesApi: api } = await import("./sales");
    return { api, apiClient };
  }

  it("routes company-scoped requests with authentication and forwards receipt input intact", async () => {
    const { api, apiClient } = await load(false);
    const agreement = {
      folderId: "f1",
      propertyId: "p1",
      buyerId: "b1",
      totalAmount: 1000,
      installmentAmount: 100,
      installmentCount: 10,
      startDate: "2026-09-01",
    };
    const receipt = { amount: 100, paymentDate: "2026-09-15" };
    await api.getFolders();
    await api.createFolder({ name: "Sales" });
    await api.getAgreements();
    await api.getAgreements("f1");
    await api.createAgreement(agreement);
    await api.getReceipts("a1");
    await api.createReceipt("a1", receipt);
    expect(apiClient.get.mock.calls).toEqual([
      ["/sales/folders", "sales-token"],
      ["/sales/agreements", "sales-token"],
      ["/sales/agreements?folderId=f1", "sales-token"],
      ["/sales/agreements/a1/receipts", "sales-token"],
    ]);
    expect(apiClient.post.mock.calls).toEqual([
      ["/sales/folders", { name: "Sales" }, "sales-token"],
      ["/sales/agreements", agreement, "sales-token"],
      ["/sales/agreements/a1/receipts", receipt, "sales-token"],
    ]);
  });

  it("keeps mock sales and receipts local without contacting the API", async () => {
    jest.useFakeTimers();
    const { api, apiClient } = await load(true);
    const finish = async <T>(promise: Promise<T>) => {
      await jest.advanceTimersByTimeAsync(400);
      return promise;
    };
    const folder = await finish(api.createFolder({ name: "Mock folder" }));
    expect(await finish(api.getFolders())).toContainEqual(folder);
    const agreement = await finish(
      api.createAgreement({
        folderId: folder.id,
        propertyId: "p1",
        buyerId: "b1",
        totalAmount: 1000,
        installmentAmount: 100,
        installmentCount: 10,
        startDate: "2026-09-01",
      }),
    );
    expect(await finish(api.getAgreements(folder.id))).toEqual([agreement]);
    expect(await finish(api.getAgreements())).toContainEqual(agreement);
    expect(await finish(api.getReceipts(agreement.id))).toEqual([]);
    const receipt = await finish(
      api.createReceipt(agreement.id, {
        amount: 100,
        paymentDate: "2026-09-15",
      }),
    );
    expect(await finish(api.getReceipts(agreement.id))).toEqual([receipt]);
    expect(receipt.copyCount).toBe(2);
    expect(apiClient.get).not.toHaveBeenCalled();
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});
