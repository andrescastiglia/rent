import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Invoice, InvoiceStatus } from './invoice.entity';
import { Payment } from './payment.entity';

@Entity('payment_allocations')
@Index(['companyId', 'paymentId', 'invoiceId'], { unique: true })
export class PaymentAllocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'payment_id' })
  paymentId: string;

  @ManyToOne(() => Payment, (payment) => payment.allocations)
  @JoinColumn({ name: 'payment_id' })
  payment: Payment;

  @Column({ name: 'invoice_id' })
  invoiceId: string;

  @ManyToOne(() => Invoice)
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: number;

  @Column({
    name: 'previous_invoice_status',
    type: 'enum',
    enum: InvoiceStatus,
    enumName: 'invoice_status',
  })
  previousInvoiceStatus: InvoiceStatus;

  @Column({ name: 'reversed_at', type: 'timestamptz', nullable: true })
  reversedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
