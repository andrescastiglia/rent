import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SaleAgreement } from './sale-agreement.entity';

@Entity('sale_receipts')
export class SaleReceipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'agreement_id' })
  agreementId: string;

  @ManyToOne(() => SaleAgreement, (agreement) => agreement.receipts)
  @JoinColumn({ name: 'agreement_id' })
  agreement: SaleAgreement;

  @Column({ name: 'receipt_number' })
  receiptNumber: string;

  @Column({ name: 'installment_number', type: 'integer' })
  installmentNumber: number;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: number;

  @Column({ name: 'currency', default: 'ARS' })
  currency: string;

  @Column({ name: 'payment_date', type: 'date' })
  paymentDate: Date;

  @Column({ name: 'balance_after', type: 'decimal', precision: 14, scale: 2 })
  balanceAfter: number;

  @Column({ name: 'overdue_amount', type: 'decimal', precision: 14, scale: 2 })
  overdueAmount: number;

  @Column({ name: 'copy_count', type: 'integer', default: 2 })
  copyCount: number;

  @Column({ name: 'pdf_url', nullable: true })
  pdfUrl: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
