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

  @Column({ name: 'arca_enabled', default: false })
  arcaEnabled: boolean;

  @Column({ name: 'arca_cuit', nullable: true })
  arcaCuit: string;

  @Column({ name: 'arca_razon_social', nullable: true })
  arcaRazonSocial: string;

  @Column({ name: 'arca_condicion_iva', nullable: true })
  arcaCondicionIva: string;

  @Column({ name: 'arca_punto_venta', type: 'integer', nullable: true })
  arcaPuntoVenta: number;

  @Column({ name: 'arca_certificate_path', nullable: true })
  arcaCertificatePath: string;

  @Column({ name: 'arca_certificate_password_hash', nullable: true })
  arcaCertificatePasswordHash: string;

  @Column({
    name: 'arca_certificate_expires_at',
    type: 'timestamptz',
    nullable: true,
  })
  arcaCertificateExpiresAt: Date;

  @Column({ name: 'arca_production_mode', default: false })
  arcaProductionMode: boolean;

  @Column({ name: 'arca_last_sync_at', type: 'timestamptz', nullable: true })
  arcaLastSyncAt: Date;

  @Column({ name: 'withholding_agent_iibb', default: false })
  withholdingAgentIibb: boolean;

  @Column({ name: 'withholding_agent_ganancias', default: false })
  withholdingAgentGanancias: boolean;

  @Column({ name: 'withholding_rates', type: 'jsonb', default: {} })
  withholdingRates: Record<string, any>;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date;
}
