import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Lease } from '../../leases/entities/lease.entity';

export enum SignatureProvider {
  DOCUSIGN = 'docusign',
  ADOBE_SIGN = 'adobe_sign',
  EFIRMA = 'efirma',
  MOCK = 'mock',
}

export enum SignatureStatus {
  PENDING = 'pending',
  SENT = 'sent',
  COMPLETED = 'completed',
  VOIDED = 'voided',
  DECLINED = 'declined',
  EXPIRED = 'expired',
}

@Entity('digital_signature_requests')
export class DigitalSignatureRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'lease_id' })
  leaseId: string;

  @ManyToOne(() => Lease)
  @JoinColumn({ name: 'lease_id' })
  lease: Lease;

  @Column({ length: 50, default: SignatureProvider.DOCUSIGN })
  provider: string;

  @Column({ name: 'external_envelope_id', length: 255, type: 'varchar', nullable: true })
  externalEnvelopeId: string | null;

  @Column({ length: 50, default: SignatureStatus.PENDING })
  status: string;

  @Column({ name: 'tenant_email', length: 255 })
  tenantEmail: string;

  @Column({ name: 'tenant_name', length: 255 })
  tenantName: string;

  @Column({ name: 'owner_email', length: 255, type: 'varchar', nullable: true })
  ownerEmail: string | null;

  @Column({ name: 'owner_name', length: 255, type: 'varchar', nullable: true })
  ownerName: string | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'voided_at', type: 'timestamptz', nullable: true })
  voidedAt: Date | null;

  @Column({ name: 'expiry_date', type: 'timestamptz', nullable: true })
  expiryDate: Date | null;

  @Column({ name: 'signing_url', type: 'text', nullable: true })
  signingUrl: string | null;

  @Column({ name: 'owner_signing_url', type: 'text', nullable: true })
  ownerSigningUrl: string | null;

  @Column({ name: 'certificate_url', type: 'text', nullable: true })
  certificateUrl: string | null;

  @Column({ name: 'webhook_events', type: 'jsonb', default: '[]' })
  webhookEvents: object[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
