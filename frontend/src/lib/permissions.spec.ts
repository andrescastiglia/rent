import {
  canManageLeases,
  canManageOwners,
  canManageOwnersForUser,
  canManageTenants,
  canUserAccessModule,
  hasModuleAccess,
} from "./permissions";

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

describe("canManageLeases", () => {
  it.each(["admin", "staff"] as const)("allows %s to mutate leases", (role) => {
    expect(canManageLeases(role)).toBe(true);
  });

  it.each(["owner", "tenant", "buyer", undefined] as const)(
    "keeps %s read-only",
    (role) => {
      expect(canManageLeases(role)).toBe(false);
    },
  );
});

describe("canManageTenants", () => {
  it.each(["admin", "staff"] as const)(
    "allows %s to mutate tenants",
    (role) => {
      expect(canManageTenants(role)).toBe(true);
    },
  );

  it.each(["owner", "tenant", "buyer", undefined] as const)(
    "keeps %s from tenant mutation flows",
    (role) => {
      expect(canManageTenants(role)).toBe(false);
    },
  );
});

describe("canManageOwners", () => {
  it.each(["admin", "staff"] as const)(
    "allows %s to create owners and register settlements",
    (role) => {
      expect(canManageOwners(role)).toBe(true);
    },
  );

  it.each(["owner", "tenant", "buyer", undefined] as const)(
    "keeps %s out of owner backoffice mutations",
    (role) => {
      expect(canManageOwners(role)).toBe(false);
    },
  );
});

describe("multi-role permissions", () => {
  it("recognizes internal capabilities held as a secondary role", () => {
    expect(
      canManageOwnersForUser({ role: "owner", roles: ["owner", "staff"] }),
    ).toBe(true);
  });

  it("combines read access from one role with staff module permissions", () => {
    expect(
      canUserAccessModule(
        {
          role: "owner",
          roles: ["owner", "staff"],
          permissions: { payments: true },
        },
        ["staff"],
        "payments",
      ),
    ).toBe(true);
    expect(
      canUserAccessModule(
        {
          role: "owner",
          roles: ["owner", "staff"],
          permissions: { payments: false },
        },
        ["staff"],
        "payments",
      ),
    ).toBe(false);
  });
});
