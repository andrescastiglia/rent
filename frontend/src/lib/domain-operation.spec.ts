import { webcrypto } from "node:crypto";
import { TextEncoder } from "node:util";
import {
  prepareDomainAttempt,
  completeDomainAttempt,
} from "./domain-operation";
const scope = { companyId: "company", userId: "user", entityId: "agreement" };
beforeAll(() => {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
  Object.defineProperty(globalThis, "TextEncoder", {
    value: TextEncoder,
    configurable: true,
  });
});
beforeEach(() => localStorage.clear());
afterEach(() => jest.restoreAllMocks());

it("recovers a reconstructed request after reload without storing payment details", async () => {
  const first = await prepareDomainAttempt("sale-receipt", scope, {
    amount: 1234,
    paymentDate: "2026-10-01",
  });
  const second = await prepareDomainAttempt("sale-receipt", scope, {
    paymentDate: "2026-10-01",
    amount: 1234,
  });
  expect(second.storageKey).toBe(first.storageKey);
  expect(second.idempotencyKey).toBe(first.idempotencyKey);
  expect(first.recovered).toBe(false);
  expect(second.recovered).toBe(true);
  expect(localStorage.getItem(first.storageKey)).toBe(first.idempotencyKey);
  expect(first.storageKey).not.toContain("1234");
  await expect(
    prepareDomainAttempt("sale-receipt", scope, {
      amount: 1235,
      paymentDate: "2026-10-01",
    }),
  ).rejects.toThrow("uncertain");
  completeDomainAttempt(first);
  expect(
    await prepareDomainAttempt("sale-receipt", scope, { amount: 1235 }),
  ).not.toEqual(first);
});
it("isolates pending requests by company, user, entity and operation", async () => {
  const attempts = await Promise.all([
    prepareDomainAttempt("sale-receipt", scope, { amount: 1 }),
    prepareDomainAttempt(
      "sale-receipt",
      { ...scope, companyId: "other" },
      { amount: 1 },
    ),
    prepareDomainAttempt(
      "sale-receipt",
      { ...scope, userId: "other" },
      { amount: 1 },
    ),
    prepareDomainAttempt(
      "sale-receipt",
      { ...scope, entityId: "other" },
      { amount: 1 },
    ),
    prepareDomainAttempt("maintenance", scope, { amount: 1 }),
  ]);
  expect(new Set(attempts.map((attempt) => attempt.idempotencyKey)).size).toBe(
    5,
  );
});
it("rejects corrupt recovery records and unavailable storage before sending", async () => {
  const attempt = await prepareDomainAttempt("sale-receipt", scope, {
    amount: 1,
  });
  localStorage.setItem(attempt.storageKey, "corrupt");
  await expect(
    prepareDomainAttempt("sale-receipt", scope, { amount: 1 }),
  ).rejects.toThrow("Invalid");
  localStorage.clear();
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Storage unavailable");
  });
  await expect(
    prepareDomainAttempt("sale-receipt", scope, { amount: 1 }),
  ).rejects.toThrow("Storage unavailable");
});
it("does not discard a newer key and tolerates failed cleanup", async () => {
  const first = await prepareDomainAttempt("sale-receipt", scope, {
    amount: 1,
  });
  completeDomainAttempt(first);
  const second = await prepareDomainAttempt("sale-receipt", scope, {
    amount: 1,
  });
  completeDomainAttempt(first);
  expect(localStorage.getItem(second.storageKey)).toBe(second.idempotencyKey);
  jest.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
    throw new Error("Cleanup failed");
  });
  expect(() => completeDomainAttempt(second)).not.toThrow();
});
