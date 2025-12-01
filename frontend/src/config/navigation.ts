export interface NavItem {
    label: string;
    href: string;
    roles: string[];
    icon?: string;
}

export const navigationItems: NavItem[] = [
    {
        label: 'Dashboard',
        href: '/dashboard',
        roles: ['admin', 'owner', 'tenant', 'staff'],
    },
    {
        label: 'Propiedades',
        href: '/dashboard/properties',
        roles: ['admin', 'owner'],
    },
    {
        label: 'Inquilinos',
        href: '/dashboard/tenants',
        roles: ['admin', 'owner'],
    },
    {
        label: 'Contratos',
        href: '/dashboard/leases',
        roles: ['admin', 'owner', 'tenant'],
    },
    {
        label: 'Pagos',
        href: '/dashboard/payments',
        roles: ['admin', 'owner', 'tenant'],
    },
    {
        label: 'Usuarios',
        href: '/dashboard/users',
        roles: ['admin'],
    },
];

export function getNavigationForRole(role: string): NavItem[] {
    return navigationItems.filter((item) => item.roles.includes(role));
}
