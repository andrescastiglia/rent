export interface NavItem {
    label: string;
    href: string;
    roles: string[];
    icon?: string;
    disabled?: boolean;
}

export const navigationItems: NavItem[] = [
    {
        label: 'Dashboard',
        href: '/dashboard',
        roles: ['admin', 'owner', 'tenant', 'staff'],
    },
    {
        label: 'Propiedades',
        href: '/properties',
        roles: ['admin', 'owner'],
    },
    {
        label: 'Inquilinos',
        href: '/tenants',
        roles: ['admin', 'owner'],
    },
    {
        label: 'Contratos',
        href: '/leases',
        roles: ['admin', 'owner', 'tenant'],
    },
    {
        label: 'Pagos',
        href: '/payments',
        roles: ['admin', 'owner', 'tenant'],
        disabled: true,
    },
    {
        label: 'Usuarios',
        href: '/users',
        roles: ['admin'],
        disabled: true,
    },
];

export function getNavigationForRole(role: string): NavItem[] {
    return navigationItems.filter((item) => item.roles.includes(role));
}
