"use client";

import React, {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useSyncExternalStore,
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

type AuthSnapshot = {
  user: User | null;
  token: string | null;
};

const EMPTY_AUTH_SNAPSHOT: AuthSnapshot = {
  user: null,
  token: null,
};

const authStoreListeners = new Set<() => void>();

let cachedAuthSnapshot = EMPTY_AUTH_SNAPSHOT;
let cachedAuthToken: string | null = null;
let cachedAuthUserJson: string | null = null;

function emitAuthStoreChange() {
  for (const listener of authStoreListeners) {
    listener();
  }
}

function subscribeToAuthStore(listener: () => void) {
  authStoreListeners.add(listener);

  const handleStorage = () => {
    listener();
  };

  globalThis.addEventListener("storage", handleStorage);

  return () => {
    authStoreListeners.delete(listener);
    globalThis.removeEventListener("storage", handleStorage);
  };
}

function getAuthSnapshot(): AuthSnapshot {
  const token = getToken();
  const user = getUser() as User | null;
  const userJson = user ? JSON.stringify(user) : null;

  if (cachedAuthToken === token && cachedAuthUserJson === userJson) {
    return cachedAuthSnapshot;
  }

  cachedAuthToken = token;
  cachedAuthUserJson = userJson;
  cachedAuthSnapshot = { user, token };

  return cachedAuthSnapshot;
}

function getServerAuthSnapshot(): AuthSnapshot {
  return EMPTY_AUTH_SNAPSHOT;
}

function subscribeToHydration() {
  return () => {};
}

function getHydratedSnapshot() {
  return true;
}

function getServerHydratedSnapshot() {
  return false;
}

export function AuthProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user, token } = useSyncExternalStore(
    subscribeToAuthStore,
    getAuthSnapshot,
    getServerAuthSnapshot,
  );
  const loading = !useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerHydratedSnapshot,
  );
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

  const login = useCallback(
    async (credentials: LoginRequest) => {
      const response = await apiClient.post<AuthResponse>(
        "/auth/login",
        credentials,
      );

      saveToken(response.accessToken);
      saveUser(response.user as unknown as Record<string, unknown>);
      emitAuthStoreChange();

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
    emitAuthStoreChange();
    const locale = getLocaleFromPath();
    router.push(`/${locale}/login`);
  }, [getLocaleFromPath, router]);

  const updateUser = useCallback((nextUser: User) => {
    saveUser(nextUser as unknown as Record<string, unknown>);
    emitAuthStoreChange();
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
