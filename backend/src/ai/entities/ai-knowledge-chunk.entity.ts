import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export const AI_EMBEDDING_DIMENSIONS = 1536;

@Entity('ai_knowledge_chunks')
@Unique('uq_ai_knowledge_chunk', [
  'companyId',
  'entityType',
  'entityId',
  'chunkKey',
  'embeddingVersion',
])
@Index(
  'idx_ai_chunks_company_entity',
  ['companyId', 'entityType', 'entityId'],
  {
    where: 'deleted_at IS NULL',
  },
)
@Index('idx_ai_chunks_source_updated', ['sourceUpdatedAt'], {
  where: 'deleted_at IS NULL',
})
export class AiKnowledgeChunk {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 80 })
  entityType: string;

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId: string;

  @Column({ name: 'chunk_key', type: 'varchar', length: 160 })
  chunkKey: string;

  @Column({ name: 'chunk_index', type: 'integer', default: 0 })
  chunkIndex: number;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata: Record<string, unknown>;

  @Column({ type: 'vector', length: AI_EMBEDDING_DIMENSIONS, nullable: true })
  embedding: number[] | null;

  @Column({ name: 'embedding_model', type: 'varchar', length: 120 })
  embeddingModel: string;

  @Column({ name: 'embedding_version', type: 'integer', default: 1 })
  embeddingVersion: number;

  @Column({ name: 'content_hash', type: 'varchar', length: 64 })
  contentHash: string;

  @Column({ name: 'source_updated_at', type: 'timestamptz' })
  sourceUpdatedAt: Date;

  @Column({ name: 'embedded_at', type: 'timestamptz', nullable: true })
  embeddedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
