import { settlementPayoutsApi as payouts } from "./settlement-payouts";
import { apiClient } from "../api";
import { getToken } from "../auth";
jest.mock("../api", () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));
jest.mock("../auth", () => ({ getToken: jest.fn() }));
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getToken).mockReturnValue("token");
});
it("uses authenticated and escaped local read routes even in the test environment", async () => {
  await payouts.list("owner/?");
  await payouts.settlement("s/?");
  await payouts.overview("s/?");
  expect(apiClient.get).toHaveBeenNthCalledWith(
    1,
    "/settlements?ownerId=owner%2F%3F",
    "token",
  );
  expect(apiClient.get).toHaveBeenNthCalledWith(
    2,
    "/settlements/s%2F%3F",
    "token",
  );
  expect(apiClient.get).toHaveBeenNthCalledWith(
    3,
    "/settlements/s%2F%3F/payout",
    "token",
  );
});
it("passes explicit request and review bodies without fake payment results or retries", async () => {
  const request = {
    confirmed: true as const,
    expectedAmount: "100.00",
    currency: "ARS" as const,
    recipientEmail: "a@example.test",
  };
  const review = {
    confirmed: true as const,
    action: "refresh" as const,
    reason: "Verified latest state",
  };
  await payouts.request("s/?", request);
  await payouts.review("s/?", review);
  expect(apiClient.post).toHaveBeenNthCalledWith(
    1,
    "/settlements/s%2F%3F/payout",
    request,
    "token",
  );
  expect(apiClient.post).toHaveBeenNthCalledWith(
    2,
    "/settlements/s%2F%3F/payout/review",
    review,
    "token",
  );
  jest.mocked(apiClient.post).mockRejectedValueOnce(new Error("lost response"));
  await expect(payouts.request("s", request)).rejects.toThrow("lost response");
  expect(apiClient.post).toHaveBeenCalledTimes(3);
});
it("does not invent an authentication token", async () => {
  jest.mocked(getToken).mockReturnValue(null);
  await payouts.overview("s");
  expect(apiClient.get).toHaveBeenCalledWith(
    "/settlements/s/payout",
    undefined,
  );
});
it("downloads receipt bytes through the authenticated scoped route and releases the object URL", async () => {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    blob: async () => new Blob(["pdf"], { type: "application/pdf" }),
  });
  const originalFetch = global.fetch;
  global.fetch = fetchMock;
  const originalCreate = URL.createObjectURL,
    originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = jest.fn().mockReturnValue("blob:test");
  URL.revokeObjectURL = jest.fn();
  const click = jest
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  try {
    await payouts.downloadReceipt("s/?", "m/?");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/settlements/s%2F%3F/payout/movements/m%2F%3F/receipt",
      { headers: { Authorization: "Bearer token" } },
    );
    expect(click).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
    expect(document.querySelector("a[download]")).toBeNull();
    fetchMock.mockResolvedValueOnce({ ok: false });
    await expect(payouts.downloadReceipt("s", "m")).rejects.toThrow(
      "Receipt download failed",
    );
    jest.mocked(getToken).mockReturnValue(null);
    await expect(payouts.downloadReceipt("s", "m")).rejects.toThrow(
      "Authentication required",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  } finally {
    global.fetch = originalFetch;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    click.mockRestore();
  }
});
