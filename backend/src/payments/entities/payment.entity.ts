import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { TenantAccount } from './tenant-account.entity';
import { Currency } from '../../currencies/entities/currency.entity';
import { Receipt } from './receipt.entity';
import { PaymentItem } from './payment-item.entity';
import { Company } from '../../companies/entities/company.entity';
import { Invoice } from './invoice.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';

/**
 * Métodos de pago disponibles.
 */
export enum PaymentMethod {
  CASH = 'cash',
  BANK_TRANSFER = 'bank_transfer',
  CREDIT_CARD = 'credit_card',
  DEBIT_CARD = 'debit_card',
  CHECK = 'check',
  DIGITAL_WALLET = 'digital_wallet',
  CRYPTO = 'crypto',
  OTHER = 'other',
}

/**
 * Estados del pago.
 */
export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled',
}

/**
 * Pago realizado por el inquilino.
 */
@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'invoice_id', nullable: true })
  invoiceId: string;

  @ManyToOne(() => Invoice, { nullable: true })
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  @Column({ name: 'tenant_account_id', nullable: true })
  tenantAccountId: string;

  @ManyToOne(() => TenantAccount, (account) => account.payments, {
    nullable: true,
  })
  @JoinColumn({ name: 'tenant_account_id' })
  tenantAccount: TenantAccount;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'payment_number', nullable: true })
  paymentNumber: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: number;

  @Column({ name: 'currency', default: 'ARS' })
  currencyCode: string;

  @ManyToOne(() => Currency)
  @JoinColumn({ name: 'currency', referencedColumnName: 'code' })
  currency: Currency;

  @Column({ name: 'payment_date', type: 'date' })
  paymentDate: Date;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date;

  @Column({ name: 'payment_method', type: 'enum', enum: PaymentMethod })
  method: PaymentMethod;

  @Column({ name: 'reference_number', nullable: true })
  reference: string;

  @Column({ name: 'bank_name', nullable: true })
  bankName: string;

  @Column({ name: 'account_last_digits', length: 4, nullable: true })
  accountLastDigits: string;

  @Column({ name: 'authorization_code', nullable: true })
  authorizationCode: string;

  @Column({ name: 'external_transaction_id', nullable: true })
  externalTransactionId: string;

  @Column({ name: 'gateway_response', type: 'jsonb', default: {} })
  gatewayResponse: Record<string, any>;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @OneToOne(() => Receipt, (receipt) => receipt.payment)
  receipt: Receipt;

  @OneToMany(() => PaymentItem, (item) => item.payment)
  items: PaymentItem[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date;
}
