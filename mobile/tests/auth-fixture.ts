import type { User } from '@/types/auth';
import { useAuth } from '@/contexts/auth-context';

export const admin: User = {
  id: 'admin-1',
  email: 'admin@example.com',
  firstName: 'Ana',
  lastName: 'Admin',
  role: 'admin',
  roles: ['admin'],
  companyId: 'company-1',
};
export function setAuth(
  user: User | null = admin,
  overrides: Partial<ReturnType<typeof useAuth>> = {},
) {
  const value = {
    user,
    token: 'access-token',
    loading: false,
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
    updateUser: jest.fn(),
    ...overrides,
  };
  jest.mocked(useAuth).mockReturnValue(value);
  return value;
}
