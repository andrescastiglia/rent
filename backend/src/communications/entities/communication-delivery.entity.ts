import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import {
  CommunicationChannel,
  CommunicationEvent,
  CommunicationRecipientRole,
  CommunicationTemplate,
} from './communication-template.entity';

export enum CommunicationDeliveryStatus {
  PENDING_APPROVAL = 'pending_approval',
  QUEUED = 'queued',
  PROCESSING = 'processing',
  SENT = 'sent',
  FAILED = 'failed',
  BLOCKED = 'blocked',
}

@Entity('communication_deliveries')
export class CommunicationDelivery {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'company_id' }) companyId: string;
  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;
  @Column({ name: 'template_id', type: 'uuid', nullable: true }) templateId:
    string | null;
  @ManyToOne(() => CommunicationTemplate, { nullable: true })
  @JoinColumn({ name: 'template_id' })
  template: CommunicationTemplate | null;
  @Column({ type: 'enum', enum: CommunicationEvent }) event: CommunicationEvent;
  @Column({
    name: 'recipient_role',
    type: 'enum',
    enum: CommunicationRecipientRole,
  })
  recipientRole: CommunicationRecipientRole;
  @Column({ name: 'recipient_id', type: 'uuid', nullable: true }) recipientId:
    string | null;
  @Column({ type: 'enum', enum: CommunicationChannel })
  channel: CommunicationChannel;
  @Column({ type: 'varchar', length: 320 }) recipient: string;
  @Column({ type: 'varchar', length: 200, nullable: true }) subject:
    string | null;
  @Column({ type: 'text' }) body: string;
  @Column({ type: 'enum', enum: CommunicationDeliveryStatus })
  status: CommunicationDeliveryStatus;
  @Column({ default: 0 }) attempts: number;
  @Column({ name: 'max_attempts', default: 3 }) maxAttempts: number;
  @Column({ name: 'next_attempt_at', type: 'timestamptz', nullable: true })
  nextAttemptAt: Date | null;
  @Column({ name: 'lease_expires_at', type: 'timestamptz', nullable: true })
  leaseExpiresAt: Date | null;
  @Column({ name: 'provider_message_id', type: 'varchar', nullable: true })
  providerMessageId: string | null;
  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;
  @Column({
    name: 'related_entity_type',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  relatedEntityType: string | null;
  @Column({ name: 'related_entity_id', type: 'uuid', nullable: true })
  relatedEntityId: string | null;
  @Column({ name: 'source_communication_id', type: 'uuid', nullable: true })
  sourceCommunicationId: string | null;
  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  idempotencyKey: string | null;
  @Column({ type: 'jsonb', default: () => "'{}'" }) metadata: Record<
    string,
    unknown
  >;
  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
