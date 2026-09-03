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
} from "lucide-react";

export interface NavItem {
  labelKey: string; // Clave de traducción en messages/**.json bajo "nav"
  href: string;
  roles: string[];
  moduleKey?: UserModulePermissionKey;
  icon?: LucideIcon;
  disabled?: boolean;
}

export const navigationItems: NavItem[] = [
  {
    labelKey: "dashboard",
    href: "/dashboard",
    roles: ["admin", "owner", "tenant", "staff"],
    moduleKey: "dashboard",
    icon: LayoutDashboard,
  },
  {
    labelKey: "properties",
    href: "/properties",
    roles: ["admin", "owner", "staff"],
    moduleKey: "properties",
    icon: Building2,
  },
  {
    labelKey: "tenants",
    href: "/tenants",
    roles: ["admin", "owner", "staff"],
    moduleKey: "tenants",
    icon: Users,
  },
  {
    labelKey: "leases",
    href: "/leases",
    roles: ["admin", "owner", "tenant", "staff"],
    moduleKey: "leases",
    icon: FileText,
  },
  {
    labelKey: "templates",
    href: "/templates",
    roles: ["admin", "staff"],
    moduleKey: "templates",
    icon: FileStack,
  },
  {
    labelKey: "reports",
    href: "/reports",
    roles: ["admin", "owner", "staff"],
    moduleKey: "reports",
    icon: BarChart2,
  },
  {
    labelKey: "payments",
    href: "/payments",
    roles: ["admin", "staff"],
    moduleKey: "payments",
    icon: CreditCard,
  },
  {
    labelKey: "invoices",
    href: "/invoices",
    roles: ["admin", "staff"],
    moduleKey: "invoices",
    icon: Receipt,
  },
  {
    labelKey: "sales",
    href: "/sales",
    roles: ["admin", "staff"],
    moduleKey: "sales",
    icon: HandCoins,
  },
  {
    labelKey: "interested",
    href: "/interested",
    roles: ["admin", "staff"],
    moduleKey: "interested",
    icon: UserSearch,
  },
  {
    labelKey: "users",
    href: "/users",
    roles: ["admin"],
    moduleKey: "users",
    icon: UserCog,
  },
  {
    labelKey: "staff",
    href: "/staff",
    roles: ["admin"],
    icon: HardHat,
  },
  {
    labelKey: "maintenance",
    href: "/maintenance",
    roles: ["admin", "staff"],
    moduleKey: "maintenance",
    icon: Wrench,
  },
];

export function getNavigationForRole(role: string): NavItem[] {
  return navigationItems.filter((item) => item.roles.includes(role));
}

export function getLandingPathForRole(role: User["role"] | undefined): string {
  if (role === "tenant") return "/portal/tenant";
  if (role === "owner") return "/portal/owner";
  if (role === "buyer") return "/settings";
  return "/dashboard";
}

export function getLandingPathForUser(
  user: Pick<User, "role" | "roles"> | null | undefined,
): string {
  if (!user) return "/dashboard";
  const roles = user.roles?.length ? user.roles : [user.role];
  if (roles.some((role) => role !== "buyer")) return "/dashboard";
  return "/settings";
}

export function getNavigationForUser(
  user: Pick<User, "role" | "roles" | "permissions">,
): NavItem[] {
  return navigationItems.filter((item) =>
    canUserAccessModule(user, item.roles, item.moduleKey),
  );
}
