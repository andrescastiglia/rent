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
import { TenantAccount } from './tenant-account.entity';
import { User } from '../../users/entities/user.entity';
import { Currency } from '../../currencies/entities/currency.entity';
import { Receipt } from './receipt.entity';

/**
 * Métodos de pago disponibles.
 */
export enum PaymentMethod {
  CASH = 'cash',
  TRANSFER = 'transfer',
  CHECK = 'check',
  DEBIT = 'debit',
  CREDIT = 'credit',
  OTHER = 'other',
}

/**
 * Estados del pago.
 */
export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  REVERSED = 'reversed',
}

/**
 * Pago realizado por el inquilino.
 */
@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_account_id' })
  tenantAccountId: string;

  @ManyToOne(() => TenantAccount, (account) => account.payments)
  @JoinColumn({ name: 'tenant_account_id' })
  tenantAccount: TenantAccount;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ name: 'currency', default: 'ARS' })
  currencyCode: string;

  @ManyToOne(() => Currency)
  @JoinColumn({ name: 'currency', referencedColumnName: 'code' })
  currency: Currency;

  @Column({ name: 'payment_date', type: 'date' })
  paymentDate: Date;

  @Column({ name: 'payment_method', type: 'enum', enum: PaymentMethod })
  method: PaymentMethod;

  @Column({ name: 'reference_number', nullable: true })
  reference: string;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({
    name: 'received_by',
    nullable: true,
    select: false,
    insert: false,
    update: false,
  })
  receivedBy: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'received_by' })
  receiver: User;

  @OneToOne(() => Receipt, (receipt) => receipt.payment)
  receipt: Receipt;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date;
}
