import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Payment } from './payment.entity';
import { Currency } from '../../currencies/entities/currency.entity';
import { Company } from '../../companies/entities/company.entity';

/**
 * Recibo de pago emitido al inquilino.
 */
@Entity('receipts')
export class Receipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'payment_id' })
  paymentId: string;

  @OneToOne(() => Payment, (payment) => payment.receipt)
  @JoinColumn({ name: 'payment_id' })
  payment: Payment;

  @Column({ name: 'receipt_number' })
  receiptNumber: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: number;

  @Column({ name: 'currency', default: 'ARS' })
  currencyCode: string;

  @ManyToOne(() => Currency)
  @JoinColumn({ name: 'currency', referencedColumnName: 'code' })
  currency: Currency;

  @Column({ name: 'pdf_url', nullable: true })
  pdfUrl: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'pdf_generated_at', type: 'timestamptz', nullable: true })
  pdfGeneratedAt: Date;

  @Column({ name: 'sent_to_email', nullable: true })
  sentToEmail: string;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date;

  @Column({
    name: 'issue_date',
    type: 'date',
    default: () => 'CURRENT_DATE',
  })
  issuedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
