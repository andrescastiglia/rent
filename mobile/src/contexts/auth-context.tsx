import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { authApi } from '@/api/auth';
import { setSessionExpiredHandler } from '@/api/client';
import {
  clearAuth,
  getToken,
  getUser,
  setToken as persistToken,
  setUser as persistUser,
} from '@/storage/auth-storage';
import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  RegisterResponse,
  User,
} from '@/types/auth';
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

export function AuthProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([
          getToken(),
          getUser(),
        ]);
        if (!mounted) return;
        setToken(storedToken);
        setUser(storedUser);
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
      await Promise.all([
        persistToken(response.accessToken),
        persistUser(response.user),
      ]);
      setToken(response.accessToken);
      setUser(response.user);
      if (response.user.language) {
        await i18n.changeLanguage(response.user.language);
      }
      router.replace('/(app)/(tabs)/dashboard');
    },
    [router],
  );

  const register = useCallback(
    (payload: RegisterRequest) => authApi.register(payload),
    [],
  );

  const logout = useCallback(async () => {
    await Promise.all([clearAuth(), queryClient.cancelQueries()]);
    queryClient.clear();
    setToken(null);
    setUser(null);
    router.replace('/(auth)/login');
  }, [queryClient, router]);

  useEffect(() => {
    const unsubscribe = setSessionExpiredHandler(() => {
      logout().catch(() => undefined);
    });

    return unsubscribe;
  }, [logout]);

  const updateUser = useCallback(async (nextUser: User) => {
    await persistUser(nextUser);
    setUser(nextUser);
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
