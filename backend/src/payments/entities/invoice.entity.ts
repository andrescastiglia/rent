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
} from 'typeorm';
import { Lease } from '../../leases/entities/lease.entity';
import { User } from '../../users/entities/user.entity';
import { TenantAccount } from './tenant-account.entity';
import { Currency } from '../../currencies/entities/currency.entity';
import { CommissionInvoice } from './commission-invoice.entity';

/**
 * Estados de la factura.
 */
export enum InvoiceStatus {
  DRAFT = 'draft',
  ISSUED = 'issued',
  PAID = 'paid',
  PARTIALLY_PAID = 'partially_paid',
  CANCELLED = 'cancelled',
  OVERDUE = 'overdue',
}

/**
 * Factura emitida por el propietario al inquilino.
 * La compañía actúa como agente de facturación.
 */
@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'lease_id' })
  leaseId: string;

  @ManyToOne(() => Lease)
  @JoinColumn({ name: 'lease_id' })
  lease: Lease;

  @Column({ name: 'owner_id' })
  ownerId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ name: 'tenant_account_id' })
  tenantAccountId: string;

  @ManyToOne(() => TenantAccount, (account) => account.invoices)
  @JoinColumn({ name: 'tenant_account_id' })
  tenantAccount: TenantAccount;

  @Column({ name: 'invoice_number' })
  invoiceNumber: string;

  @Column({ name: 'period_start', type: 'date' })
  periodStart: Date;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal: number;

  @Column({
    name: 'late_fee',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  lateFee: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  adjustments: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total: number;

  @Column({ name: 'currency_code', default: 'ARS' })
  currencyCode: string;

  @ManyToOne(() => Currency)
  @JoinColumn({ name: 'currency_code', referencedColumnName: 'code' })
  currency: Currency;

  @Column({
    name: 'amount_paid',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  amountPaid: number;

  @Column({ name: 'due_date', type: 'date' })
  dueDate: Date;

  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.DRAFT })
  status: InvoiceStatus;

  @Column({ name: 'pdf_url', nullable: true })
  pdfUrl: string;

  @Column({ name: 'issued_at', type: 'timestamptz', nullable: true })
  issuedAt: Date;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @OneToOne(() => CommissionInvoice, (ci) => ci.invoice)
  commissionInvoice: CommissionInvoice;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date;
}
