import { webcrypto } from "node:crypto";
import { TextEncoder } from "node:util";
import {
  amendmentDraft,
  prepareAmendmentAttempt,
  completeAmendmentAttempt,
  type AmendmentDraftFields,
} from "./amendment-workflow";
const scope = { companyId: "company", userId: "user", leaseId: "lease" };
const fields: AmendmentDraftFields = {
  changeType: "rent_increase",
  effectiveDate: "2026-10-01",
  description: " Rent change ",
  monthlyRent: "1200",
  endDate: "",
  termsAndConditions: "",
  specialClauses: "",
};
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
beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "locks", {
    value: undefined,
    configurable: true,
  });
});
afterEach(() => jest.restoreAllMocks());
it("normalizes the submitted terms and excludes hidden fields from other change types", () => {
  expect(amendmentDraft(fields, scope)).toEqual({
    companyId: "company",
    leaseId: "lease",
    effectiveDate: "2026-10-01",
    description: "Rent change",
    changeType: "rent_increase",
    newValues: { monthlyRent: "1200.00" },
  });
  expect(
    amendmentDraft({ ...fields, changeType: "early_termination" }, scope)
      ?.newValues,
  ).toEqual({});
  expect(
    amendmentDraft(
      { ...fields, changeType: "extension", endDate: "2027-10-01" },
      scope,
    )?.newValues,
  ).toEqual({ endDate: "2027-10-01" });
  expect(
    amendmentDraft(
      {
        ...fields,
        changeType: "clause_modification",
        specialClauses: " New clauses ",
      },
      scope,
    )?.newValues,
  ).toEqual({ specialClauses: "New clauses" });
});
it.each([
  { monthlyRent: "1200.001" },
  { monthlyRent: "0" },
  { monthlyRent: "-5" },
  { monthlyRent: "1e3" },
  { effectiveDate: "2026-02-30" },
  { description: " " },
  { changeType: "extension" as const, endDate: "2026-01-01" },
  { changeType: "other" as const, specialClauses: "" },
  { changeType: "clause_modification" as const },
])("rejects invalid draft terms %j", (invalid) =>
  expect(amendmentDraft({ ...fields, ...invalid }, scope)).toBeNull(),
);
it("accepts clause replacements for guarantee and other changes", () => {
  for (const changeType of ["guarantor_change", "other"] as const)
    expect(
      amendmentDraft(
        { ...fields, changeType, specialClauses: "Replacement clause" },
        scope,
      )?.newValues,
    ).toEqual({ specialClauses: "Replacement clause" });
});
it("recovers the same key after rebuilding the same request without storing contract text", async () => {
  const dto = amendmentDraft(fields, scope)!;
  const first = await prepareAmendmentAttempt(scope, { action: "create", dto });
  const second = await prepareAmendmentAttempt(scope, {
    dto: { ...dto, newValues: { monthlyRent: "1200.00" } },
    action: "create",
  });
  expect(second).toEqual(first);
  expect(localStorage).toHaveLength(1);
  expect(first.storageKey).not.toContain("Rent change");
  expect(localStorage.getItem(first.storageKey)).toBe(first.idempotencyKey);
});
it("separates companies, users, contracts and changed requests", async () => {
  const requests = await Promise.all([
    prepareAmendmentAttempt(scope, { value: 1 }),
    prepareAmendmentAttempt({ ...scope, companyId: "other" }, { value: 1 }),
    prepareAmendmentAttempt({ ...scope, userId: "other" }, { value: 1 }),
    prepareAmendmentAttempt({ ...scope, leaseId: "other" }, { value: 1 }),
    prepareAmendmentAttempt(scope, { value: 2 }),
  ]);
  expect(new Set(requests.map((r) => r.idempotencyKey)).size).toBe(5);
});
it("uses browser locks to allocate one stored key across simultaneous requests", async () => {
  const lock = jest.fn(async (_key: string, callback: () => unknown) =>
    callback(),
  );
  Object.defineProperty(navigator, "locks", {
    value: { request: lock },
    configurable: true,
  });
  const [first, second] = await Promise.all([
    prepareAmendmentAttempt(scope, { value: 1 }),
    prepareAmendmentAttempt(scope, { value: 1 }),
  ]);
  expect(first).toEqual(second);
  expect(lock).toHaveBeenCalledTimes(2);
});
it("fails before submission if storage is unavailable or a stored key is corrupt", async () => {
  const first = await prepareAmendmentAttempt(scope, { value: 1 });
  localStorage.setItem(first.storageKey, "corrupt");
  await expect(prepareAmendmentAttempt(scope, { value: 1 })).rejects.toThrow(
    "Invalid",
  );
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("storage failed");
  });
  await expect(prepareAmendmentAttempt(scope, { value: 2 })).rejects.toThrow(
    "storage failed",
  );
  await expect(
    prepareAmendmentAttempt({ ...scope, companyId: "" }, { value: 2 }),
  ).rejects.toThrow("scope");
});
it("cleans only the successful attempt and tolerates failed cleanup", async () => {
  const first = await prepareAmendmentAttempt(scope, { value: 1 });
  completeAmendmentAttempt(first);
  expect(localStorage).toHaveLength(0);
  const second = await prepareAmendmentAttempt(scope, { value: 1 });
  completeAmendmentAttempt(first);
  expect(localStorage.getItem(second.storageKey)).toBe(second.idempotencyKey);
  jest.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
    throw new Error("cleanup failed");
  });
  expect(() => completeAmendmentAttempt(second)).not.toThrow();
});
