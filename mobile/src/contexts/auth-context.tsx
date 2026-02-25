import { useRouter } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { authApi } from '@/api/auth';
import { setSessionExpiredHandler } from '@/api/client';
import { clearAuth, getToken, getUser, setToken, setUser } from '@/storage/auth-storage';
import type { AuthResponse, LoginRequest, RegisterRequest, RegisterResponse, User } from '@/types/auth';
import { i18n } from '@/i18n';

type AuthContextValue = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (payload: LoginRequest) => Promise<void>;
  register: (payload: RegisterRequest) => Promise<RegisterResponse>;
  logout: () => Promise<void>;
  updateUser: (nextUser: User) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [user, setUserState] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([getToken(), getUser()]);
        if (!mounted) return;
        setTokenState(storedToken);
        setUserState(storedUser);
        if (storedUser?.language) {
          await i18n.changeLanguage(storedUser.language);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(
    async (payload: LoginRequest) => {
      const response: AuthResponse = await authApi.login(payload);
      await Promise.all([setToken(response.accessToken), setUser(response.user)]);
      setTokenState(response.accessToken);
      setUserState(response.user);
      if (response.user.language) {
        await i18n.changeLanguage(response.user.language);
      }
      router.replace('/(app)/(tabs)/dashboard');
    },
    [router],
  );

  const register = useCallback((payload: RegisterRequest) => authApi.register(payload), []);

  const logout = useCallback(async () => {
    await clearAuth();
    setTokenState(null);
    setUserState(null);
    router.replace('/(auth)/login');
  }, [router]);

  useEffect(() => {
    const unsubscribe = setSessionExpiredHandler(() => {
      void logout();
    });

    return unsubscribe;
  }, [logout]);

  const updateUser = useCallback(async (nextUser: User) => {
    await setUser(nextUser);
    setUserState(nextUser);
    if (nextUser.language) {
      await i18n.changeLanguage(nextUser.language);
    }
  }, []);

  const value = useMemo(
    () => ({ user, token, loading, login, register, logout, updateUser }),
    [user, token, loading, login, register, logout, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
