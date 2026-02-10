import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { User } from '../../users/entities/user.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { SaleAgreement } from '../../sales/entities/sale-agreement.entity';
import { InterestedActivity } from './interested-activity.entity';
import { InterestedStageHistory } from './interested-stage-history.entity';
import { InterestedPropertyMatch } from './interested-property-match.entity';

export enum InterestedOperation {
  RENT = 'rent',
  SALE = 'sale',
}

export enum InterestedPropertyType {
  APARTMENT = 'apartment',
  HOUSE = 'house',
  COMMERCIAL = 'commercial',
  OFFICE = 'office',
  WAREHOUSE = 'warehouse',
  LAND = 'land',
  PARKING = 'parking',
  OTHER = 'other',
}

export enum InterestedStatus {
  INTERESTED = 'interested',
  TENANT = 'tenant',
  BUYER = 'buyer',
}

export enum InterestedQualificationLevel {
  MQL = 'mql',
  SQL = 'sql',
  REJECTED = 'rejected',
}

@Entity('interested_profiles')
export class InterestedProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'first_name', nullable: true })
  firstName: string;

  @Column({ name: 'last_name', nullable: true })
  lastName: string;

  @Column()
  phone: string;

  @Column({ nullable: true })
  email: string;

  @Column({ name: 'people_count', type: 'int', nullable: true })
  peopleCount: number;

  @Column({
    name: 'min_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  minAmount: number;

  @Column({
    name: 'max_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  maxAmount: number;

  @Column({ name: 'has_pets', default: false })
  hasPets: boolean;

  @Column({
    name: 'guarantee_types',
    type: 'text',
    array: true,
    nullable: true,
  })
  guaranteeTypes: string[];

  @Column({
    name: 'preferred_zones',
    type: 'text',
    array: true,
    nullable: true,
  })
  preferredZones: string[];

  @Column({ name: 'preferred_city', nullable: true })
  preferredCity: string;

  @Column({
    name: 'desired_features',
    type: 'text',
    array: true,
    nullable: true,
  })
  desiredFeatures: string[];

  @Column({
    name: 'property_type_preference',
    type: 'enum',
    enum: InterestedPropertyType,
    enumName: 'interested_property_type',
    nullable: true,
  })
  propertyTypePreference: InterestedPropertyType;

  @Column({
    type: 'enum',
    enum: InterestedOperation,
    enumName: 'interested_operation',
    default: InterestedOperation.RENT,
  })
  operation: InterestedOperation;

  @Column({
    type: 'enum',
    enum: InterestedOperation,
    enumName: 'interested_operation',
    array: true,
    default: () => "ARRAY['rent']::interested_operation[]",
  })
  operations: InterestedOperation[];

  @Column({
    type: 'enum',
    enum: InterestedStatus,
    enumName: 'interested_status',
    default: InterestedStatus.INTERESTED,
  })
  status: InterestedStatus;

  @Column({
    name: 'qualification_level',
    type: 'enum',
    enum: InterestedQualificationLevel,
    enumName: 'interested_qualification_level',
    nullable: true,
  })
  qualificationLevel: InterestedQualificationLevel;

  @Column({ name: 'qualification_notes', type: 'text', nullable: true })
  qualificationNotes: string;

  @Column({ nullable: true })
  source: string;

  @Column({ name: 'assigned_to_user_id', nullable: true })
  assignedToUserId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assigned_to_user_id' })
  assignedToUser: User;

  @Column({ name: 'organization_name', nullable: true })
  organizationName: string;

  @Column({ name: 'custom_fields', type: 'jsonb', default: () => "'{}'" })
  customFields: Record<string, unknown>;

  @Column({ name: 'last_contact_at', type: 'timestamptz', nullable: true })
  lastContactAt: Date;

  @Column({ name: 'next_contact_at', type: 'timestamptz', nullable: true })
  nextContactAt: Date;

  @Column({ name: 'lost_reason', type: 'text', nullable: true })
  lostReason: string;

  @Column({ name: 'consent_contact', default: false })
  consentContact: boolean;

  @Column({ name: 'consent_recorded_at', type: 'timestamptz', nullable: true })
  consentRecordedAt: Date;

  @Column({ name: 'converted_to_tenant_id', nullable: true })
  convertedToTenantId: string;

  @ManyToOne(() => Tenant, { nullable: true })
  @JoinColumn({ name: 'converted_to_tenant_id' })
  convertedToTenant: Tenant;

  @Column({ name: 'converted_to_sale_agreement_id', nullable: true })
  convertedToSaleAgreementId: string;

  @ManyToOne(() => SaleAgreement, { nullable: true })
  @JoinColumn({ name: 'converted_to_sale_agreement_id' })
  convertedToSaleAgreement: SaleAgreement;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @OneToMany(() => InterestedActivity, (activity) => activity.interestedProfile)
  activities: InterestedActivity[];

  @OneToMany(
    () => InterestedStageHistory,
    (history) => history.interestedProfile,
  )
  stageHistory: InterestedStageHistory[];

  @OneToMany(() => InterestedPropertyMatch, (match) => match.interestedProfile)
  propertyMatches: InterestedPropertyMatch[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date;
}
