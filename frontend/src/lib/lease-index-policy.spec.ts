import { createLeaseSchema } from "./validation-schemas";
const schema = createLeaseSchema((key) => key);
const lease = {
  contractType: "rental",
  propertyId: "property",
  tenantId: "tenant",
  startDate: "2025-01-01",
  endDate: "2026-01-01",
  rentAmount: 1000,
  depositAmount: 0,
  status: "DRAFT",
  currency: "ARS",
  adjustmentType: "inflation_index",
  inflationIndexType: "ipc",
};
it("requires a monthly lag without coercing an empty field to zero", () => {
  for (const lag of [undefined, "", null, -1, 13, 1.5]) {
    const result = schema.safeParse({ ...lease, inflationIndexLagMonths: lag });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(
        result.error.issues.some(
          (issue) => issue.path[0] === "inflationIndexLagMonths",
        ),
      ).toBe(true);
  }
});
it("accepts explicitly selected zero and lagged months while ICL has no monthly lag", () => {
  expect(
    schema.safeParse({ ...lease, inflationIndexLagMonths: "0" }).success,
  ).toBe(true);
  expect(
    schema.safeParse({ ...lease, inflationIndexLagMonths: 1 }).success,
  ).toBe(true);
  expect(
    schema.safeParse({ ...lease, inflationIndexType: "icl" }).success,
  ).toBe(true);
});
