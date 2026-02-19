import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import {
  AiConversation,
  AiConversationMessage,
} from './entities/ai-conversation.entity';

@Injectable()
export class AiConversationsService {
  constructor(
    @InjectRepository(AiConversation)
    private readonly conversationsRepo: Repository<AiConversation>,
  ) {}

  async getOrCreateConversation(params: {
    conversationId?: string;
    userId: string;
    companyId?: string;
  }): Promise<AiConversation> {
    if (params.conversationId) {
      const conversation = await this.conversationsRepo.findOne({
        where: { id: params.conversationId },
      });

      if (!conversation) {
        throw new NotFoundException('Conversation not found');
      }

      if (conversation.userId !== params.userId) {
        throw new ForbiddenException(
          'Conversation is not accessible for current user',
        );
      }

      return conversation;
    }

    const created = this.conversationsRepo.create({
      companyId: params.companyId ?? null,
      userId: params.userId,
      messages: [],
      toolState: {},
      lastActivityAt: new Date(),
    });

    return this.conversationsRepo.save(created);
  }

  async getConversationById(params: {
    conversationId: string;
    userId: string;
  }): Promise<AiConversation> {
    const conversation = await this.conversationsRepo.findOne({
      where: { id: params.conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.userId !== params.userId) {
      throw new ForbiddenException(
        'Conversation is not accessible for current user',
      );
    }

    return conversation;
  }

  async appendAssistantError(params: {
    conversationId: string;
    userId: string;
    userPrompt: string;
    assistantError: string;
  }): Promise<AiConversation> {
    const conversation = await this.getConversationById({
      conversationId: params.conversationId,
      userId: params.userId,
    });

    const newMessages: AiConversationMessage[] = [
      ...conversation.messages,
      {
        id: randomUUID(),
        role: 'user',
        content: params.userPrompt,
        createdAt: new Date().toISOString(),
      },
      {
        id: randomUUID(),
        role: 'assistant',
        content: params.assistantError,
        createdAt: new Date().toISOString(),
      },
    ];

    conversation.messages = newMessages;
    conversation.lastActivityAt = new Date();

    return this.conversationsRepo.save(conversation);
  }

  async appendExchange(params: {
    conversationId: string;
    userId: string;
    userPrompt: string;
    assistantText: string;
    model?: string;
  }): Promise<AiConversation> {
    const conversation = await this.getConversationById({
      conversationId: params.conversationId,
      userId: params.userId,
    });

    const newMessages: AiConversationMessage[] = [
      ...conversation.messages,
      {
        id: randomUUID(),
        role: 'user',
        content: params.userPrompt,
        createdAt: new Date().toISOString(),
      },
      {
        id: randomUUID(),
        role: 'assistant',
        content: params.assistantText,
        model: params.model ?? null,
        createdAt: new Date().toISOString(),
      },
    ];

    conversation.messages = newMessages;
    conversation.lastActivityAt = new Date();

    return this.conversationsRepo.save(conversation);
  }

  async mergeToolState(params: {
    conversationId: string;
    userId: string;
    patch: Record<string, unknown>;
  }): Promise<AiConversation> {
    const conversation = await this.getConversationById({
      conversationId: params.conversationId,
      userId: params.userId,
    });

    conversation.toolState = this.deepMerge(
      (conversation.toolState ?? {}) as Record<string, unknown>,
      params.patch,
    );
    conversation.lastActivityAt = new Date();

    return this.conversationsRepo.save(conversation);
  }

  async clearToolStateKeys(params: {
    conversationId: string;
    userId: string;
    keys: string[];
  }): Promise<AiConversation> {
    const conversation = await this.getConversationById({
      conversationId: params.conversationId,
      userId: params.userId,
    });

    const next = { ...(conversation.toolState ?? {}) } as Record<
      string,
      unknown
    >;
    for (const key of params.keys) {
      delete next[key];
    }
    conversation.toolState = next;
    conversation.lastActivityAt = new Date();

    return this.conversationsRepo.save(conversation);
  }

  toOpenAiHistory(
    conversation: AiConversation,
    limit = 20,
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    const items = conversation.messages
      .slice(Math.max(conversation.messages.length - limit, 0))
      .filter(
        (message) =>
          (message.role === 'user' || message.role === 'assistant') &&
          typeof message.content === 'string' &&
          message.content.trim().length > 0,
      )
      .map((message) => ({ role: message.role, content: message.content }));

    return items;
  }

  private deepMerge(
    target: Record<string, unknown>,
    source: Record<string, unknown>,
  ): Record<string, unknown> {
    const output: Record<string, unknown> = { ...target };
    for (const [key, value] of Object.entries(source)) {
      if (this.isPlainObject(output[key]) && this.isPlainObject(value)) {
        output[key] = this.deepMerge(
          output[key] as Record<string, unknown>,
          value as Record<string, unknown>,
        );
        continue;
      }
      output[key] = value;
    }
    return output;
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
