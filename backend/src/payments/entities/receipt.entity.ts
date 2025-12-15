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

/**
 * Recibo de pago emitido al inquilino.
 */
@Entity('receipts')
export class Receipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'payment_id' })
  paymentId: string;

  @OneToOne(() => Payment, (payment) => payment.receipt)
  @JoinColumn({ name: 'payment_id' })
  payment: Payment;

  @Column({ name: 'receipt_number' })
  receiptNumber: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ name: 'currency', default: 'ARS' })
  currencyCode: string;

  @ManyToOne(() => Currency)
  @JoinColumn({ name: 'currency', referencedColumnName: 'code' })
  currency: Currency;

  @Column({ name: 'pdf_url', nullable: true })
  pdfUrl: string;

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
