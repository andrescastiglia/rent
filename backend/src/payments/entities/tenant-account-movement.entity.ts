import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TenantAccount } from './tenant-account.entity';

/**
 * Tipos de movimiento en la cuenta corriente.
 */
export enum MovementType {
  CHARGE = 'charge',
  PAYMENT = 'payment',
  ADJUSTMENT = 'adjustment',
  REFUND = 'refund',
  INTEREST = 'interest',
  LATE_FEE = 'late_fee',
  DISCOUNT = 'discount',
}

/**
 * Movimiento en la cuenta corriente del inquilino.
 * Registra cada transacción que afecta el balance.
 */
@Entity('tenant_account_movements')
export class TenantAccountMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_account_id' })
  tenantAccountId: string;

  @ManyToOne(() => TenantAccount, (account) => account.movements)
  @JoinColumn({ name: 'tenant_account_id' })
  account: TenantAccount;

  @Column({
    name: 'movement_type',
    type: 'enum',
    enum: MovementType,
  })
  movementType: MovementType;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: number;

  @Column({ name: 'balance_after', type: 'decimal', precision: 14, scale: 2 })
  balanceAfter: number;

  @Column({ name: 'reference_type', nullable: true })
  referenceType: string;

  @Column({ name: 'reference_id', type: 'uuid', nullable: true })
  referenceId: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'movement_date', type: 'date', default: () => 'CURRENT_DATE' })
  movementDate: Date;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
