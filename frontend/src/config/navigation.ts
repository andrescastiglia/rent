import type { User, UserModulePermissionKey } from "@/types/auth";
import { hasModuleAccess } from "@/lib/permissions";
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
    roles: ["admin", "owner"],
    moduleKey: "properties",
    icon: Building2,
  },
  {
    labelKey: "tenants",
    href: "/tenants",
    roles: ["admin", "owner"],
    moduleKey: "tenants",
    icon: Users,
  },
  {
    labelKey: "leases",
    href: "/leases",
    roles: ["admin", "owner", "tenant"],
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
    roles: ["admin", "owner", "tenant", "staff"],
    moduleKey: "payments",
    icon: CreditCard,
  },
  {
    labelKey: "invoices",
    href: "/invoices",
    roles: ["admin", "owner", "tenant", "staff"],
    moduleKey: "invoices",
    icon: Receipt,
  },
  {
    labelKey: "interested",
    href: "/interested",
    roles: ["admin", "owner", "staff"],
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
    icon: Wrench,
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
