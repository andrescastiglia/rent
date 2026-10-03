import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'rent.auth.token';
const USER_KEY = 'rent.auth.user';

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearLegacyUser(): Promise<void> {
  await SecureStore.deleteItemAsync(USER_KEY);
}

export async function clearAuth(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY),
    SecureStore.deleteItemAsync(USER_KEY),
  ]);
}

// The user grants background location before enabling this device-only access.
export async function setTokenBackgroundAccess(
  enabled: boolean,
): Promise<void> {
  const token = await getToken();
  if (token)
    await SecureStore.setItemAsync(TOKEN_KEY, token, {
      keychainAccessible: enabled
        ? SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
        : SecureStore.WHEN_UNLOCKED,
    });
}
