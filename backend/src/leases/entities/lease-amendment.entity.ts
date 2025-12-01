import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Lease } from './lease.entity';
import { User } from '../../users/entities/user.entity';

export enum AmendmentChangeType {
  RENT_INCREASE = 'rent_increase',
  RENT_DECREASE = 'rent_decrease',
  EXTENSION = 'extension',
  TERMINATION = 'termination',
  OTHER = 'other',
}

export enum AmendmentStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('lease_amendments')
export class LeaseAmendment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'lease_id' })
  leaseId: string;

  @ManyToOne(() => Lease, (lease) => lease.amendments)
  @JoinColumn({ name: 'lease_id' })
  lease: Lease;

  @Column({ name: 'effective_date', type: 'date' })
  effectiveDate: Date;

  @Column({ name: 'change_type', type: 'enum', enum: AmendmentChangeType })
  changeType: AmendmentChangeType;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'old_values', type: 'jsonb', nullable: true })
  oldValues: Record<string, any>;

  @Column({ name: 'new_values', type: 'jsonb', nullable: true })
  newValues: Record<string, any>;

  @Column({ type: 'enum', enum: AmendmentStatus, default: AmendmentStatus.PENDING })
  status: AmendmentStatus;

  @Column({ name: 'approved_by', nullable: true })
  approvedBy: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approved_by' })
  approver: User;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
