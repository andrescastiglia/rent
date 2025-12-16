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
import { Lease } from '../../leases/entities/lease.entity';
import { Owner } from '../../owners/entities/owner.entity';
import { TenantAccount } from './tenant-account.entity';
import { Currency } from '../../currencies/entities/currency.entity';

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
 * Tipo de comprobante ARCA/AFIP.
 */
export enum ArcaTipoComprobante {
  FACTURA_A = 'factura_a',
  FACTURA_B = 'factura_b',
  FACTURA_C = 'factura_c',
  RECIBO_A = 'recibo_a',
  RECIBO_B = 'recibo_b',
  RECIBO_C = 'recibo_c',
  NOTA_CREDITO_A = 'nota_credito_a',
  NOTA_CREDITO_B = 'nota_credito_b',
  NOTA_CREDITO_C = 'nota_credito_c',
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

  @ManyToOne(() => Owner)
  @JoinColumn({ name: 'owner_id' })
  owner: Owner;

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
    name: 'late_fee_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  lateFee: number;

  @Column({
    name: 'discount_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  adjustments: number;

  @Column({ name: 'total_amount', type: 'decimal', precision: 12, scale: 2 })
  total: number;

  @Column({ name: 'currency', default: 'ARS' })
  currencyCode: string;

  @ManyToOne(() => Currency)
  @JoinColumn({ name: 'currency', referencedColumnName: 'code' })
  currency: Currency;

  @Column({
    name: 'paid_amount',
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

  @Column({
    name: 'pdf_url',
    nullable: true,
    select: false,
    insert: false,
    update: false,
  })
  pdfUrl: string;

  @Column({ name: 'issue_date', type: 'date', nullable: true })
  issuedAt: Date;

  @Column({ type: 'text', nullable: true })
  notes: string;

  // ARCA Electronic Invoicing fields

  @Column({ name: 'arca_cae', length: 14, nullable: true })
  arcaCae: string;

  @Column({ name: 'arca_cae_vencimiento', type: 'date', nullable: true })
  arcaCaeExpiration: Date;

  @Column({
    name: 'arca_tipo_comprobante',
    type: 'enum',
    enum: ArcaTipoComprobante,
    nullable: true,
  })
  arcaTipoComprobante: ArcaTipoComprobante;

  @Column({ name: 'arca_punto_venta', type: 'integer', nullable: true })
  arcaPuntoVenta: number;

  @Column({ name: 'arca_numero_comprobante', type: 'integer', nullable: true })
  arcaNumeroComprobante: number;

  @Column({
    name: 'arca_qr_data',
    type: 'text',
    nullable: true,
    select: false,
    insert: false,
    update: false,
  })
  arcaQrData: string;

  @Column({
    name: 'arca_error_log',
    type: 'text',
    nullable: true,
    select: false,
    insert: false,
    update: false,
  })
  arcaErrorLog: string;

  // Multi-Currency Support

  @Column({
    name: 'original_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  originalAmount: number;

  @Column({ name: 'original_currency', length: 3, nullable: true })
  originalCurrency: string;

  @Column({
    name: 'exchange_rate',
    type: 'decimal',
    precision: 12,
    scale: 6,
    nullable: true,
  })
  exchangeRateUsed: number;

  @Column({ name: 'exchange_rate_date', type: 'date', nullable: true })
  exchangeRateDate: Date;

  // Withholdings

  @Column({
    name: 'withholding_iibb',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  withholdingIibb: number;

  @Column({
    name: 'withholding_iva',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    select: false,
    insert: false,
    update: false,
  })
  withholdingIva: number;

  @Column({
    name: 'withholding_ganancias',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  withholdingGanancias: number;

  @Column({
    name: 'withholdings_total',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    select: false,
    insert: false,
    update: false,
  })
  withholdingsTotal: number;

  // Adjustment Tracking

  @Column({
    name: 'adjustment_applied',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    select: false,
    insert: false,
    update: false,
  })
  adjustmentApplied: number;

  @Column({
    name: 'adjustment_index_type',
    length: 10,
    nullable: true,
    select: false,
    insert: false,
    update: false,
  })
  adjustmentIndexType: string;

  @Column({
    name: 'adjustment_index_value',
    type: 'decimal',
    precision: 8,
    scale: 4,
    nullable: true,
    select: false,
    insert: false,
    update: false,
  })
  adjustmentIndexValue: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date;
}
