import { bfaApi } from "./bfa";
import { apiClient } from "../api";
import { getToken } from "../auth";
jest.mock("../api", () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));
jest.mock("../auth", () => ({ getToken: jest.fn() }));
beforeEach(() => jest.resetAllMocks());
it.each(["token", null])(
  "uses authenticated internal routes without simulated provider results (%s)",
  async (token) => {
    jest.mocked(getToken).mockReturnValue(token);
    await bfaApi.forLease("lease/id");
    await bfaApi.request("document/id");
    expect(apiClient.get).toHaveBeenCalledWith(
      "/digital-signatures/bfa/leases/lease%2Fid",
      token || undefined,
    );
    expect(apiClient.post).toHaveBeenCalledWith(
      "/digital-signatures/documents/document%2Fid/stamp",
      {},
      token || undefined,
    );
  },
);
