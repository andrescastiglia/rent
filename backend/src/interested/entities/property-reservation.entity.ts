import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Property } from '../../properties/entities/property.entity';
import { InterestedProfile } from './interested-profile.entity';
import { User } from '../../users/entities/user.entity';

export enum PropertyReservationStatus {
  ACTIVE = 'active',
  RELEASED = 'released',
  CONVERTED = 'converted',
}

@Entity('property_reservations')
export class PropertyReservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'property_id' })
  propertyId: string;

  @ManyToOne(() => Property)
  @JoinColumn({ name: 'property_id' })
  property: Property;

  @Column({ name: 'interested_profile_id' })
  interestedProfileId: string;

  @ManyToOne(() => InterestedProfile)
  @JoinColumn({ name: 'interested_profile_id' })
  interestedProfile: InterestedProfile;

  @Column({
    type: 'enum',
    enum: PropertyReservationStatus,
    enumName: 'property_reservation_status',
    default: PropertyReservationStatus.ACTIVE,
  })
  status: PropertyReservationStatus;

  @Column({ name: 'activity_source', length: 30, default: 'activity' })
  activitySource: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'reserved_by_user_id', type: 'uuid', nullable: true })
  reservedByUserId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reserved_by_user_id' })
  reservedByUser: User | null;

  @Column({
    name: 'reserved_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  reservedAt: Date;

  @Column({ name: 'released_at', type: 'timestamptz', nullable: true })
  releasedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
