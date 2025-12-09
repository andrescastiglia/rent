import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

export enum PlanType {
  FREE = 'free',
  BASIC = 'basic',
  PREMIUM = 'premium',
  ENTERPRISE = 'enterprise',
}

@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ name: 'legal_name', nullable: true })
  legalName: string;

  @Column({ name: 'tax_id', nullable: true })
  taxId: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ type: 'text', nullable: true })
  address: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  state: string;

  @Column({ default: 'Argentina' })
  country: string;

  @Column({ name: 'postal_code', nullable: true })
  postalCode: string;

  @Column({ name: 'logo_url', nullable: true })
  logoUrl: string;

  @Column({ nullable: true })
  website: string;

  @Column({
    name: 'plan',
    type: 'enum',
    enum: PlanType,
    enumName: 'plan_type',
    default: PlanType.FREE,
  })
  plan: PlanType;

  @Column({ name: 'plan_expires_at', type: 'timestamptz', nullable: true })
  planExpiresAt: Date;

  @Column({ name: 'max_properties', default: 5 })
  maxProperties: number;

  @Column({ name: 'max_users', default: 3 })
  maxUsers: number;

  @Column({ type: 'jsonb', default: {} })
  settings: Record<string, any>;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date;
}
