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
import { User } from '../../users/entities/user.entity';
import { Company } from '../../companies/entities/company.entity';

export enum DocumentType {
  LEASE_CONTRACT = 'lease_contract',
  ID_DOCUMENT = 'id_document',
  PROOF_OF_INCOME = 'proof_of_income',
  BANK_STATEMENT = 'bank_statement',
  UTILITY_BILL = 'utility_bill',
  INSURANCE = 'insurance',
  INSPECTION_REPORT = 'inspection_report',
  MAINTENANCE_RECORD = 'maintenance_record',
  PHOTO = 'photo',
  OTHER = 'other',
}

export enum DocumentStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}

@Entity('documents')
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'document_type', type: 'enum', enum: DocumentType })
  documentType: DocumentType;

  @Column({
    type: 'enum',
    enum: DocumentStatus,
    default: DocumentStatus.PENDING,
  })
  status: DocumentStatus;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'file_url', length: 500 })
  fileUrl: string;

  @Column({ name: 'file_size', nullable: true })
  fileSize: number;

  @Column({ name: 'file_mime_type', length: 100, nullable: true })
  fileMimeType: string;

  @Column({ name: 'expires_at', type: 'date', nullable: true })
  expiresAt: Date;

  @Column({ name: 'entity_type', length: 50 })
  entityType: string; // 'property', 'unit', 'lease', etc.

  @Column({ name: 'entity_id' })
  entityId: string;

  @Column({ name: 'verified_by', nullable: true })
  verifiedBy: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'verified_by' })
  verifier: User;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string;

  @Column({ type: 'text', array: true, nullable: true })
  tags: string[];

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date;
}
