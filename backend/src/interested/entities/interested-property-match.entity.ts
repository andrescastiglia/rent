import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Property } from '../../properties/entities/property.entity';
import { InterestedProfile } from './interested-profile.entity';
import { User } from '../../users/entities/user.entity';

export enum InterestedMatchStatus {
  SUGGESTED = 'suggested',
  CONTACTED = 'contacted',
  VISIT_SCHEDULED = 'visit_scheduled',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}

@Entity('interested_property_matches')
export class InterestedPropertyMatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'interested_profile_id' })
  interestedProfileId: string;

  @ManyToOne(() => InterestedProfile)
  @JoinColumn({ name: 'interested_profile_id' })
  interestedProfile: InterestedProfile;

  @Column({ name: 'property_id' })
  propertyId: string;

  @ManyToOne(() => Property)
  @JoinColumn({ name: 'property_id' })
  property: Property;

  @Column({
    type: 'enum',
    enum: InterestedMatchStatus,
    enumName: 'interested_match_status',
  })
  status: InterestedMatchStatus;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  score: number;

  @Column({ name: 'match_reasons', type: 'text', array: true, nullable: true })
  matchReasons: string[];

  @Column({ name: 'first_matched_at', type: 'timestamptz' })
  firstMatchedAt: Date;

  @Column({ name: 'last_matched_at', type: 'timestamptz' })
  lastMatchedAt: Date;

  @Column({ name: 'contacted_at', type: 'timestamptz', nullable: true })
  contactedAt: Date;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ name: 'created_by_user_id', nullable: true })
  createdByUserId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date;
}
