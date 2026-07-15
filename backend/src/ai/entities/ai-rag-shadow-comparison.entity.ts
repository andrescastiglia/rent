import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('ai_rag_shadow_comparisons')
@Index('idx_ai_rag_shadow_company_created', ['companyId', 'createdAt'])
@Index('idx_ai_rag_shadow_status_created', ['status', 'createdAt'])
export class AiRagShadowComparison {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'rag_run_id', type: 'uuid', nullable: true }) ragRunId:
    string | null;
  @Column({ name: 'conversation_id', type: 'uuid', nullable: true })
  conversationId: string | null;
  @Column({ name: 'company_id', type: 'uuid' }) companyId: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId: string;
  @Column({ type: 'varchar', length: 30 }) role: string;
  @Column({ name: 'query_hash', type: 'varchar', length: 64 })
  queryHash: string;
  @Column({
    name: 'tools_output_hash',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  toolsOutputHash: string | null;
  @Column({
    name: 'rag_output_hash',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  ragOutputHash: string | null;
  @Column({
    name: 'lexical_similarity',
    type: 'numeric',
    precision: 6,
    scale: 5,
    nullable: true,
  })
  lexicalSimilarity: number | null;
  @Column({ name: 'rag_source_count', type: 'integer', default: 0 })
  ragSourceCount: number;
  @Column({
    name: 'rag_insufficient_evidence',
    type: 'boolean',
    nullable: true,
  })
  ragInsufficientEvidence: boolean | null;
  @Column({ name: 'tools_latency_ms', type: 'integer', nullable: true })
  toolsLatencyMs: number | null;
  @Column({ name: 'rag_latency_ms', type: 'integer', nullable: true })
  ragLatencyMs: number | null;
  @Column({ type: 'varchar', length: 20 }) status:
    'compared' | 'rag_failed' | 'tools_failed';
  @Column({ name: 'error_code', type: 'varchar', length: 80, nullable: true })
  errorCode: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
