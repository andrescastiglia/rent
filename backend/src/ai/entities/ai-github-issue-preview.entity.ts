import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('ai_github_issue_previews')
@Index('idx_ai_github_issue_previews_user_expires', ['userId', 'expiresAt'])
export class AiGithubIssuePreview {
  @PrimaryColumn({ name: 'preview_id', type: 'uuid' })
  previewId: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'company_id', nullable: true })
  companyId: string | null;

  @Column({ name: 'conversation_id', nullable: true })
  conversationId: string | null;

  @Column({ type: 'jsonb' })
  draft: Record<string, unknown>;

  @Column({ name: 'similar_issues', type: 'jsonb' })
  similarIssues: Record<string, unknown>[];

  @Column({ type: 'jsonb' })
  recommendation: Record<string, unknown>;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
