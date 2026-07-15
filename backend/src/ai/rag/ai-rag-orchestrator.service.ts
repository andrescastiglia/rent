import { ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '../../users/entities/user.entity';
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
        if (
          context.role === UserRole.OWNER ||
          context.role === UserRole.TENANT
        ) {
          throw new ForbiddenException(
            'This role can only perform read-only AI queries',
          );
        }
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

      sources = await this.validator.filterFreshVectorSources(
        sources,
        context.companyId,
      );
      sources = await this.vector.filterAuthorized(sources, context);
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
      });
      const publicSources = sources
        .filter((source) => citedIds.includes(source.sourceId))
        .map(({ content: _content, origin: _origin, ...source }) => source);
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
}
