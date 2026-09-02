import { usersApi } from '@/api/users';
import { clearAuth, clearLegacyUser, getToken } from '@/storage/auth-storage';
import { isTokenExpired } from '@/utils/jwt';

import { restoreSession } from './auth-session';

jest.mock('@/api/users', () => ({
  usersApi: { getProfile: jest.fn() },
}));
jest.mock('@/storage/auth-storage', () => ({
  clearAuth: jest.fn(),
  clearLegacyUser: jest.fn(),
  getToken: jest.fn(),
}));
jest.mock('@/utils/jwt', () => ({
  isTokenExpired: jest.fn(),
}));

describe('restoreSession', () => {
  const user = { id: 'user-1', role: 'staff', permissions: { leases: true } };

  beforeEach(() => {
    (getToken as jest.Mock).mockResolvedValue('token-123');
    (isTokenExpired as jest.Mock).mockReturnValue(false);
    (usersApi.getProfile as jest.Mock).mockResolvedValue(user);
  });

  it('rehydrates the user from the server using a valid stored token', async () => {
    await expect(restoreSession()).resolves.toEqual({
      token: 'token-123',
      user,
    });
    expect(usersApi.getProfile).toHaveBeenCalledTimes(1);
    expect(clearLegacyUser).toHaveBeenCalledTimes(1);
    expect(clearAuth).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', null, false],
    ['expired', 'token-123', true],
  ])('clears a %s stored session', async (_label, token, expired) => {
    (getToken as jest.Mock).mockResolvedValue(token);
    (isTokenExpired as jest.Mock).mockReturnValue(expired);

    await expect(restoreSession()).resolves.toBeNull();
    expect(usersApi.getProfile).not.toHaveBeenCalled();
    expect(clearAuth).toHaveBeenCalledTimes(1);
  });

  it('clears the token when the server rejects the profile', async () => {
    (usersApi.getProfile as jest.Mock).mockRejectedValue(new Error('401'));

    await expect(restoreSession()).resolves.toBeNull();
    expect(clearAuth).toHaveBeenCalledTimes(1);
  });
});
