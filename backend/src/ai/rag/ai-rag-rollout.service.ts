import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { Repository } from 'typeorm';
import {
  UserModulePermissions,
  UserRole,
} from '../../users/entities/user.entity';
import { AiConversationsService } from '../ai-conversations.service';
import { AiOpenAiService } from '../ai-openai.service';
import { AiChatMessage } from '../dto/ai-chat-request.dto';
import { AiRagShadowComparison } from '../entities/ai-rag-shadow-comparison.entity';
import { AiIntentClassifierService } from './ai-intent-classifier.service';
import { AiRagOrchestratorService } from './ai-rag-orchestrator.service';

export type AiRetrievalMode = 'TOOLS' | 'RAG_SHADOW' | 'RAG_READ' | 'HYBRID';

type RolloutContext = {
  userId: string;
  companyId: string;
  role: UserRole;
  permissions?: UserModulePermissions;
};

type RolloutParams = {
  prompt: string;
  conversationId?: string;
  history?: AiChatMessage[];
  context: RolloutContext;
};

type RagResult = {
  conversationId: string;
  model: string;
  outputText: string;
  insufficientEvidence: boolean;
  sources: Array<{ sourceId: string }>;
  retrieval: { strategy: string; resultCount: number };
  ragRunId?: string | null;
  toolState?: Record<string, unknown>;
  usage?: Record<string, unknown>;
};

@Injectable()
export class AiRagRolloutService {
  private readonly logger = new Logger(AiRagRolloutService.name);

  constructor(
    private readonly conversations: AiConversationsService,
    private readonly legacy: AiOpenAiService,
    private readonly rag: AiRagOrchestratorService,
    private readonly classifier: AiIntentClassifierService,
    @InjectRepository(AiRagShadowComparison)
    private readonly comparisons: Repository<AiRagShadowComparison>,
  ) {}

  async respond(params: RolloutParams) {
    const mode = this.getEffectiveMode(params.context.companyId);
    if (mode === 'TOOLS') return this.respondTools(params, mode);

    if (mode === 'RAG_SHADOW') {
      if (this.classifier.classify(params.prompt) === 'mutation') {
        return this.respondTools(params, mode);
      }
      return this.respondShadow(params);
    }

    const response = (await this.rag.respond(params)) as RagResult;
    const { ragRunId: _ragRunId, ...publicResponse } = response;
    return { ...publicResponse, retrievalMode: mode };
  }

  getEffectiveMode(companyId: string): AiRetrievalMode {
    const configured = String(
      process.env.AI_RETRIEVAL_MODE ?? 'TOOLS',
    ).toUpperCase();
    const mode: AiRetrievalMode = [
      'TOOLS',
      'RAG_SHADOW',
      'RAG_READ',
      'HYBRID',
    ].includes(configured)
      ? (configured as AiRetrievalMode)
      : 'TOOLS';
    if (mode === 'TOOLS') return mode;
    const enabled = new Set(
      String(process.env.AI_RAG_ENABLED_COMPANY_IDS ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    );
    return enabled.has('*') || enabled.has(companyId) ? mode : 'TOOLS';
  }

  private async respondShadow(params: RolloutParams) {
    const conversation = await this.conversations.getOrCreateConversation({
      conversationId: params.conversationId,
      userId: params.context.userId,
      companyId: params.context.companyId,
    });
    const shared = { ...params, conversationId: conversation.id };
    const toolsStarted = Date.now();
    const toolsPromise = this.respondTools(shared, 'RAG_SHADOW');
    const ragStarted = Date.now();
    const ragPromise = this.rag.respond({
      ...shared,
      persistConversation: false,
    });
    const [tools, rag] = await Promise.allSettled([toolsPromise, ragPromise]);
    const toolsLatencyMs = Date.now() - toolsStarted;
    const ragLatencyMs = Date.now() - ragStarted;

    if (tools.status === 'rejected') {
      await this.saveComparison(params, {
        conversationId: conversation.id,
        status: 'tools_failed',
        rag: rag.status === 'fulfilled' ? (rag.value as RagResult) : null,
        tools: null,
        toolsLatencyMs,
        ragLatencyMs,
        error: tools.reason,
      });
      throw tools.reason;
    }
    if (rag.status === 'rejected') {
      await this.saveComparison(params, {
        conversationId: conversation.id,
        status: 'rag_failed',
        rag: null,
        tools: tools.value,
        toolsLatencyMs,
        ragLatencyMs,
        error: rag.reason,
      });
      this.logger.warn('RAG shadow failed; serving legacy tools response');
      return { ...tools.value, retrievalMode: 'RAG_SHADOW' as const };
    }

    await this.saveComparison(params, {
      conversationId: conversation.id,
      status: 'compared',
      rag: rag.value as RagResult,
      tools: tools.value,
      toolsLatencyMs,
      ragLatencyMs,
      error: null,
    });
    return { ...tools.value, retrievalMode: 'RAG_SHADOW' as const };
  }

  private async respondTools(params: RolloutParams, mode: AiRetrievalMode) {
    const conversation = await this.conversations.getOrCreateConversation({
      conversationId: params.conversationId,
      userId: params.context.userId,
      companyId: params.context.companyId,
    });
    const history =
      params.history && params.history.length > 0
        ? params.history
        : this.conversations.toOpenAiHistory(conversation);
    try {
      const response = await this.legacy.respond(
        params.prompt,
        {
          ...params.context,
          conversationId: conversation.id,
        },
        history,
      );
      const persisted = await this.conversations.appendExchange({
        conversationId: conversation.id,
        userId: params.context.userId,
        userPrompt: params.prompt,
        assistantText: response.outputText,
        model: response.model,
      });
      return {
        conversationId: conversation.id,
        toolState: persisted.toolState,
        ...response,
        insufficientEvidence: false,
        sources: [],
        retrieval: { strategy: 'structured' as const, resultCount: 0 },
        retrievalMode: mode,
      };
    } catch (error) {
      await this.conversations.appendAssistantError({
        conversationId: conversation.id,
        userId: params.context.userId,
        userPrompt: params.prompt,
        assistantError:
          error instanceof Error ? error.message : 'AI provider request failed',
      });
      throw error;
    }
  }

  private async saveComparison(
    params: RolloutParams,
    result: {
      conversationId: string;
      status: 'compared' | 'rag_failed' | 'tools_failed';
      rag: RagResult | null;
      tools: { outputText: string } | null;
      toolsLatencyMs: number;
      ragLatencyMs: number;
      error: unknown;
    },
  ): Promise<void> {
    const toolsText = result.tools?.outputText ?? null;
    const ragText = result.rag?.outputText ?? null;
    await this.comparisons.save(
      this.comparisons.create({
        ragRunId: result.rag?.ragRunId ?? null,
        conversationId: result.conversationId,
        companyId: params.context.companyId,
        userId: params.context.userId,
        role: params.context.role,
        queryHash: this.hash(params.prompt),
        toolsOutputHash: toolsText === null ? null : this.hash(toolsText),
        ragOutputHash: ragText === null ? null : this.hash(ragText),
        lexicalSimilarity:
          toolsText === null || ragText === null
            ? null
            : this.jaccard(toolsText, ragText),
        ragSourceCount: result.rag?.sources.length ?? 0,
        ragInsufficientEvidence: result.rag?.insufficientEvidence ?? null,
        toolsLatencyMs: result.toolsLatencyMs,
        ragLatencyMs: result.ragLatencyMs,
        status: result.status,
        errorCode: result.error ? this.errorCode(result.error) : null,
      }),
    );
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private jaccard(left: string, right: string): number {
    const tokens = (value: string) =>
      new Set(value.toLocaleLowerCase('es').match(/[a-záéíóúñ0-9]+/g) ?? []);
    const a = tokens(left);
    const b = tokens(right);
    if (a.size === 0 && b.size === 0) return 1;
    const intersection = [...a].filter((token) => b.has(token)).length;
    return intersection / new Set([...a, ...b]).size;
  }

  private errorCode(error: unknown): string {
    if (error && typeof error === 'object' && 'code' in error) {
      return String((error as { code?: unknown }).code ?? 'unknown').slice(
        0,
        80,
      );
    }
    return error instanceof Error ? error.name.slice(0, 80) : 'unknown';
  }
}
