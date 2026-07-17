import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { Repository } from 'typeorm';
import { AiRagRun } from '../entities/ai-rag-run.entity';
import { AI_RAG_PROMPT_VERSION } from './ai-answer-generator.service';
import {
  AiRagContext,
  AiRagSource,
  AiRagStrategy,
  AiRagUsage,
} from './ai-rag.types';

@Injectable()
export class AiRagAuditService {
  private readonly logger = new Logger(AiRagAuditService.name);

  constructor(
    @InjectRepository(AiRagRun)
    private readonly runs: Repository<AiRagRun>,
  ) {}

  async record(params: {
    context: AiRagContext;
    prompt: string;
    strategy: AiRagStrategy;
    sources: AiRagSource[];
    citedIds: string[];
    insufficientEvidence: boolean;
    model: string;
    usage?: AiRagUsage;
    latencyMs: number;
    promptOverrideAttempt?: boolean;
  }): Promise<string | null> {
    try {
      const saved = await this.runs.save(
        this.runs.create({
          conversationId: params.context.conversationId,
          companyId: params.context.companyId,
          userId: params.context.userId,
          role: params.context.role,
          strategy: params.strategy,
          queryHash: createHash('sha256').update(params.prompt).digest('hex'),
          retrievedChunkIds: params.sources.map((source) => source.sourceId),
          citedChunkIds: [...new Set(params.citedIds)],
          insufficientEvidence: params.insufficientEvidence,
          model: params.model,
          promptVersion: AI_RAG_PROMPT_VERSION,
          inputTokens: this.token(params.usage?.input_tokens),
          outputTokens: this.token(params.usage?.output_tokens),
          latencyMs: Math.max(0, Math.round(params.latencyMs)),
          promptOverrideAttempt: params.promptOverrideAttempt === true,
        }),
      );
      return saved.id;
    } catch (error) {
      this.logger.error(
        `Could not persist RAG audit: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private token(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
}
