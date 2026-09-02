import { usersApi } from '@/api/users';
import { clearAuth, clearLegacyUser, getToken } from '@/storage/auth-storage';
import type { User } from '@/types/auth';
import { isTokenExpired } from '@/utils/jwt';

export type RestoredSession = {
  token: string;
  user: User;
};

export async function restoreSession(): Promise<RestoredSession | null> {
  await clearLegacyUser();
  const token = await getToken();
  if (!token || isTokenExpired(token)) {
    await clearAuth();
    return null;
  }

  try {
    const user = await usersApi.getProfile();
    return { token, user };
  } catch {
    await clearAuth();
    return null;
  }
}
