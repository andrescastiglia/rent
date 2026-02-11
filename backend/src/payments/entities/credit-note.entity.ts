import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Invoice } from './invoice.entity';
import { Payment } from './payment.entity';
import { TenantAccount } from './tenant-account.entity';
import { Currency } from '../../currencies/entities/currency.entity';

export enum CreditNoteStatus {
  DRAFT = 'draft',
  ISSUED = 'issued',
  CANCELLED = 'cancelled',
}

@Entity('credit_notes')
export class CreditNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'invoice_id' })
  invoiceId: string;

  @ManyToOne(() => Invoice)
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  @Column({ name: 'payment_id', type: 'uuid', nullable: true })
  paymentId: string | null;

  @ManyToOne(() => Payment, { nullable: true })
  @JoinColumn({ name: 'payment_id' })
  payment: Payment | null;

  @Column({ name: 'tenant_account_id', type: 'uuid', nullable: true })
  tenantAccountId: string | null;

  @ManyToOne(() => TenantAccount, { nullable: true })
  @JoinColumn({ name: 'tenant_account_id' })
  tenantAccount: TenantAccount | null;

  @Column({ name: 'note_number' })
  noteNumber: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: number;

  @Column({ name: 'currency', default: 'ARS' })
  currencyCode: string;

  @ManyToOne(() => Currency)
  @JoinColumn({ name: 'currency', referencedColumnName: 'code' })
  currency: Currency;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({
    type: 'enum',
    enum: CreditNoteStatus,
    enumName: 'credit_note_status',
    default: CreditNoteStatus.ISSUED,
  })
  status: CreditNoteStatus;

  @Column({ name: 'pdf_url', type: 'text', nullable: true })
  pdfUrl: string | null;

  @Column({
    name: 'issued_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  issuedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
