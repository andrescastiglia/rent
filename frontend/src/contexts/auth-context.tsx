'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { apiClient } from '@/lib/api';
import { getToken, setToken, getUser, setUser, clearAuth } from '@/lib/auth';
import type { User, LoginRequest, RegisterRequest, AuthResponse } from '@/types/auth';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Extraer el locale del pathname actual
  const getLocaleFromPath = () => {
    const segments = pathname.split('/');
    const locale = segments[1];
    if (['es', 'pt', 'en'].includes(locale)) {
      return locale;
    }
    return 'es'; // fallback
  };

  useEffect(() => {
    // Load user and token from localStorage on mount
    const storedToken = getToken();
    const storedUser = getUser();

    if (storedToken && storedUser) {
      setTokenState(storedToken);
      setUserState(storedUser);
    }

    setLoading(false);
  }, []);

  const login = async (credentials: LoginRequest) => {
    try {
      const response = await apiClient.post<AuthResponse>('/auth/login', credentials);
      
      setToken(response.accessToken);
      setUser(response.user);
      setTokenState(response.accessToken);
      setUserState(response.user);

      const locale = getLocaleFromPath();
      router.push(`/${locale}/dashboard`);
    } catch (error) {
      throw error;
    }
  };

  const register = async (data: RegisterRequest) => {
    try {
      const response = await apiClient.post<AuthResponse>('/auth/register', data);
      
      setToken(response.accessToken);
      setUser(response.user);
      setTokenState(response.accessToken);
      setUserState(response.user);

      const locale = getLocaleFromPath();
      router.push(`/${locale}/dashboard`);
    } catch (error) {
      throw error;
    }
  };

  const logout = () => {
    clearAuth();
    setTokenState(null);
    setUserState(null);
    const locale = getLocaleFromPath();
    router.push(`/${locale}/login`);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
