import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Property } from '../../properties/entities/property.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Owner } from '../../owners/entities/owner.entity';
import { Company } from '../../companies/entities/company.entity';
import { LeaseAmendment } from './lease-amendment.entity';
import { Currency } from '../../currencies/entities/currency.entity';
import { InterestedProfile } from '../../interested/entities/interested-profile.entity';
import { LeaseContractTemplate } from './lease-contract-template.entity';

export enum PaymentFrequency {
  MONTHLY = 'monthly',
  BIMONTHLY = 'bimonthly',
  QUARTERLY = 'quarterly',
  SEMIANNUAL = 'semiannual',
  ANNUAL = 'annual',
}

export enum LeaseStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  FINALIZED = 'finalized',
}

export enum ContractType {
  RENTAL = 'rental',
  SALE = 'sale',
}

/**
 * Tipo de mora: tasa diaria (%) o monto fijo.
 */
export enum LateFeeType {
  NONE = 'none',
  FIXED = 'fixed',
  PERCENTAGE = 'percentage',
  DAILY_FIXED = 'daily_fixed',
  DAILY_PERCENTAGE = 'daily_percentage',
}

/**
 * Frecuencia de facturación.
 */
export enum BillingFrequency {
  FIRST_OF_MONTH = 'first_of_month',
  LAST_OF_MONTH = 'last_of_month',
  CONTRACT_DATE = 'contract_date',
  CUSTOM = 'custom',
}

/**
 * Tipo de ajuste por inflación.
 */
export enum AdjustmentType {
  FIXED = 'fixed',
  PERCENTAGE = 'percentage',
  INFLATION_INDEX = 'inflation_index',
}

/**
 * Tipo de cláusula de aumento.
 */
export enum IncreaseClauseType {
  NONE = 'none',
  ANNUAL_FIXED = 'annual_fixed',
  ANNUAL_PERCENTAGE = 'annual_percentage',
  INFLATION_LINKED = 'inflation_linked',
  CUSTOM_SCHEDULE = 'custom_schedule',
}

/**
 * Tipo de índice de inflación.
 */
export enum InflationIndexType {
  ICL = 'icl',
  IPC = 'ipc',
  IGP_M = 'igp_m',
}

@Entity('leases')
export class Lease {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'property_id', type: 'uuid', nullable: true })
  propertyId: string | null;

  @ManyToOne(() => Property, { nullable: true })
  @JoinColumn({ name: 'property_id' })
  property: Property | null;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @ManyToOne(() => Tenant, { nullable: true })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant | null;

  @Column({ name: 'buyer_profile_id', type: 'uuid', nullable: true })
  buyerProfileId: string | null;

  @ManyToOne(() => InterestedProfile, { nullable: true })
  @JoinColumn({ name: 'buyer_profile_id' })
  buyerProfile: InterestedProfile | null;

  @Column({ name: 'owner_id' })
  ownerId: string;

  @ManyToOne(() => Owner)
  @JoinColumn({ name: 'owner_id' })
  owner: Owner;

  @Column({ name: 'lease_number', type: 'varchar', length: 50, nullable: true })
  leaseNumber: string;

  @Column({
    name: 'contract_type',
    type: 'enum',
    enum: ContractType,
    enumName: 'contract_type',
    default: ContractType.RENTAL,
  })
  contractType: ContractType;

  @Column({ type: 'enum', enum: LeaseStatus, default: LeaseStatus.DRAFT })
  status: LeaseStatus;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate: Date | null;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: Date | null;

  @Column({
    name: 'monthly_rent',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  monthlyRent: number | null;

  @Column({ type: 'varchar', length: 3, default: 'ARS' })
  currency: string;

  @ManyToOne(() => Currency)
  @JoinColumn({ name: 'currency', referencedColumnName: 'code' })
  currencyRef: Currency;

  @Column({
    name: 'payment_frequency',
    type: 'enum',
    enum: PaymentFrequency,
    default: PaymentFrequency.MONTHLY,
  })
  paymentFrequency: PaymentFrequency;

  @Column({ name: 'payment_due_day', type: 'integer', default: 10 })
  paymentDueDay: number;

  @Column({
    name: 'billing_frequency',
    type: 'enum',
    enum: BillingFrequency,
    default: BillingFrequency.FIRST_OF_MONTH,
  })
  billingFrequency: BillingFrequency;

  @Column({ name: 'billing_day', type: 'integer', nullable: true })
  billingDay: number;

  @Column({ name: 'next_billing_date', type: 'date', nullable: true })
  nextBillingDate: Date;

  @Column({ name: 'last_billing_date', type: 'date', nullable: true })
  lastBillingDate: Date;

  @Column({
    name: 'late_fee_type',
    type: 'enum',
    enum: LateFeeType,
    default: LateFeeType.NONE,
  })
  lateFeeType: LateFeeType;

  @Column({
    name: 'late_fee_value',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  lateFeeValue: number;

  @Column({ name: 'late_fee_grace_days', type: 'integer', default: 0 })
  lateFeeGraceDays: number;

  @Column({
    name: 'late_fee_max',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  lateFeeMax: number;

  @Column({ name: 'auto_generate_invoices', type: 'boolean', default: true })
  autoGenerateInvoices: boolean;

  @Column({
    name: 'adjustment_type',
    type: 'enum',
    enum: AdjustmentType,
    default: AdjustmentType.FIXED,
  })
  adjustmentType: AdjustmentType;

  @Column({
    name: 'adjustment_value',
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
  })
  adjustmentValue: number;

  @Column({ name: 'adjustment_frequency_months', type: 'integer', default: 12 })
  adjustmentFrequencyMonths: number;

  @Column({ name: 'last_adjustment_date', type: 'date', nullable: true })
  lastAdjustmentDate: Date;

  @Column({ name: 'next_adjustment_date', type: 'date', nullable: true })
  nextAdjustmentDate: Date;

  @Column({
    name: 'increase_clause_type',
    type: 'enum',
    enum: IncreaseClauseType,
    default: IncreaseClauseType.NONE,
  })
  increaseClauseType: IncreaseClauseType;

  @Column({
    name: 'increase_clause_value',
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
  })
  increaseClauseValue: number;

  @Column({
    name: 'increase_clause_schedule',
    type: 'jsonb',
    default: '[]',
  })
  increaseClauseSchedule: object;

  @Column({
    name: 'inflation_index_type',
    type: 'enum',
    enum: InflationIndexType,
    nullable: true,
  })
  inflationIndexType: InflationIndexType;

  @Column({
    name: 'security_deposit',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  securityDeposit: number;

  @Column({
    name: 'fiscal_value',
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  fiscalValue: number | null;

  @Column({
    name: 'deposit_currency',
    type: 'varchar',
    length: 3,
    default: 'ARS',
  })
  depositCurrency: string;

  @Column({ name: 'expenses_included', type: 'boolean', default: false })
  expensesIncluded: boolean;

  @Column({
    name: 'additional_expenses',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  additionalExpenses: number;

  @Column({ name: 'terms_and_conditions', type: 'text', nullable: true })
  termsAndConditions: string;

  @Column({ name: 'special_clauses', type: 'text', nullable: true })
  specialClauses: string;

  @Column({ name: 'contract_pdf_url', type: 'text', nullable: true })
  contractPdfUrl: string | null;

  @Column({ name: 'template_id', type: 'uuid', nullable: true })
  templateId: string | null;

  @ManyToOne(() => LeaseContractTemplate, { nullable: true })
  @JoinColumn({ name: 'template_id' })
  template: LeaseContractTemplate | null;

  @Column({
    name: 'template_name',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  templateName: string | null;

  @Column({ name: 'draft_contract_text', type: 'text', nullable: true })
  draftContractText: string | null;

  @Column({ name: 'confirmed_contract_text', type: 'text', nullable: true })
  confirmedContractText: string | null;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt: Date | null;

  @Column({ name: 'previous_lease_id', type: 'uuid', nullable: true })
  previousLeaseId: string | null;

  @ManyToOne(() => Lease, { nullable: true })
  @JoinColumn({ name: 'previous_lease_id' })
  previousLease: Lease | null;

  @Column({ name: 'version_number', type: 'integer', default: 1 })
  versionNumber: number;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ name: 'signed_at', type: 'timestamptz', nullable: true })
  signedAt: Date;

  @Column({ name: 'signed_by_tenant', type: 'boolean', default: false })
  signedByTenant: boolean;

  @Column({ name: 'signed_by_owner', type: 'boolean', default: false })
  signedByOwner: boolean;

  @OneToMany(() => LeaseAmendment, (amendment) => amendment.lease)
  amendments: LeaseAmendment[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date;
}
