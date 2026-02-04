import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToOne,
  OneToMany,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { Lease } from '../../leases/entities/lease.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Company } from '../../companies/entities/company.entity';
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

  @Column({ name: 'company_id' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'lease_id' })
  leaseId: string;

  @OneToOne(() => Lease)
  @JoinColumn({ name: 'lease_id' })
  lease: Lease;

  @Column({
    name: 'current_balance',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  balance: number;

  @Column({ name: 'currency', default: 'ARS' })
  currencyCode: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'last_movement_at', type: 'timestamptz', nullable: true })
  lastMovementAt: Date;

  @Column({ type: 'text', nullable: true })
  notes: string;

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

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date;
}
