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
import {
  getToken,
  setToken as saveToken,
  getUser,
  setUser as saveUser,
  clearAuth,
} from "@/lib/auth";
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

export function AuthProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [user, setUser] = useState<User | null>(() => getUser() as User | null);
  const [token, setToken] = useState<string | null>(() => getToken());
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
      setToken(getToken());
      setUser(getUser() as User | null);
    };

    globalThis.addEventListener("storage", handleStorage);
    return () => globalThis.removeEventListener("storage", handleStorage);
  }, []);

  const login = useCallback(
    async (credentials: LoginRequest) => {
      const response = await apiClient.post<AuthResponse>(
        "/auth/login",
        credentials,
      );

      saveToken(response.accessToken);
      saveUser(response.user as unknown as Record<string, unknown>);
      setToken(response.accessToken);
      setUser(response.user);

      const locale = getLocaleFromPath();
      router.push(`/${locale}/dashboard`);
    },
    [getLocaleFromPath, router],
  );

  const register = useCallback(async (data: RegisterRequest) => {
    const response = await apiClient.post<RegisterResponse>(
      "/auth/register",
      data,
    );
    return response;
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setToken(null);
    setUser(null);
    const locale = getLocaleFromPath();
    router.push(`/${locale}/login`);
  }, [getLocaleFromPath, router]);

  const updateUser = useCallback((nextUser: User) => {
    saveUser(nextUser as unknown as Record<string, unknown>);
    setUser(nextUser);
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
