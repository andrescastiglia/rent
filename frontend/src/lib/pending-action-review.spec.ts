import {
  parsePendingActionReview,
  reviewExpired,
} from "./pending-action-review";

const valid = {
  entityLabel: "Cobro de San Martín 10",
  currentState: { balance: "100.00" },
  proposedChange: { amount: "50.00" },
  amount: "50.00",
  currency: "ARS",
  impact: ["Reduce el saldo de la factura"],
  observedVersion: "observed-state",
  expiresAt: "2026-10-01T15:00:00.000Z",
};
it("accepts a backend review with all decision information", () => {
  expect(parsePendingActionReview(valid)).toEqual(valid);
});
it.each([
  undefined,
  {},
  { ...valid, observedVersion: "" },
  { ...valid, impact: [] },
  { ...valid, expiresAt: "bad-date" },
  { ...valid, currentState: [] },
])("blocks an incomplete or legacy review", (value) => {
  expect(() => parsePendingActionReview(value)).toThrow();
});
it("expires at the exact deadline", () => {
  const review = parsePendingActionReview(valid);
  expect(reviewExpired(review, Date.parse(valid.expiresAt) - 1)).toBe(false);
  expect(reviewExpired(review, Date.parse(valid.expiresAt))).toBe(true);
});
