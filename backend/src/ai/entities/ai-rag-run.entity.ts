import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('ai_rag_runs')
@Index('idx_ai_rag_runs_company_created', ['companyId', 'createdAt'])
@Index(
  'idx_ai_rag_runs_conversation_created',
  ['conversationId', 'createdAt'],
  {
    where: 'conversation_id IS NOT NULL',
  },
)
export class AiRagRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'conversation_id', type: 'uuid', nullable: true })
  conversationId: string | null;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 30 })
  role: string;

  @Column({ type: 'varchar', length: 30 })
  strategy: string;

  @Column({ name: 'query_hash', type: 'varchar', length: 64 })
  queryHash: string;

  @Column({
    name: 'retrieved_chunk_ids',
    type: 'uuid',
    array: true,
    default: () => "'{}'::uuid[]",
  })
  retrievedChunkIds: string[];

  @Column({
    name: 'cited_chunk_ids',
    type: 'uuid',
    array: true,
    default: () => "'{}'::uuid[]",
  })
  citedChunkIds: string[];

  @Column({ name: 'insufficient_evidence', type: 'boolean', default: false })
  insufficientEvidence: boolean;

  @Column({ type: 'varchar', length: 120, nullable: true })
  model: string | null;

  @Column({ name: 'prompt_version', type: 'varchar', length: 50 })
  promptVersion: string;

  @Column({ name: 'input_tokens', type: 'integer', nullable: true })
  inputTokens: number | null;

  @Column({ name: 'output_tokens', type: 'integer', nullable: true })
  outputTokens: number | null;

  @Column({ name: 'latency_ms', type: 'integer', nullable: true })
  latencyMs: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
