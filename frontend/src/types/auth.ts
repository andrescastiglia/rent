export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  avatarUrl?: string | null;
  language?: "es" | "en" | "pt";
  role: "admin" | "owner" | "tenant" | "staff";
  isActive?: boolean;
  companyId?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role?: "owner" | "tenant";
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
