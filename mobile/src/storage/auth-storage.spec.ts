import * as SecureStore from 'expo-secure-store';
import { clearLegacyUser, clearAuth, getToken, setToken } from './auth-storage';

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

  it('keeps profiles out of durable storage and removes legacy data', async () => {
    await clearLegacyUser();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('rent.auth.user');
  });

  it('clears both token and user entries', async () => {
    await clearAuth();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('rent.auth.token');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('rent.auth.user');
  });
});
