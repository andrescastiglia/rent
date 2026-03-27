export interface Buyer {
  id: string;
  userId?: string;
  companyId?: string;
  interestedProfileId?: string | null;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  dni?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}
