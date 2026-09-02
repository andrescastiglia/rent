import {
  navigationItems,
  getLandingPathForRole,
  getNavigationForRole,
  getNavigationForUser,
} from "./navigation";
import { hasModuleAccess } from "@/lib/permissions";

jest.mock("@/lib/permissions", () => ({
  hasModuleAccess: jest.fn(),
}));

const mockHasModuleAccess = hasModuleAccess as jest.Mock;

describe("navigationItems", () => {
  it("exports a non-empty array", () => {
    expect(navigationItems.length).toBeGreaterThan(0);
  });
});

describe("getLandingPathForRole", () => {
  it("routes relationship roles to a safe landing page", () => {
    expect(getLandingPathForRole("owner")).toBe("/portal/owner");
    expect(getLandingPathForRole("tenant")).toBe("/portal/tenant");
    expect(getLandingPathForRole("buyer")).toBe("/settings");
    expect(getLandingPathForRole("admin")).toBe("/dashboard");
    expect(getLandingPathForRole("staff")).toBe("/dashboard");
  });
});

describe("getNavigationForRole", () => {
  it("returns items that include admin in roles array", () => {
    const result = getNavigationForRole("admin");
    expect(result.length).toBeGreaterThan(0);
    result.forEach((item) => expect(item.roles).toContain("admin"));
  });

  it("returns only items where roles includes tenant", () => {
    const result = getNavigationForRole("tenant");
    expect(result.length).toBeGreaterThan(0);
    result.forEach((item) => expect(item.roles).toContain("tenant"));
    const tenantHrefs = result.map((i) => i.href);
    expect(tenantHrefs).toContain("/dashboard");
    expect(tenantHrefs).toContain("/leases");
    expect(tenantHrefs).not.toContain("/payments");
    expect(tenantHrefs).not.toContain("/invoices");
    expect(tenantHrefs).not.toContain("/users");
    expect(tenantHrefs).not.toContain("/properties");
  });

  it("returns empty array for unknown role", () => {
    expect(getNavigationForRole("unknown")).toEqual([]);
  });

  it("does not expose the company CRM to owners", () => {
    const ownerRoutes = getNavigationForRole("owner").map((item) => item.href);
    expect(ownerRoutes).not.toContain("/interested");
    expect(ownerRoutes).not.toContain("/payments");
    expect(ownerRoutes).not.toContain("/invoices");
  });
});

describe("getNavigationForUser", () => {
  afterEach(() => {
    mockHasModuleAccess.mockReset();
  });

  it("excludes items when hasModuleAccess returns false for them", () => {
    // Grant access only to items without a moduleKey or moduleKey === 'dashboard'
    mockHasModuleAccess.mockImplementation(
      (_role: string, _perms: unknown, moduleKey?: string) =>
        moduleKey === "dashboard" || moduleKey === undefined,
    );

    const user = { role: "admin", permissions: {} } as Parameters<
      typeof getNavigationForUser
    >[0];
    const result = getNavigationForUser(user);

    expect(mockHasModuleAccess).toHaveBeenCalled();
    // All returned items must have passed the access check
    result.forEach((item) =>
      expect(
        item.moduleKey === "dashboard" || item.moduleKey === undefined,
      ).toBe(true),
    );
    // Items with other moduleKeys should be excluded
    expect(result.map((i) => i.href)).not.toContain("/properties");
    expect(result.map((i) => i.href)).not.toContain("/reports");
  });

  it("with full access returns the same items as getNavigationForRole", () => {
    mockHasModuleAccess.mockReturnValue(true);

    const user = { role: "owner", permissions: {} } as Parameters<
      typeof getNavigationForUser
    >[0];
    const result = getNavigationForUser(user);
    const byRole = getNavigationForRole("owner");

    expect(result).toEqual(byRole);
  });
});
