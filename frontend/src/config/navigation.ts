import type { User, UserModulePermissionKey } from "@/types/auth";
import { hasModuleAccess } from "@/lib/permissions";

export interface NavItem {
  labelKey: string; // Clave de traducción en messages/**.json bajo "nav"
  href: string;
  roles: string[];
  moduleKey?: UserModulePermissionKey;
  icon?: string;
  disabled?: boolean;
}

export const navigationItems: NavItem[] = [
  {
    labelKey: "dashboard",
    href: "/dashboard",
    roles: ["admin", "owner", "tenant", "staff"],
    moduleKey: "dashboard",
  },
  {
    labelKey: "properties",
    href: "/properties",
    roles: ["admin", "owner"],
    moduleKey: "properties",
  },
  {
    labelKey: "tenants",
    href: "/tenants",
    roles: ["admin", "owner"],
    moduleKey: "tenants",
  },
  {
    labelKey: "leases",
    href: "/leases",
    roles: ["admin", "owner", "tenant"],
    moduleKey: "leases",
  },
  {
    labelKey: "templates",
    href: "/templates",
    roles: ["admin", "staff"],
    moduleKey: "templates",
  },
  {
    labelKey: "reports",
    href: "/reports",
    roles: ["admin", "owner", "staff"],
    moduleKey: "reports",
  },
  {
    labelKey: "payments",
    href: "/payments",
    roles: ["admin", "owner", "tenant", "staff"],
    moduleKey: "payments",
  },
  {
    labelKey: "invoices",
    href: "/invoices",
    roles: ["admin", "owner", "tenant", "staff"],
    moduleKey: "invoices",
  },
  {
    labelKey: "interested",
    href: "/interested",
    roles: ["admin", "owner", "staff"],
    moduleKey: "interested",
  },
  {
    labelKey: "users",
    href: "/users",
    roles: ["admin"],
    moduleKey: "users",
  },
];

export function getNavigationForRole(role: string): NavItem[] {
  return navigationItems.filter((item) => item.roles.includes(role));
}

export function getNavigationForUser(
  user: Pick<User, "role" | "permissions">,
): NavItem[] {
  return navigationItems.filter(
    (item) =>
      item.roles.includes(user.role) &&
      hasModuleAccess(user.role, user.permissions, item.moduleKey),
  );
}
