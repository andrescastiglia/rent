export type StaffSpecialization =
  | "maintenance"
  | "cleaning"
  | "security"
  | "administration"
  | "accounting"
  | "legal"
  | "other";

export interface Staff {
  id: string;
  userId: string;
  companyId: string;
  specialization: StaffSpecialization;
  hourlyRate?: number;
  currency: string;
  serviceAreas?: string[];
  certifications?: string[];
  notes?: string;
  rating?: number;
  totalJobs: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  user: {
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    isActive?: boolean;
  };
}

export interface CreateStaffInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  specialization: StaffSpecialization;
  hourlyRate?: number;
  currency?: string;
  serviceAreas?: string[];
  certifications?: string[];
  notes?: string;
}

export type UpdateStaffInput = Partial<CreateStaffInput>;
