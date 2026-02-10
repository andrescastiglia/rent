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
import { Owner } from './owner.entity';
import { Property } from '../../properties/entities/property.entity';
import { User } from '../../users/entities/user.entity';

export enum OwnerActivityType {
  CALL = 'call',
  TASK = 'task',
  NOTE = 'note',
  EMAIL = 'email',
  WHATSAPP = 'whatsapp',
  VISIT = 'visit',
  RESERVE = 'reserve',
}

export enum OwnerActivityStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity('owner_activities')
export class OwnerActivity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'owner_id' })
  ownerId: string;

  @ManyToOne(() => Owner)
  @JoinColumn({ name: 'owner_id' })
  owner: Owner;

  @Column({ name: 'property_id', nullable: true })
  propertyId: string | null;

  @ManyToOne(() => Property, { nullable: true })
  @JoinColumn({ name: 'property_id' })
  property: Property | null;

  @Column({
    type: 'enum',
    enum: OwnerActivityType,
    enumName: 'owner_activity_type',
  })
  type: OwnerActivityType;

  @Column({
    type: 'enum',
    enum: OwnerActivityStatus,
    enumName: 'owner_activity_status',
    default: OwnerActivityStatus.PENDING,
  })
  status: OwnerActivityStatus;

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
