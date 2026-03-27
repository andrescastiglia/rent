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

export interface CreateBuyerInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dni?: string;
  interestedProfileId?: string;
  notes?: string;
}

export type UpdateBuyerInput = Partial<CreateBuyerInput>;
