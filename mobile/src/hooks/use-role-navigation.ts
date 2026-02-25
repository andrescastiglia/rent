import { getNavigationForRole, type NavItem } from '@/config/navigation';
import { useAuth } from '@/contexts/auth-context';

export function useRoleNavigation(): NavItem[] {
  const { user } = useAuth();
  if (!user) {
    return [];
  }

  return getNavigationForRole(user.role);
}

export function useCanAccess(path: string): boolean {
  const items = useRoleNavigation();
  return items.some((item) => item.href === path);
}
