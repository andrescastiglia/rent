"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { apiClient } from "@/lib/api";
import { getToken, setToken, getUser, setUser, clearAuth } from "@/lib/auth";
import type {
  User,
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  RegisterResponse,
} from "@/types/auth";

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<RegisterResponse>;
  logout: () => void;
  updateUser: (nextUser: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(
    () => getUser() as User | null,
  );
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [loading] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Extraer el locale del pathname actual
  const getLocaleFromPath = useCallback(() => {
    const segments = pathname.split("/");
    const locale = segments[1];
    if (["es", "pt", "en"].includes(locale)) {
      return locale;
    }
    return "es"; // fallback
  }, [pathname]);

  useEffect(() => {
    // Keep state in sync if auth is updated elsewhere (e.g. login/logout in another tab).
    const handleStorage = () => {
      setTokenState(getToken());
      setUserState(getUser() as User | null);
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const login = useCallback(
    async (credentials: LoginRequest) => {
      try {
        const response = await apiClient.post<AuthResponse>(
          "/auth/login",
          credentials,
        );

        setToken(response.accessToken);
        setUser(response.user as unknown as Record<string, unknown>);
        setTokenState(response.accessToken);
        setUserState(response.user);

        const locale = getLocaleFromPath();
        router.push(`/${locale}/dashboard`);
      } catch (thrownError) {
        throw thrownError;
      }
    },
    [getLocaleFromPath, router],
  );

  const register = useCallback(async (data: RegisterRequest) => {
    try {
      const response = await apiClient.post<RegisterResponse>(
        "/auth/register",
        data,
      );
      return response;
    } catch (thrownError) {
      throw thrownError;
    }
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setTokenState(null);
    setUserState(null);
    const locale = getLocaleFromPath();
    router.push(`/${locale}/login`);
  }, [getLocaleFromPath, router]);

  const updateUser = useCallback((nextUser: User) => {
    setUser(nextUser as unknown as Record<string, unknown>);
    setUserState(nextUser);
  }, []);

  const contextValue = useMemo(
    () => ({ user, token, loading, login, register, logout, updateUser }),
    [user, token, loading, login, register, logout, updateUser],
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
