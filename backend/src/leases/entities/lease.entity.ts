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
import { Unit } from '../../properties/entities/unit.entity';
import { User } from '../../users/entities/user.entity';
import { LeaseAmendment } from './lease-amendment.entity';
import { Currency } from '../../currencies/entities/currency.entity';

export enum PaymentFrequency {
  MONTHLY = 'monthly',
  BIWEEKLY = 'biweekly',
  WEEKLY = 'weekly',
}

export enum LeaseStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  EXPIRED = 'expired',
  TERMINATED = 'terminated',
  RENEWED = 'renewed',
}

/**
 * Tipo de mora: tasa diaria (%) o monto fijo.
 */
export enum LateFeeType {
  DAILY_RATE = 'daily_rate',
  FIXED_AMOUNT = 'fixed_amount',
}

/**
 * Frecuencia de facturación.
 */
export enum BillingFrequency {
  ADVANCE = 'advance',
  WEEKLY = 'weekly',
  BIWEEKLY = 'biweekly',
  MONTHLY = 'monthly',
  BIMONTHLY = 'bimonthly',
}

/**
 * Tipo de ajuste por inflación.
 */
export enum AdjustmentType {
  ICL = 'icl',
  IGPM = 'igpm',
  FIXED = 'fixed',
  NONE = 'none',
}

/**
 * Tipo de cláusula de aumento.
 */
export enum IncreaseClauseType {
  PERCENTAGE = 'percentage',
  FIXED_AMOUNT = 'fixed_amount',
  INDEX_BASED = 'index_based',
}

@Entity('leases')
export class Lease {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'unit_id' })
  unitId: string;

  @ManyToOne(() => Unit)
  @JoinColumn({ name: 'unit_id' })
  unit: Unit;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'tenant_id' })
  tenant: User;

  @Column({ name: 'start_date', type: 'date' })
  startDate: Date;

  @Column({ name: 'end_date', type: 'date' })
  endDate: Date;

  @Column({ name: 'rent_amount', type: 'decimal', precision: 10, scale: 2 })
  rentAmount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  deposit: number;

  @Column({ name: 'currency_code', default: 'ARS' })
  currencyCode: string;

  @ManyToOne(() => Currency)
  @JoinColumn({ name: 'currency_code', referencedColumnName: 'code' })
  currency: Currency;

  @Column({
    name: 'payment_frequency',
    type: 'enum',
    enum: PaymentFrequency,
    default: PaymentFrequency.MONTHLY,
  })
  paymentFrequency: PaymentFrequency;

  @Column({ type: 'enum', enum: LeaseStatus, default: LeaseStatus.DRAFT })
  status: LeaseStatus;

  @Column({ name: 'renewal_terms', type: 'text', nullable: true })
  renewalTerms: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  // Billing configuration fields

  @Column({
    name: 'late_fee_type',
    type: 'enum',
    enum: LateFeeType,
    nullable: true,
  })
  lateFeeType: LateFeeType;

  @Column({
    name: 'late_fee_value',
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
  })
  lateFeeValue: number;

  @Column({
    name: 'commission_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  commissionRate: number;

  @Column({
    name: 'billing_frequency',
    type: 'enum',
    enum: BillingFrequency,
    default: BillingFrequency.MONTHLY,
  })
  billingFrequency: BillingFrequency;

  @Column({ name: 'billing_day', type: 'integer', default: 1 })
  billingDay: number;

  // Adjustment configuration fields

  @Column({
    name: 'adjustment_type',
    type: 'enum',
    enum: AdjustmentType,
    default: AdjustmentType.NONE,
  })
  adjustmentType: AdjustmentType;

  @Column({
    name: 'adjustment_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  adjustmentRate: number;

  @Column({ name: 'next_adjustment_date', type: 'date', nullable: true })
  nextAdjustmentDate: Date;

  @Column({ name: 'last_adjustment_date', type: 'date', nullable: true })
  lastAdjustmentDate: Date;

  @Column({
    name: 'last_adjustment_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  lastAdjustmentRate: number;

  // Increase clause configuration

  @Column({
    name: 'increase_clause_type',
    type: 'enum',
    enum: IncreaseClauseType,
    nullable: true,
  })
  increaseClauseType: IncreaseClauseType;

  @Column({
    name: 'increase_clause_value',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  increaseClauseValue: number;

  @Column({
    name: 'increase_clause_frequency_months',
    type: 'integer',
    default: 12,
  })
  increaseClauseFrequencyMonths: number;

  @OneToMany(() => LeaseAmendment, (amendment) => amendment.lease)
  amendments: LeaseAmendment[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date;
}
