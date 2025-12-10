export interface NavItem {
    labelKey: string; // Clave de traducción en messages/**.json bajo "nav"
    href: string;
    roles: string[];
    icon?: string;
    disabled?: boolean;
}

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
        labelKey: 'payments',
        href: '/payments',
        roles: ['admin', 'owner', 'tenant', 'staff'],
    },
    {
        labelKey: 'invoices',
        href: '/invoices',
        roles: ['admin', 'owner', 'tenant', 'staff'],
    },
    {
        labelKey: 'users',
        href: '/users',
        roles: ['admin'],
        disabled: true,
    },
];

export function getNavigationForRole(role: string): NavItem[] {
    return navigationItems.filter((item) => item.roles.includes(role));
}
