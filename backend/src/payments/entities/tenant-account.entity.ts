import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Lease } from '../../leases/entities/lease.entity';
import { TenantAccountMovement } from './tenant-account-movement.entity';
import { Payment } from './payment.entity';
import { Invoice } from './invoice.entity';

/**
 * Cuenta corriente del inquilino para un contrato.
 * Registra el balance (deuda/crédito) y permite calcular mora.
 */
@Entity('tenant_accounts')
export class TenantAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'lease_id' })
  leaseId: string;

  @OneToOne(() => Lease)
  @JoinColumn({ name: 'lease_id' })
  lease: Lease;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  balance: number;

  @Column({ name: 'last_calculated_at', type: 'timestamptz', nullable: true })
  lastCalculatedAt: Date;

  @OneToMany(() => TenantAccountMovement, (movement) => movement.account)
  movements: TenantAccountMovement[];

  @OneToMany(() => Payment, (payment) => payment.tenantAccount)
  payments: Payment[];

  @OneToMany(() => Invoice, (invoice) => invoice.tenantAccount)
  invoices: Invoice[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
