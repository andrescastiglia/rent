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
import { Company } from '../../companies/entities/company.entity';

/**
 * Estados de la factura.
 */
export enum InvoiceStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  SENT = 'sent',
  PARTIAL = 'partial',
  PAID = 'paid',
  OVERDUE = 'overdue',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

/**
 * Tipo de comprobante ARCA/AFIP.
 */
export enum ArcaTipoComprobante {
  FACTURA_A = 'factura_a',
  FACTURA_B = 'factura_b',
  FACTURA_C = 'factura_c',
  NOTA_CREDITO_A = 'nota_credito_a',
  NOTA_CREDITO_B = 'nota_credito_b',
  NOTA_CREDITO_C = 'nota_credito_c',
  NOTA_DEBITO_A = 'nota_debito_a',
  NOTA_DEBITO_B = 'nota_debito_b',
  NOTA_DEBITO_C = 'nota_debito_c',
  RECIBO_A = 'recibo_a',
  RECIBO_B = 'recibo_b',
  RECIBO_C = 'recibo_c',
}

/**
 * Factura emitida por el propietario al inquilino.
 * La compañía actúa como agente de facturación.
 */
@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

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

  @Column({ name: 'tenant_account_id', nullable: true })
  tenantAccountId: string;

  @ManyToOne(() => TenantAccount, (account) => account.invoices, {
    nullable: true,
  })
  @JoinColumn({ name: 'tenant_account_id' })
  tenantAccount: TenantAccount;

  @Column({ name: 'invoice_number' })
  invoiceNumber: string;

  @Column({ name: 'period_start', type: 'date' })
  periodStart: Date;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd: Date;

  @Column({ name: 'issue_date', type: 'date', default: () => 'CURRENT_DATE' })
  issuedAt: Date;

  @Column({ name: 'due_date', type: 'date' })
  dueDate: Date;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  subtotal: number;

  @Column({
    name: 'tax_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  taxAmount: number;

  @Column({
    name: 'late_fee_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  lateFee: number;

  @Column({
    name: 'discount_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  adjustments: number;

  @Column({ name: 'total_amount', type: 'decimal', precision: 14, scale: 2 })
  total: number;

  @Column({
    name: 'net_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  netAmount: number;

  @Column({ name: 'currency', default: 'ARS' })
  currencyCode: string;

  @ManyToOne(() => Currency)
  @JoinColumn({ name: 'currency', referencedColumnName: 'code' })
  currency: Currency;

  @Column({
    name: 'paid_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  amountPaid: number;

  @Column({
    name: 'balance_due',
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  balanceDue: number;

  @Column({ name: 'last_payment_date', type: 'date', nullable: true })
  lastPaymentDate: Date;

  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.DRAFT })
  status: InvoiceStatus;

  @Column({
    name: 'pdf_url',
    nullable: true,
  })
  pdfUrl: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ name: 'internal_notes', type: 'text', nullable: true })
  internalNotes: string;

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

  @Column({ name: 'arca_numero_comprobante', type: 'bigint', nullable: true })
  arcaNumeroComprobante: string;

  @Column({
    name: 'arca_qr_data',
    type: 'text',
    nullable: true,
  })
  arcaQrData: string;

  @Column({
    name: 'arca_error_message',
    type: 'text',
    nullable: true,
  })
  arcaErrorMessage: string;

  @Column({ name: 'arca_request_xml', type: 'text', nullable: true })
  arcaRequestXml: string;

  @Column({ name: 'arca_response_xml', type: 'text', nullable: true })
  arcaResponseXml: string;

  @Column({ name: 'arca_submitted_at', type: 'timestamptz', nullable: true })
  arcaSubmittedAt: Date;

  // Multi-Currency Support

  @Column({
    name: 'original_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  originalAmount: number;

  @Column({ name: 'original_currency', length: 3, nullable: true })
  originalCurrency: string;

  @Column({
    name: 'exchange_rate',
    type: 'decimal',
    precision: 14,
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
    precision: 14,
    scale: 2,
    default: 0,
  })
  withholdingIibb: number;

  @Column({
    name: 'withholding_iva',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  withholdingIva: number;

  @Column({
    name: 'withholding_ganancias',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  withholdingGanancias: number;

  @Column({
    name: 'withholding_other',
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  withholdingOther: number;

  // Adjustment Tracking

  @Column({
    name: 'adjustment_applied',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  adjustmentApplied: number;

  @Column({
    name: 'adjustment_index_type',
    length: 10,
    nullable: true,
  })
  adjustmentIndexType: string;

  @Column({
    name: 'adjustment_index_value',
    type: 'decimal',
    precision: 8,
    scale: 4,
    nullable: true,
  })
  adjustmentIndexValue: number;

  @Column({ name: 'line_items', type: 'jsonb', default: [] })
  lineItems: Array<Record<string, any>>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date;
}
