import { settlementGenerationsApi as api } from "./settlement-generations";
import { apiClient } from "../api";
import { getToken } from "../auth";
jest.mock("../api", () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));
jest.mock("../auth", () => ({ getToken: jest.fn() }));
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getToken).mockReturnValue("token");
});
it("escapes authenticated read selectors", async () => {
  await api.overview("owner/?", { requestKey: "key/?" });
  await api.preview("owner/?", "2026-09", "ARS");
  expect(apiClient.get).toHaveBeenNthCalledWith(
    1,
    "/settlements/generation/overview?ownerId=owner%2F%3F&requestKey=key%2F%3F",
    "token",
  );
  expect(apiClient.get).toHaveBeenNthCalledWith(
    2,
    "/settlements/calculation/preview?ownerId=owner%2F%3F&period=2026-09&currency=ARS",
    "token",
  );
});
it("keeps exact generation inputs and never automatically repeats a failed POST", async () => {
  const request = {
    ownerId: "owner",
    period: "2026-09",
    currency: "ARS",
    confirmed: true as const,
    idempotencyKey: "key",
    expectedFingerprint: "fingerprint",
    additionalWithholdings: "0.00",
    withholdingReason: "Sin retenciones adicionales",
  };
  jest.mocked(apiClient.post).mockRejectedValueOnce(new Error("lost response"));
  await expect(api.generate(request)).rejects.toThrow("lost response");
  expect(apiClient.post).toHaveBeenCalledTimes(1);
  expect(apiClient.post).toHaveBeenCalledWith(
    "/settlements/generate",
    request,
    "token",
  );
});
it("distinguishes voiding a registered settlement from fencing a pending request", async () => {
  await api.void("id/?", "Motivo confirmado");
  await api.cancelRequest("owner", "key");
  expect(apiClient.post).toHaveBeenNthCalledWith(
    1,
    "/settlements/id%2F%3F/generation/void",
    { confirmed: true, reason: "Motivo confirmado" },
    "token",
  );
  expect(apiClient.post).toHaveBeenNthCalledWith(
    2,
    "/settlements/generation/cancel-request",
    { confirmed: true, ownerId: "owner", requestKey: "key" },
    "token",
  );
});
