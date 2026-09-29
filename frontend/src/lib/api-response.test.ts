import { apiClient, ApiRequestError } from "./api";
import { reportApiError } from "./frontend-metrics";
jest.mock("./frontend-metrics", () => ({
  reportApiError: jest.fn(),
  getCurrentPath: () => "/property",
}));
jest.mock("./forceLogout", () => ({ forceLogout: jest.fn() }));
jest.mock("./toastBus", () => ({ emitToast: jest.fn() }));
const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});
it("accepts a successful empty close response without parsing JSON", async () => {
  const json = jest.fn().mockRejectedValue(new SyntaxError("empty"));
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204, json });
  await expect(
    apiClient.delete("/portals/listings/id", "token"),
  ).resolves.toBeUndefined();
  expect(json).not.toHaveBeenCalled();
  expect(reportApiError).not.toHaveBeenCalled();
});
it("still parses successful JSON", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ id: "listing" }),
  });
  await expect(apiClient.patch("/portals/listings/id", {})).resolves.toEqual({
    id: "listing",
  });
});
it("still rejects and reports failed close requests", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 409,
    json: async () => ({ message: "Pending operation" }),
  });
  const operation = apiClient.delete("/portals/listings/id");
  await expect(operation).rejects.toThrow("Pending operation");
  await expect(operation).rejects.toBeInstanceOf(ApiRequestError);
  await expect(operation).rejects.toMatchObject({ status: 409 });
  expect(reportApiError).toHaveBeenCalledWith(
    expect.objectContaining({ statusCode: 409, method: "DELETE" }),
  );
});
