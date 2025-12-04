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
    INVOICE = 'invoice',
    PAYMENT = 'payment',
    LATE_FEE = 'late_fee',
    ADJUSTMENT = 'adjustment',
    CREDIT = 'credit',
}

/**
 * Movimiento en la cuenta corriente del inquilino.
 * Registra cada transacción que afecta el balance.
 */
@Entity('tenant_account_movements')
export class TenantAccountMovement {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'account_id' })
    accountId: string;

    @ManyToOne(() => TenantAccount, (account) => account.movements)
    @JoinColumn({ name: 'account_id' })
    account: TenantAccount;

    @Column({
        name: 'movement_type',
        type: 'enum',
        enum: MovementType,
    })
    movementType: MovementType;

    @Column({ type: 'decimal', precision: 12, scale: 2 })
    amount: number;

    @Column({ name: 'balance_after', type: 'decimal', precision: 12, scale: 2 })
    balanceAfter: number;

    @Column({ name: 'reference_type', nullable: true })
    referenceType: string;

    @Column({ name: 'reference_id', type: 'uuid', nullable: true })
    referenceId: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}
