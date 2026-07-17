import { Injectable } from '@nestjs/common';
import { AiChatMessage } from '../dto/ai-chat-request.dto';
import { AiConversationsService } from '../ai-conversations.service';
import { AiOpenAiService } from '../ai-openai.service';
import { AiIntentClassifierService } from './ai-intent-classifier.service';
import { AiVectorRetrieverService } from './ai-vector-retriever.service';
import { AiStructuredRetrieverService } from './ai-structured-retriever.service';
import { AiEvidenceValidatorService } from './ai-evidence-validator.service';
import { AiAnswerGeneratorService } from './ai-answer-generator.service';
import { AiRagAuditService } from './ai-rag-audit.service';
import { AiRagContext, AiRagSource } from './ai-rag.types';
import { MetricsService } from '../../metrics/metrics.service';

@Injectable()
export class AiRagOrchestratorService {
  constructor(
    private readonly conversations: AiConversationsService,
    private readonly legacy: AiOpenAiService,
    private readonly classifier: AiIntentClassifierService,
    private readonly vector: AiVectorRetrieverService,
    private readonly structured: AiStructuredRetrieverService,
    private readonly validator: AiEvidenceValidatorService,
    private readonly generator: AiAnswerGeneratorService,
    private readonly audit: AiRagAuditService,
    private readonly metrics: MetricsService,
  ) {}

  async respond(params: {
    prompt: string;
    conversationId?: string;
    history?: AiChatMessage[];
    context: Omit<AiRagContext, 'conversationId'>;
    persistConversation?: boolean;
  }) {
    const conversation = await this.conversations.getOrCreateConversation({
      conversationId: params.conversationId,
      userId: params.context.userId,
      companyId: params.context.companyId,
    });
    const context: AiRagContext = {
      ...params.context,
      conversationId: conversation.id,
    };
    const history =
      params.history && params.history.length > 0
        ? params.history
        : this.conversations.toOpenAiHistory(conversation);
    const strategy = this.classifier.classify(params.prompt);
    const startedAt = Date.now();
    const persistConversation = params.persistConversation !== false;

    try {
      if (strategy === 'mutation') {
        const response = await this.legacy.respond(
          params.prompt,
          context,
          history,
        );
        const persisted = persistConversation
          ? await this.conversations.appendExchange({
              conversationId: conversation.id,
              userId: context.userId,
              userPrompt: params.prompt,
              assistantText: response.outputText,
              model: response.model,
            })
          : conversation;
        return {
          conversationId: conversation.id,
          toolState: persisted.toolState,
          ...response,
          insufficientEvidence: false,
          sources: [],
          retrieval: { strategy: 'structured' as const, resultCount: 0 },
        };
      }

      let sources: AiRagSource[] = [];
      if (strategy === 'structured') {
        sources = await this.structured.retrieve(params.prompt, context);
      } else if (strategy === 'semantic') {
        sources = await this.vector.retrieve(params.prompt, context);
      } else if (strategy === 'hybrid') {
        const [structured, vector] = await Promise.all([
          this.structured.retrieve(params.prompt, context),
          this.vector.retrieve(params.prompt, context),
        ]);
        sources = this.unique([...structured, ...vector]);
      }

      const freshSources = await this.validator.filterFreshVectorSources(
        sources,
        context.companyId,
      );
      const staleRejections = sources.length - freshSources.length;
      const authorizedSources = await this.vector.filterAuthorized(
        freshSources,
        context,
      );
      const authorizationRejections =
        freshSources.length - authorizedSources.length;
      sources = authorizedSources;
      sources = this.validator.sanitize(sources);
      const generated =
        strategy === 'unsupported'
          ? {
              answer: this.validator.abstention(),
              model:
                process.env.AI_RAG_MODEL ?? process.env.OPENAI_MODEL ?? 'none',
              usage: undefined,
            }
          : await this.generator.generate({ prompt: params.prompt, sources });
      const answer = this.validator.validate(generated.answer, sources);
      const citationFailures = Math.max(
        0,
        generated.answer.claims.length - answer.claims.length,
      );
      const persisted = persistConversation
        ? await this.conversations.appendExchange({
            conversationId: conversation.id,
            userId: context.userId,
            userPrompt: params.prompt,
            assistantText: answer.answer,
            model: generated.model,
          })
        : conversation;
      const citedIds = answer.claims.flatMap((claim) => claim.sourceIds);
      const ragRunId = await this.audit.record({
        context,
        prompt: params.prompt,
        strategy,
        sources,
        citedIds,
        insufficientEvidence: answer.insufficientEvidence,
        model: generated.model,
        usage: generated.usage,
        latencyMs: Date.now() - startedAt,
        promptOverrideAttempt: this.hasPromptOverride(params.prompt, sources),
      });
      this.metrics.recordRagRequest({
        strategy,
        outcome: 'success',
        durationMs: Date.now() - startedAt,
        retrieved: sources.length,
        abstained: answer.insufficientEvidence,
        citationFailures,
        staleRejections,
        authorizationRejections,
        promptOverrideOrigins: this.promptOverrideOrigins(
          params.prompt,
          sources,
        ),
        model: generated.model,
        inputTokens: generated.usage?.input_tokens,
        outputTokens: generated.usage?.output_tokens,
      });
      const publicSources = sources
        .filter((source) => citedIds.includes(source.sourceId))
        .map(
          ({
            content: _content,
            origin: _origin,
            retrievalScore: _retrievalScore,
            ...source
          }) => source,
        );
      return {
        conversationId: conversation.id,
        toolState: persisted.toolState,
        model: generated.model,
        outputText: answer.answer,
        insufficientEvidence: answer.insufficientEvidence,
        sources: publicSources,
        retrieval: {
          strategy:
            strategy === 'unsupported' ? ('semantic' as const) : strategy,
          resultCount: sources.length,
        },
        ...(generated.usage ? { usage: generated.usage } : {}),
        ragRunId,
      };
    } catch (error) {
      this.metrics.recordRagRequest({
        strategy,
        outcome: 'error',
        durationMs: Date.now() - startedAt,
        retrieved: 0,
        abstained: false,
      });
      const message =
        error instanceof Error ? error.message : 'AI provider request failed';
      if (persistConversation) {
        await this.conversations.appendAssistantError({
          conversationId: conversation.id,
          userId: context.userId,
          userPrompt: params.prompt,
          assistantError: message,
        });
      }
      throw error;
    }
  }

  private unique(sources: AiRagSource[]): AiRagSource[] {
    return [
      ...new Map(sources.map((source) => [source.sourceId, source])).values(),
    ];
  }

  private promptOverrideOrigins(
    prompt: string,
    sources: AiRagSource[],
  ): Array<'query' | 'evidence'> {
    const pattern =
      /\b(ignore|ignor[aá]|olvid[aá]|override|system prompt|developer message|nuevas instrucciones)\b/i;
    const origins: Array<'query' | 'evidence'> = [];
    if (pattern.test(prompt)) origins.push('query');
    if (sources.some((source) => pattern.test(source.content))) {
      origins.push('evidence');
    }
    return origins;
  }

  private hasPromptOverride(prompt: string, sources: AiRagSource[]): boolean {
    return this.promptOverrideOrigins(prompt, sources).length > 0;
  }
}
