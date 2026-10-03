import type { User, UserModulePermissionKey } from "@/types/auth";
import { canUserAccessModule } from "@/lib/permissions";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Building2,
  Users,
  FileText,
  FileStack,
  BarChart2,
  CreditCard,
  Receipt,
  UserSearch,
  UserCog,
  HardHat,
  Wrench,
  HandCoins,
  ContactRound,
} from "lucide-react";

export type NavigationGroup =
  "home" | "operations" | "people" | "administration";

export interface NavItem {
  labelKey: string; // Clave de traducción en messages/**.json bajo "nav"
  href: string;
  roles: string[];
  moduleKey?: UserModulePermissionKey;
  icon?: LucideIcon;
  disabled?: boolean;
  group?: NavigationGroup;
}

export const navigationItems: NavItem[] = [
  {
    labelKey: "agenda",
    href: "/agenda",
    roles: ["admin", "staff"],
    icon: LayoutDashboard,
    group: "operations",
  },
  {
    labelKey: "buyerPortal",
    href: "/portal/buyer",
    roles: ["buyer"],
    icon: HandCoins,
    group: "operations",
  },
  {
    labelKey: "dashboard",
    href: "/dashboard",
    roles: ["admin", "owner", "tenant", "staff"],
    moduleKey: "dashboard",
    icon: LayoutDashboard,
    group: "home",
  },
  {
    labelKey: "properties",
    href: "/properties",
    roles: ["admin", "owner", "staff"],
    moduleKey: "properties",
    icon: Building2,
    group: "operations",
  },
  {
    labelKey: "tenants",
    href: "/tenants",
    roles: ["admin", "owner", "staff"],
    moduleKey: "tenants",
    icon: Users,
    group: "people",
  },
  {
    labelKey: "owners",
    href: "/owners",
    roles: ["admin", "owner", "staff"],
    moduleKey: "owners",
    icon: ContactRound,
    group: "people",
  },
  {
    labelKey: "leases",
    href: "/leases",
    roles: ["admin", "owner", "tenant", "staff"],
    moduleKey: "leases",
    icon: FileText,
    group: "operations",
  },
  {
    labelKey: "templates",
    href: "/templates",
    roles: ["admin", "staff"],
    moduleKey: "templates",
    icon: FileStack,
    group: "administration",
  },
  {
    labelKey: "reports",
    href: "/reports",
    roles: ["admin", "owner", "staff"],
    moduleKey: "reports",
    icon: BarChart2,
    group: "operations",
  },
  {
    labelKey: "payments",
    href: "/payments",
    roles: ["admin", "staff"],
    moduleKey: "payments",
    icon: CreditCard,
    group: "operations",
  },
  {
    labelKey: "invoices",
    href: "/invoices",
    roles: ["admin", "staff"],
    moduleKey: "invoices",
    icon: Receipt,
    group: "operations",
  },
  {
    labelKey: "sales",
    href: "/sales",
    roles: ["admin", "staff"],
    moduleKey: "sales",
    icon: HandCoins,
    group: "operations",
  },
  {
    labelKey: "buyers",
    href: "/buyers",
    roles: ["admin", "owner", "staff"],
    moduleKey: "sales",
    icon: ContactRound,
    group: "people",
  },
  {
    labelKey: "interested",
    href: "/interested",
    roles: ["admin", "staff"],
    moduleKey: "interested",
    icon: UserSearch,
    group: "people",
  },
  {
    labelKey: "users",
    href: "/users",
    roles: ["admin"],
    moduleKey: "users",
    icon: UserCog,
    group: "administration",
  },
  {
    labelKey: "staff",
    href: "/staff",
    roles: ["admin"],
    icon: HardHat,
    group: "administration",
  },
  {
    labelKey: "maintenance",
    href: "/maintenance",
    roles: ["admin", "staff"],
    moduleKey: "maintenance",
    icon: Wrench,
    group: "operations",
  },
];

export function getNavigationForRole(role: string): NavItem[] {
  return navigationItems.filter((item) => item.roles.includes(role));
}

export function getLandingPathForRole(role: User["role"] | undefined): string {
  if (role === "tenant") return "/portal/tenant";
  if (role === "owner") return "/portal/owner";
  if (role === "buyer") return "/portal/buyer";
  return "/dashboard";
}

export function getLandingPathForUser(
  user: Pick<User, "role" | "roles"> | null | undefined,
): string {
  if (!user) return "/dashboard";
  const roles = user.roles?.length ? user.roles : [user.role];
  if (roles.includes("admin") || roles.includes("staff")) return "/dashboard";
  if (roles.includes("owner")) return "/portal/owner";
  if (roles.includes("tenant")) return "/portal/tenant";
  return "/portal/buyer";
}

export function getNavigationForUser(
  user: Pick<User, "role" | "roles" | "permissions">,
): NavItem[] {
  return navigationItems.filter((item) =>
    canUserAccessModule(user, item.roles, item.moduleKey),
  );
}
