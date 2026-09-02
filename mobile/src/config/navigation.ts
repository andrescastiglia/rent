export interface NavItem {
  labelKey: string; // Clave de traducción en messages/**.json bajo "nav"
  href: string;
  roles: string[];
  icon?: string;
  disabled?: boolean;
}

export interface NavigationUser {
  role: string;
  permissions?: Record<string, boolean>;
}

type RoutePolicy = {
  roles: string[];
  staffPermission?: string;
};

export function canManageLeases(role: string | undefined): boolean {
  return role === 'admin' || role === 'staff';
}

export function canManageTenants(role: string | undefined): boolean {
  return role === 'admin' || role === 'staff';
}

export function canManageOwners(role: string | undefined): boolean {
  return role === 'admin' || role === 'staff';
}

const routePolicies: Record<string, RoutePolicy> = {
  dashboard: {
    roles: ['admin', 'owner', 'tenant'],
    staffPermission: 'dashboard',
  },
  properties: {
    roles: ['admin', 'owner'],
    staffPermission: 'properties',
  },
  owners: { roles: ['admin', 'owner'], staffPermission: 'owners' },
  interested: {
    roles: ['admin'],
    staffPermission: 'interested',
  },
  tenants: { roles: ['admin', 'owner'], staffPermission: 'tenants' },
  leases: {
    roles: ['admin', 'owner', 'tenant'],
    staffPermission: 'leases',
  },
  templates: { roles: ['admin'], staffPermission: 'templates' },
  payments: {
    roles: ['admin'],
    staffPermission: 'payments',
  },
  invoices: {
    roles: ['admin'],
    staffPermission: 'invoices',
  },
  sales: { roles: ['admin'], staffPermission: 'sales' },
  reports: { roles: ['admin', 'owner'], staffPermission: 'reports' },
  users: { roles: ['admin'] },
  ai: {
    roles: ['admin', 'owner', 'tenant', 'buyer'],
    staffPermission: 'ai',
  },
};

export const navigationItems: NavItem[] = [
  {
    labelKey: 'dashboard',
    href: '/dashboard',
    roles: ['admin', 'owner', 'tenant', 'staff'],
  },
  {
    labelKey: 'properties',
    href: '/properties',
    roles: ['admin', 'owner'],
  },
  {
    labelKey: 'tenants',
    href: '/tenants',
    roles: ['admin', 'owner'],
  },
  {
    labelKey: 'leases',
    href: '/leases',
    roles: ['admin', 'owner', 'tenant'],
  },
  {
    labelKey: 'templates',
    href: '/templates',
    roles: ['admin', 'staff'],
  },
  {
    labelKey: 'reports',
    href: '/reports',
    roles: ['admin', 'owner', 'staff'],
  },
  {
    labelKey: 'payments',
    href: '/payments',
    roles: ['admin', 'staff'],
  },
  {
    labelKey: 'invoices',
    href: '/invoices',
    roles: ['admin', 'staff'],
  },
  {
    labelKey: 'interested',
    href: '/interested',
    roles: ['admin', 'staff'],
  },
  {
    labelKey: 'users',
    href: '/users',
    roles: ['admin'],
  },
  {
    labelKey: 'aiAssistant',
    href: '/ai',
    roles: ['admin', 'owner', 'tenant', 'staff', 'buyer'],
  },
];

export function getLandingPathForRole(role: string | undefined): string {
  return role === 'buyer' ? '/ai' : '/dashboard';
}

export function getNavigationForRole(role: string): NavItem[] {
  return navigationItems.filter((item) => item.roles.includes(role));
}

export function getNavigationForUser(user: NavigationUser): NavItem[] {
  return navigationItems.filter((item) => canUserAccessPath(user, item.href));
}

export function canUserAccessPath(user: NavigationUser, path: string): boolean {
  const normalizedPath = path.split('?')[0].replace(/\/$/, '');
  const staffOnlyMutationPath = [
    /^\/leases\/new$/,
    /^\/leases\/[^/]+\/edit$/,
    /^\/tenants\/new$/,
    /^\/tenants\/[^/]+\/edit$/,
    /^\/tenants\/[^/]+\/payments\/new$/,
    /^\/owners\/new$/,
    /^\/owners\/[^/]+\/pay$/,
  ].some((pattern) => pattern.test(normalizedPath));
  if (staffOnlyMutationPath && user.role !== 'admin' && user.role !== 'staff') {
    return false;
  }
  const segment = path
    .split('?')[0]
    .split('/')
    .find((part) => part !== '' && !part.startsWith('('));
  if (!segment || segment === 'settings') return true;
  const policy = routePolicies[segment];
  if (!policy) return false;
  if (user.role === 'staff') {
    return policy.staffPermission
      ? user.permissions?.[policy.staffPermission] === true
      : false;
  }
  return policy.roles.includes(user.role);
}
