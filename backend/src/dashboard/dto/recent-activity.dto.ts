import { InterestedActivityStatus } from '../../interested/entities/interested-activity.entity';
import { OwnerActivityStatus } from '../../owners/entities/owner-activity.entity';

export type PersonActivityStatus =
  | InterestedActivityStatus
  | OwnerActivityStatus;

export class PersonActivityItemDto {
  id: string;
  sourceType: 'interested' | 'owner';
  personType: 'interested' | 'owner';
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
}

export class RecentActivityDto {
  overdue: PersonActivityItemDto[];
  today: PersonActivityItemDto[];
  total: number;
}
