import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Tenant } from './tenant.entity';
import { User } from '../../users/entities/user.entity';

export enum TenantActivityType {
  CALL = 'call',
  TASK = 'task',
  NOTE = 'note',
  EMAIL = 'email',
  WHATSAPP = 'whatsapp',
  VISIT = 'visit',
}

export enum TenantActivityStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity('tenant_activities')
export class TenantActivity {
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

  @Column({
    type: 'enum',
    enum: TenantActivityType,
    enumName: 'tenant_activity_type',
  })
  type: TenantActivityType;

  @Column({
    type: 'enum',
    enum: TenantActivityStatus,
    enumName: 'tenant_activity_status',
    default: TenantActivityStatus.PENDING,
  })
  status: TenantActivityStatus;

  @Column({ length: 200 })
  subject: string;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  @Column({ name: 'due_at', type: 'timestamptz', nullable: true })
  dueAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  @Column({ name: 'created_by_user_id', nullable: true })
  createdByUserId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser: User | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
