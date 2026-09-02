import { hasModuleAccess } from "./permissions";

describe("hasModuleAccess", () => {
  it("keeps module permissions transparent for non-staff roles", () => {
    expect(hasModuleAccess("admin", undefined, "users")).toBe(true);
    expect(hasModuleAccess("owner", {}, "properties")).toBe(true);
  });

  it("denies staff without an explicit true permission", () => {
    expect(hasModuleAccess("staff", undefined, "payments")).toBe(false);
    expect(hasModuleAccess("staff", {}, "payments")).toBe(false);
    expect(hasModuleAccess("staff", { payments: false }, "payments")).toBe(
      false,
    );
    expect(hasModuleAccess("staff", { payments: true }, "payments")).toBe(true);
    expect(hasModuleAccess("staff", { payments: true })).toBe(false);
  });
});
