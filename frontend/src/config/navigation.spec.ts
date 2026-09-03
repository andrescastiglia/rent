import {
  navigationItems,
  getLandingPathForRole,
  getLandingPathForUser,
  getNavigationForRole,
  getNavigationForUser,
} from "./navigation";
import { canUserAccessModule } from "@/lib/permissions";

jest.mock("@/lib/permissions", () => ({
  canUserAccessModule: jest.fn(),
}));

const mockCanUserAccessModule = canUserAccessModule as jest.Mock;

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
    mockCanUserAccessModule.mockReset();
  });

  it("excludes items when the combined role policy returns false", () => {
    mockCanUserAccessModule.mockImplementation(
      (_user: unknown, _roles: string[], moduleKey?: string) =>
        moduleKey === "dashboard" || moduleKey === undefined,
    );

    const user = { role: "admin", permissions: {} } as Parameters<
      typeof getNavigationForUser
    >[0];
    const result = getNavigationForUser(user);

    expect(mockCanUserAccessModule).toHaveBeenCalled();
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
    mockCanUserAccessModule.mockImplementation(
      (_user: unknown, roles: string[]) => roles.includes("owner"),
    );

    const user = { role: "owner", permissions: {} } as Parameters<
      typeof getNavigationForUser
    >[0];
    const result = getNavigationForUser(user);
    const byRole = getNavigationForRole("owner");

    expect(result).toEqual(byRole);
  });
});

describe("getLandingPathForUser", () => {
  it("uses the task dashboard when any non-buyer role is present", () => {
    expect(
      getLandingPathForUser({ role: "buyer", roles: ["buyer", "owner"] }),
    ).toBe("/dashboard");
  });

  it("keeps buyer-only users on their available settings page", () => {
    expect(getLandingPathForUser({ role: "buyer", roles: ["buyer"] })).toBe(
      "/settings",
    );
  });
});
