import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Lease } from './lease.entity';
import { User } from '../../users/entities/user.entity';
import { Company } from '../../companies/entities/company.entity';

export enum AmendmentChangeType {
  RENT_INCREASE = 'rent_increase',
  RENT_DECREASE = 'rent_decrease',
  EXTENSION = 'extension',
  EARLY_TERMINATION = 'early_termination',
  CLAUSE_MODIFICATION = 'clause_modification',
  GUARANTOR_CHANGE = 'guarantor_change',
  OTHER = 'other',
}

export enum AmendmentStatus {
  DRAFT = 'draft',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
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

  @Column({ name: 'company_id' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'amendment_number' })
  amendmentNumber: number;

  @Column({ name: 'change_type', type: 'enum', enum: AmendmentChangeType, enumName: 'amendment_change_type' })
  changeType: AmendmentChangeType;

  @Column({ type: 'enum', enum: AmendmentStatus, enumName: 'amendment_status', default: AmendmentStatus.DRAFT })
  status: AmendmentStatus;

  @Column({ name: 'effective_date', type: 'date' })
  effectiveDate: Date;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'previous_values', type: 'jsonb', default: '{}' })
  previousValues: Record<string, any>;

  @Column({ name: 'new_values', type: 'jsonb', default: '{}' })
  newValues: Record<string, any>;

  @Column({ name: 'requested_by', nullable: true })
  requestedBy: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'requested_by' })
  requester: User;

  @Column({ name: 'approved_by', nullable: true })
  approvedBy: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approved_by' })
  approver: User;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string;

  @Column({ name: 'document_url', nullable: true })
  documentUrl: string;

  @Column({ name: 'signed_by_tenant', default: false })
  signedByTenant: boolean;

  @Column({ name: 'signed_by_owner', default: false })
  signedByOwner: boolean;

  @Column({ name: 'signed_at', type: 'timestamptz', nullable: true })
  signedAt: Date;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date;
}
