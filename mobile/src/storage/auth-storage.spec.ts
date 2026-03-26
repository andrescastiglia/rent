import * as SecureStore from 'expo-secure-store';
import {
  clearAuth,
  getToken,
  getUser,
  setToken,
  setUser,
} from './auth-storage';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

describe('auth-storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stores and reads the auth token', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('token-123');

    await setToken('token-123');

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'rent.auth.token',
      'token-123',
    );
    await expect(getToken()).resolves.toBe('token-123');
  });

  it('stores and parses the user payload', async () => {
    const user = { id: 'user-1', role: 'admin', email: 'admin@test.dev' };
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(
      JSON.stringify(user),
    );

    await setUser(user as any);

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'rent.auth.user',
      JSON.stringify(user),
    );
    await expect(getUser()).resolves.toEqual(user);
  });

  it('returns null when the stored user payload is invalid', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('{bad json');

    await expect(getUser()).resolves.toBeNull();
  });

  it('clears both token and user entries', async () => {
    await clearAuth();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('rent.auth.token');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('rent.auth.user');
  });
});
