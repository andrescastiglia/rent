import { Property } from './property';

export type InterestedOperation = 'rent' | 'sale';
export type InterestedPropertyType = 'apartment' | 'house';
export type InterestedStatus =
  | 'new'
  | 'qualified'
  | 'matching'
  | 'visit_scheduled'
  | 'offer_made'
  | 'won'
  | 'lost';
export type InterestedQualificationLevel = 'mql' | 'sql' | 'rejected';

export type InterestedActivityType =
  | 'call'
  | 'task'
  | 'note'
  | 'email'
  | 'whatsapp'
  | 'visit';

export type InterestedActivityStatus = 'pending' | 'completed' | 'cancelled';

export type InterestedMatchStatus =
  | 'suggested'
  | 'contacted'
  | 'visit_scheduled'
  | 'accepted'
  | 'rejected'
  | 'expired';

export interface InterestedProfile {
  id: string;
  firstName?: string;
  lastName?: string;
  phone: string;
  email?: string;
  peopleCount?: number;
  maxAmount?: number;
  hasPets?: boolean;
  whiteIncome?: boolean;
  guaranteeTypes?: string[];
  preferredZones?: string[];
  propertyTypePreference?: InterestedPropertyType;
  operation?: InterestedOperation;
  status?: InterestedStatus;
  qualificationLevel?: InterestedQualificationLevel;
  qualificationNotes?: string;
  source?: string;
  assignedToUserId?: string;
  organizationName?: string;
  customFields?: Record<string, unknown>;
  lastContactAt?: string;
  nextContactAt?: string;
  lostReason?: string;
  consentContact?: boolean;
  consentRecordedAt?: string;
  convertedToTenantId?: string;
  convertedToSaleAgreementId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInterestedProfileInput {
  firstName?: string;
  lastName?: string;
  phone: string;
  email?: string;
  peopleCount?: number;
  maxAmount?: number;
  hasPets?: boolean;
  whiteIncome?: boolean;
  guaranteeTypes?: string[];
  preferredZones?: string[];
  propertyTypePreference?: InterestedPropertyType;
  operation?: InterestedOperation;
  status?: InterestedStatus;
  qualificationLevel?: InterestedQualificationLevel;
  qualificationNotes?: string;
  source?: string;
  assignedToUserId?: string;
  organizationName?: string;
  customFields?: Record<string, unknown>;
  consentContact?: boolean;
  consentRecordedAt?: Date;
  lastContactAt?: Date;
  nextContactAt?: Date;
  lostReason?: string;
  notes?: string;
}

export interface UpdateInterestedProfileInput extends Partial<CreateInterestedProfileInput> {}

export interface InterestedFilters {
  name?: string;
  phone?: string;
  operation?: InterestedOperation;
  propertyTypePreference?: InterestedPropertyType;
  status?: InterestedStatus;
  qualificationLevel?: InterestedQualificationLevel;
  page?: number;
  limit?: number;
}

export interface InterestedStageHistory {
  id: string;
  fromStatus: InterestedStatus;
  toStatus: InterestedStatus;
  reason?: string;
  changedAt: string;
  changedByUserId?: string;
}

export interface InterestedActivity {
  id: string;
  interestedProfileId: string;
  type: InterestedActivityType;
  status: InterestedActivityStatus;
  subject: string;
  body?: string;
  dueAt?: string;
  completedAt?: string;
  templateName?: string;
  metadata?: Record<string, unknown>;
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InterestedMatch {
  id: string;
  interestedProfileId: string;
  propertyId: string;
  status: InterestedMatchStatus;
  score?: number;
  matchReasons?: string[];
  contactedAt?: string;
  notes?: string;
  property?: Property;
  createdAt: string;
  updatedAt: string;
}

export interface InterestedTimelineItem {
  id: string;
  type: 'stage' | 'activity' | 'match' | 'visit';
  at: string;
  title: string;
  detail?: string;
  metadata?: Record<string, unknown>;
}

export interface InterestedSummary {
  profile: InterestedProfile;
  stageHistory: InterestedStageHistory[];
  activities: InterestedActivity[];
  matches: InterestedMatch[];
  visits: Array<{
    id: string;
    propertyId: string;
    visitedAt: string;
    interestedName?: string;
    comments?: string;
    hasOffer?: boolean;
    offerAmount?: number;
    offerCurrency?: string;
    property?: Property;
  }>;
}

export interface InterestedMetrics {
  byStage: Record<string, number>;
  totalLeads: number;
  conversionRate: number;
  avgHoursToClose: number;
  activityByAgent: Array<{
    userId: string;
    activityCount: number;
    wonCount: number;
  }>;
}

export interface InterestedDuplicate {
  phone: string;
  email?: string;
  count: number;
  profileIds: string[];
}
