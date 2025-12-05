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
import { Company } from '../../companies/entities/company.entity';
import { User } from '../../users/entities/user.entity';
import { Invoice } from './invoice.entity';
import { Currency } from '../../currencies/entities/currency.entity';

/**
 * Estados de la factura de comisión.
 */
export enum CommissionInvoiceStatus {
  DRAFT = 'draft',
  ISSUED = 'issued',
  PAID = 'paid',
  CANCELLED = 'cancelled',
}

/**
 * Factura de comisión emitida por la compañía al propietario.
 */
@Entity('commission_invoices')
export class CommissionInvoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'owner_id' })
  ownerId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ name: 'invoice_id', nullable: true })
  invoiceId: string;

  @OneToOne(() => Invoice, (invoice) => invoice.commissionInvoice)
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  @Column({ name: 'invoice_number' })
  invoiceNumber: string;

  @Column({ name: 'commission_rate', type: 'decimal', precision: 5, scale: 2 })
  commissionRate: number;

  @Column({ name: 'base_amount', type: 'decimal', precision: 12, scale: 2 })
  baseAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal: number;

  @Column({
    name: 'tax_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 21.0,
  })
  taxRate: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 12, scale: 2 })
  taxAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total: number;

  @Column({ name: 'currency_code', default: 'ARS' })
  currencyCode: string;

  @ManyToOne(() => Currency)
  @JoinColumn({ name: 'currency_code', referencedColumnName: 'code' })
  currency: Currency;

  @Column({
    type: 'enum',
    enum: CommissionInvoiceStatus,
    default: CommissionInvoiceStatus.DRAFT,
  })
  status: CommissionInvoiceStatus;

  @Column({ name: 'pdf_url', nullable: true })
  pdfUrl: string;

  @Column({ name: 'issued_at', type: 'timestamptz', nullable: true })
  issuedAt: Date;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date;
}
