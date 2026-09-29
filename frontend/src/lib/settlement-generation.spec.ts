import { readPendingGeneration, settlementNet } from "./settlement-generation";

const pending = {
  request: {
    ownerId: "owner",
    period: "2026-09",
    currency: "ARS",
    confirmed: true,
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
    expectedFingerprint: "a".repeat(64),
    additionalWithholdings: "0.00",
    withholdingReason: "Sin retenciones adicionales",
  },
  netAmount: "9999999999999.99",
};
beforeEach(() => sessionStorage.clear());
it("subtracts decimal cents exactly at the database numeric limit", () => {
  expect(settlementNet("9999999999999.99", "0.01")).toBe("9999999999999.98");
  expect(settlementNet("100.00", "99.99")).toBe("0.01");
});
it.each(["1", "01.00", "-1.00", "0.001", "1e2", "1,00", "10000000000000.00"])(
  "rejects noncanonical or out of range money %s",
  (value) => {
    expect(settlementNet("100.00", value)).toBeNull();
    expect(settlementNet(value, "0.00")).toBeNull();
  },
);
it("rejects a zero or negative net", () => {
  expect(settlementNet("1.00", "1.00")).toBeNull();
  expect(settlementNet("1.00", "1.01")).toBeNull();
});
it("reads only the requested tab scope and owner", () => {
  sessionStorage.setItem("company:user:owner", JSON.stringify(pending));
  expect(readPendingGeneration("company:user:owner", "owner")).toEqual(pending);
  expect(readPendingGeneration("other:user:owner", "owner")).toBeNull();
  expect(() => readPendingGeneration("company:user:owner", "other")).toThrow();
});
it.each([
  { ...pending, netAmount: "0.00" },
  { ...pending, request: { ...pending.request, confirmed: false } },
  { ...pending, request: { ...pending.request, period: "2026-13" } },
  { ...pending, request: { ...pending.request, idempotencyKey: "bad" } },
  { ...pending, request: { ...pending.request, expectedFingerprint: "bad" } },
  {
    ...pending,
    request: { ...pending.request, additionalWithholdings: "-1.00" },
  },
])("refuses corrupt stored requests instead of creating a new one", (value) => {
  sessionStorage.setItem("scope", JSON.stringify(value));
  expect(() => readPendingGeneration("scope", "owner")).toThrow();
});
