import { amendmentsApi } from "./amendments";
import { apiClient } from "../api";
jest.mock("../api", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
jest.mock("../auth", () => ({ getToken: () => "token" }));
it("scopes requests to the selected contract/amendment and preserves the review recovery key", async () => {
  await amendmentsApi.list("lease/1");
  await amendmentsApi.history("amendment/1");
  const dto = {
    action: "cancel" as const,
    reason: "Administrative cancellation",
    expectedUpdatedAt: "2026-09-29T12:00:00.000Z",
    idempotencyKey: "key",
  };
  await amendmentsApi.review("amendment/1", dto);
  expect(apiClient.get).toHaveBeenCalledWith(
    "/amendments/lease/lease%2F1",
    "token",
  );
  expect(apiClient.get).toHaveBeenCalledWith(
    "/amendments/amendment%2F1/reviews",
    "token",
  );
  expect(apiClient.post).toHaveBeenCalledWith(
    "/amendments/amendment%2F1/reviews",
    dto,
    "token",
  );
});

it("forwards creation and transition recovery keys and the observed version", async () => {
  const dto = {
    companyId: "company",
    leaseId: "lease",
    changeType: "early_termination" as const,
    effectiveDate: "2026-10-01",
    description: "Termination",
    newValues: {},
    idempotencyKey: "key",
  };
  await amendmentsApi.create(dto);
  expect(apiClient.post).toHaveBeenCalledWith("/amendments", dto, "token");
  const decision = {
    idempotencyKey: "key",
    expectedUpdatedAt: "2026-09-29T12:00:00.000Z",
  };
  await amendmentsApi.transition("amendment/1", "approve", decision);
  expect(apiClient.patch).toHaveBeenCalledWith(
    "/amendments/amendment%2F1/approve",
    decision,
    "token",
  );
});
