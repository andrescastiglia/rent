import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum AiEmbeddingOutboxOperation {
  UPSERT = 'upsert',
  DELETE = 'delete',
}

export enum AiEmbeddingOutboxStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  FAILED = 'failed',
}

@Entity('ai_embedding_outbox')
@Index('idx_ai_embedding_outbox_pending', ['availableAt', 'createdAt'], {
  where: "status = 'pending'",
})
@Index('idx_ai_embedding_outbox_entity', [
  'companyId',
  'entityType',
  'entityId',
  'createdAt',
])
export class AiEmbeddingOutbox {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 80 })
  entityType: string;

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId: string;

  @Column({ type: 'varchar', length: 20 })
  operation: AiEmbeddingOutboxOperation;

  @Column({ name: 'source_updated_at', type: 'timestamptz' })
  sourceUpdatedAt: Date;

  @Column({
    type: 'varchar',
    length: 20,
    default: AiEmbeddingOutboxStatus.PENDING,
  })
  status: AiEmbeddingOutboxStatus;

  @Column({ type: 'integer', default: 0 })
  attempts: number;

  @Column({ name: 'available_at', type: 'timestamptz', default: () => 'NOW()' })
  availableAt: Date;

  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt: Date | null;

  @Column({ name: 'locked_by', type: 'varchar', length: 120, nullable: true })
  lockedBy: string | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
