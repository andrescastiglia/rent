import { needsDomainRecovery, recoverDomainRequest } from "./domain-request";
import { getUser } from "./auth";
import {
  prepareDomainAttempt,
  completeDomainAttempt,
} from "./domain-operation";
jest.mock("./auth", () => ({ getUser: jest.fn() }));
jest.mock("./domain-operation", () => ({
  prepareDomainAttempt: jest.fn(),
  completeDomainAttempt: jest.fn(),
}));
beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  jest.mocked(getUser).mockReturnValue({ id: "user", companyId: "company" });
  jest.mocked(prepareDomainAttempt).mockResolvedValue({
    storageKey: "operation",
    idempotencyKey: "stable-key",
  });
});
it.each(["properties", "owners", "tenants", "buyers", "interested"])(
  "covers %s records and their nested operations",
  (domain) => {
    expect(needsDomainRecovery(`/${domain}`, "POST")).toBe(true);
    expect(needsDomainRecovery(`/${domain}/entity/activity`, "PATCH")).toBe(
      true,
    );
    expect(needsDomainRecovery(`/${domain}/entity`, "DELETE")).toBe(true);
    expect(needsDomainRecovery(`/${domain}`, "GET")).toBe(false);
  },
);
it("leaves unrelated or already independently handled domains alone", () => {
  expect(needsDomainRecovery("/auth/login", "POST")).toBe(false);
  expect(needsDomainRecovery("/payment-templates", "POST")).toBe(false);
  expect(needsDomainRecovery("/properties-other", "POST")).toBe(false);
});
it("scopes and cleans a confirmed operation", async () => {
  const execute = jest.fn().mockResolvedValue({ id: "entity" });
  await expect(
    recoverDomainRequest(
      "/properties/id?context=x",
      "PATCH",
      { name: "Casa" },
      execute,
    ),
  ).resolves.toEqual({ id: "entity" });
  expect(prepareDomainAttempt).toHaveBeenCalledWith(
    "domain-patch",
    { companyId: "company", userId: "user", entityId: "/properties/id" },
    { name: "Casa" },
  );
  expect(execute).toHaveBeenCalledWith("stable-key");
  expect(completeDomainAttempt).toHaveBeenCalledTimes(1);
});
it("preserves an uncertain operation without retrying it", async () => {
  const execute = jest.fn().mockRejectedValue(new Error("Response lost"));
  await expect(
    recoverDomainRequest("/owners", "POST", {}, execute),
  ).rejects.toThrow("Response lost");
  expect(execute).toHaveBeenCalledTimes(1);
  expect(completeDomainAttempt).not.toHaveBeenCalled();
});
it("cleans a first definitively rejected operation", async () => {
  await expect(
    recoverDomainRequest("/tenants/id", "DELETE", null, async () => {
      throw { status: 409 };
    }),
  ).rejects.toEqual({ status: 409 });
  expect(completeDomainAttempt).toHaveBeenCalledTimes(1);
});
it("keeps the original uncertain key after a rejected recovery", async () => {
  localStorage.setItem("operation", "stable-key");
  await expect(
    recoverDomainRequest("/buyers/id", "PATCH", {}, async () => {
      throw { status: 403 };
    }),
  ).rejects.toEqual({ status: 403 });
  expect(completeDomainAttempt).not.toHaveBeenCalled();
});
it("requires an authenticated company scope before calling the server", async () => {
  jest.mocked(getUser).mockReturnValue(null);
  const execute = jest.fn();
  await expect(
    recoverDomainRequest("/interested", "POST", {}, execute),
  ).rejects.toThrow("company context");
  expect(execute).not.toHaveBeenCalled();
});

it.each([
  ["/payments", "POST"],
  ["/payments/payment", "PATCH"],
  ["/payments/payment/confirm", "PATCH"],
  ["/payments/payment/cancel", "PATCH"],
  ["/payment-gateway/preferences", "POST"],
])("covers the durable financial mutation %s %s", (endpoint, method) => {
  expect(needsDomainRecovery(endpoint, method)).toBe(true);
});
it.each([
  ["/payments", "GET"],
  ["/payments", "DELETE"],
  ["/payments/payment", "POST"],
  ["/payments/payment/refunds", "POST"],
  ["/payments/payment/receipt", "PATCH"],
  ["/payment-gateway/webhook", "POST"],
  ["/payment-gateway/preferences", "GET"],
])(
  "does not assign recovery to unsupported financial route %s %s",
  (endpoint, method) => {
    expect(needsDomainRecovery(endpoint, method)).toBe(false);
  },
);
it("keeps one checkout key after a lost response and a rejected explicit recovery", async () => {
  const execute = jest
    .fn()
    .mockRejectedValueOnce(new Error("Lost response"))
    .mockRejectedValueOnce({ status: 409 });
  await expect(
    recoverDomainRequest(
      "/payment-gateway/preferences",
      "POST",
      { invoiceId: "invoice" },
      execute,
    ),
  ).rejects.toThrow("Lost response");
  expect(execute).toHaveBeenCalledTimes(1);
  localStorage.setItem("operation", "stable-key");
  await expect(
    recoverDomainRequest(
      "/payment-gateway/preferences",
      "POST",
      { invoiceId: "invoice" },
      execute,
    ),
  ).rejects.toEqual({ status: 409 });
  expect(execute.mock.calls).toEqual([["stable-key"], ["stable-key"]]);
  expect(completeDomainAttempt).not.toHaveBeenCalled();
});
