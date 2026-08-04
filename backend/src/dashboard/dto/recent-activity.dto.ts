import { InterestedActivityStatus } from '../../interested/entities/interested-activity.entity';
import { OwnerActivityStatus } from '../../owners/entities/owner-activity.entity';

export type PersonActivityStatus =
  InterestedActivityStatus | OwnerActivityStatus;

export class PersonActivityItemDto {
  id: string;
  sourceType: 'interested' | 'owner' | 'communication' | 'pending_action';
  personType: 'interested' | 'owner' | 'tenant' | 'buyer' | 'staff' | 'admin';
  personId: string;
  personName: string;
  subject: string;
  body: string | null;
  status: PersonActivityStatus;
  dueAt: Date | null;
  completedAt: Date | null;
  propertyId: string | null;
  propertyName: string | null;
  createdAt: Date;
  updatedAt: Date;
  actionKind?: 'communication' | 'pending_action' | 'registration';
  actionId?: string;
}

export class RecentActivityDto {
  new: PersonActivityItemDto[];
  overdue: PersonActivityItemDto[];
  today: PersonActivityItemDto[];
  total: number;
}
