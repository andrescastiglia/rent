export interface NavItem {
  labelKey: string; // Clave de traducción en messages/**.json bajo "nav"
  href: string;
  roles: string[];
  icon?: string;
  disabled?: boolean;
}

export interface NavigationUser {
  role: string;
  roles?: string[];
  permissions?: Record<string, boolean>;
}

export function getUserRoles(
  user: Pick<NavigationUser, 'role' | 'roles'> | null | undefined,
): string[] {
  if (!user) return [];
  return user.roles?.length ? user.roles : [user.role];
}

export function isInternalUser(
  user: Pick<NavigationUser, 'role' | 'roles'> | null | undefined,
): boolean {
  const roles = getUserRoles(user);
  return roles.includes('admin') || roles.includes('staff');
}

type RoutePolicy = {
  roles: string[];
  staffPermission?: string;
};

export function canManageLeases(role: string | undefined): boolean {
  return role === 'admin' || role === 'staff';
}

export function canManageLeasesForUser(
  user: NavigationUser | null | undefined,
): boolean {
  return Boolean(
    user && isInternalUser(user) && canUserAccessPath(user, '/leases/new'),
  );
}

export function canManageTenants(role: string | undefined): boolean {
  return role === 'admin' || role === 'staff';
}

export function canManageTenantsForUser(
  user: NavigationUser | null | undefined,
): boolean {
  return Boolean(
    user && isInternalUser(user) && canUserAccessPath(user, '/tenants/new'),
  );
}

export function canManageOwners(role: string | undefined): boolean {
  return role === 'admin' || role === 'staff';
}

export function canManageOwnersForUser(
  user: NavigationUser | null | undefined,
): boolean {
  return Boolean(
    user && isInternalUser(user) && canUserAccessPath(user, '/owners/new'),
  );
}

const routePolicies: Record<string, RoutePolicy> = {
  agenda: { roles: ['admin', 'staff'] },
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
  sales: { roles: ['admin', 'buyer'], staffPermission: 'sales' },
  buyers: { roles: ['admin'], staffPermission: 'buyers' },
  reports: { roles: ['admin', 'owner'], staffPermission: 'reports' },
  maintenance: {
    roles: ['admin', 'owner', 'tenant'],
    staffPermission: 'maintenance',
  },
  users: { roles: ['admin'] },
  ai: {
    roles: ['admin', 'owner', 'tenant', 'buyer'],
    staffPermission: 'ai',
  },
};

export const navigationItems: NavItem[] = [
  { labelKey: 'agenda', href: '/agenda', roles: ['admin', 'staff'] },
  {
    labelKey: 'dashboard',
    href: '/dashboard',
    roles: ['admin', 'owner', 'tenant', 'staff'],
  },
  {
    labelKey: 'owners',
    href: '/owners',
    roles: ['admin', 'owner', 'staff'],
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
    labelKey: 'sales',
    href: '/sales',
    roles: ['admin', 'staff', 'buyer'],
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

export function getLandingPathForRole(_role: string | undefined): string {
  return '/home';
}

export function getLandingPathForUser(
  _user: Pick<NavigationUser, 'role' | 'roles'> | null | undefined,
): string {
  return '/home';
}

export function getNavigationForRole(role: string): NavItem[] {
  return navigationItems.filter((item) => item.roles.includes(role));
}

export function getNavigationForUser(user: NavigationUser): NavItem[] {
  return navigationItems.filter((item) => canUserAccessPath(user, item.href));
}

export function canUserAccessPath(user: NavigationUser, path: string): boolean {
  const userRoles = getUserRoles(user);
  if (path.split('?')[0].split('/').includes('agenda'))
    return (
      userRoles.includes('admin') ||
      (userRoles.includes('staff') &&
        (!path.includes('/proposals') || user.permissions?.approvals === true))
    );
  const normalizedPath = path.split('?')[0].replace(/\/$/, '');
  const staffOnlyMutationPath = [
    /^\/properties\/new$/,
    /^\/properties\/[^/]+\/edit$/,
    /^\/properties\/[^/]+\/(visits|maintenance)\/new$/,
    /^\/leases\/new$/,
    /^\/leases\/[^/]+\/edit$/,
    /^\/tenants\/new$/,
    /^\/tenants\/[^/]+\/edit$/,
    /^\/tenants\/[^/]+\/payments\/new$/,
    /^\/tenants\/[^/]+\/activities\/new$/,
    /^\/owners\/new$/,
    /^\/owners\/[^/]+\/edit$/,
    /^\/owners\/[^/]+\/pay$/,
  ].some((pattern) => pattern.test(normalizedPath));
  if (
    staffOnlyMutationPath &&
    !userRoles.some((role) => role === 'admin' || role === 'staff')
  ) {
    return false;
  }
  const segment = path
    .split('?')[0]
    .split('/')
    .find((part) => part !== '' && !part.startsWith('('));
  if (!segment || ['settings', 'home', 'tasks', 'more'].includes(segment))
    return true;
  const policy = routePolicies[segment];
  if (!policy) return false;
  if (userRoles.includes('admin')) return true;
  if (userRoles.includes('staff')) {
    if (staffOnlyMutationPath)
      return Boolean(
        policy.staffPermission &&
        user.permissions?.[policy.staffPermission] === true,
      );
    if (
      userRoles.some((role) => role !== 'staff' && policy.roles.includes(role))
    ) {
      return true;
    }
    return policy.staffPermission
      ? user.permissions?.[policy.staffPermission] === true
      : false;
  }
  return userRoles.some((role) => policy.roles.includes(role));
}
