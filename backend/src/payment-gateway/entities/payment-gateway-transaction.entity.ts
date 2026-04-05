import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Invoice } from '../../payments/entities/invoice.entity';
import { Company } from '../../companies/entities/company.entity';

export enum PaymentGatewayTransactionStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

@Entity('payment_gateway_transactions')
export class PaymentGatewayTransaction {
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

  @Column({ name: 'tenant_id', type: 'varchar', nullable: true })
  tenantId: string | null;

  @Column({ length: 50, default: 'mercadopago' })
  gateway: string;

  @Column({ name: 'external_id', length: 255, type: 'varchar', nullable: true })
  externalId: string | null;

  @Column({ name: 'external_payment_id', length: 255, type: 'varchar', nullable: true })
  externalPaymentId: string | null;

  @Column({
    type: 'enum',
    enum: PaymentGatewayTransactionStatus,
    default: PaymentGatewayTransactionStatus.PENDING,
  })
  status: PaymentGatewayTransactionStatus;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ length: 3, default: 'ARS' })
  currency: string;

  @Column({ name: 'payment_method', length: 100, type: 'varchar', nullable: true })
  paymentMethod: string | null;

  @Column({ type: 'integer', default: 1 })
  installments: number;

  @Column({ name: 'init_point', type: 'text', nullable: true })
  initPoint: string | null;

  @Column({ name: 'sandbox_init_point', type: 'text', nullable: true })
  sandboxInitPoint: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
