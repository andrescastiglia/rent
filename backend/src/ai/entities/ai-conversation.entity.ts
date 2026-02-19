import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AiConversationMessageRole = 'user' | 'assistant';

export type AiConversationMessage = {
  id: string;
  role: AiConversationMessageRole;
  content: string;
  model?: string | null;
  createdAt: string;
};

@Entity('ai_conversations')
@Index('idx_ai_conversations_user_updated', ['userId', 'updatedAt'])
@Index('idx_ai_conversations_company_updated', ['companyId', 'updatedAt'])
export class AiConversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', nullable: true })
  companyId: string | null;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  messages: AiConversationMessage[];

  @Column({ name: 'tool_state', type: 'jsonb', default: () => "'{}'::jsonb" })
  toolState: Record<string, unknown>;

  @Column({ name: 'last_activity_at', type: 'timestamptz', nullable: true })
  lastActivityAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
