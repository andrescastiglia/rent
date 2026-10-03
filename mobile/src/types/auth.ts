import type { ContactRecord } from '../../../shared/contact-data';
import type { LoginDto, RegisterDto } from '@/generated/openapi';
export interface User extends ContactRecord {
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

export type LoginRequest = LoginDto;
export type RegisterRequest = RegisterDto;

export interface RegisterResponse {
  pendingApproval: boolean;
  userId: string;
  message: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}
