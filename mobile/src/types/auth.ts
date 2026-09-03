export interface User {
  id: string;
  email: string | null;
  firstName: string;
  lastName: string;
  phone?: string | null;
  avatarUrl?: string | null;
  language?: 'es' | 'en' | 'pt';
  role: 'admin' | 'owner' | 'tenant' | 'staff' | 'buyer';
  roles?: Array<'admin' | 'owner' | 'tenant' | 'staff' | 'buyer'>;
  isActive?: boolean;
  accessRequested?: boolean;
  companyId?: string;
  permissions?: Record<string, boolean>;
}

export interface LoginRequest {
  email: string;
  password: string;
  captchaToken?: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role?: 'owner' | 'tenant';
  captchaToken?: string;
}

export interface RegisterResponse {
  pendingApproval: boolean;
  userId: string;
  message: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}
