import {
  BadGatewayException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import OpenAI from 'openai';
import { AiToolsRegistryService } from './ai-tools-registry.service';
import { AiExecutionContext } from './types/ai-tool.types';
import { AiChatMessage } from './dto/ai-chat-request.dto';
import { UserRole } from '../users/entities/user.entity';

type OpenAiApiErrorShape = {
  status?: number;
  message?: string;
  requestID?: string;
  code?: string;
  type?: string;
  error?: {
    message?: string;
    code?: string;
    type?: string;
  };
};

const AI_RELATIONSHIP_MD_FILENAME = 'ai-domain-relationships.md';
const RELATIONSHIP_CONTEXT_FALLBACK = `
You are an assistant for a property management backend.
Always reason using entity relationships and IDs.
Resolve names to IDs first. Do not invent records.
Group results by relationship path (owner -> properties -> leases -> invoices/payments, tenant -> leases -> properties -> payments/invoices/activities).
Prefer readonly tools unless the user explicitly asks to mutate data.
`.trim();

type RelationshipContext = {
  content: string;
  source: 'file' | 'fallback';
};

function loadRelationshipContext(): RelationshipContext {
  const candidates = [
    join(__dirname, AI_RELATIONSHIP_MD_FILENAME),
    join(process.cwd(), 'src', 'ai', AI_RELATIONSHIP_MD_FILENAME),
  ];

  for (const filePath of candidates) {
    if (!existsSync(filePath)) {
      continue;
    }

    try {
      const content = readFileSync(filePath, 'utf8').trim();
      if (content.length > 0) {
        return { content, source: 'file' };
      }
    } catch {
      continue;
    }
  }

  return { content: RELATIONSHIP_CONTEXT_FALLBACK, source: 'fallback' };
}

@Injectable()
export class AiOpenAiService {
  private readonly logger = new Logger(AiOpenAiService.name);
  private readonly relationshipContext = loadRelationshipContext();

  constructor(private readonly registry: AiToolsRegistryService) {
    if (this.relationshipContext.source === 'fallback') {
      this.logger.warn(
        `AI relationship context file "${AI_RELATIONSHIP_MD_FILENAME}" not found; using fallback context`,
      );
    }
  }

  async respond(
    prompt: string,
    context: AiExecutionContext,
    history?: AiChatMessage[],
  ) {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL;
    const baseURL = process.env.OPENAI_BASE_URL;

    if (!apiKey) {
      throw new ServiceUnavailableException(
        'OPENAI_API_KEY is not configured in backend environment',
      );
    }

    if (!model) {
      throw new ServiceUnavailableException(
        'OPENAI_MODEL is not configured in backend environment',
      );
    }

    const client = new OpenAI({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
    });

    const conversationHistory: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
      (history ?? []).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const rolePreamble = this.buildRolePreamble(context.role);

    const runner = client.chat.completions.runTools({
      model,
      messages: [
        {
          role: 'system',
          content:
            'Use the following DB relationship map as hard context for tool planning.',
        },
        { role: 'system', content: this.relationshipContext.content },
        { role: 'system', content: rolePreamble },
        ...conversationHistory,
        { role: 'user', content: prompt },
      ],
      tools: this.registry.getOpenAiTools(context, prompt),
    });

    try {
      const [content, completion, usage] = await Promise.all([
        runner.finalContent(),
        runner.finalChatCompletion(),
        runner.totalUsage(),
      ]);

      return {
        model: completion.model,
        outputText: content ?? '',
        usage,
      };
    } catch (error) {
      throw this.mapProviderError(error);
    }
  }

  private mapProviderError(error: unknown): HttpException {
    if (error instanceof HttpException) {
      return error;
    }

    if (this.isOpenAiApiError(error)) {
      const status = this.normalizeStatus(error.status);
      const message =
        error.error?.message ||
        error.message ||
        'OpenAI request failed unexpectedly';
      const code = error.error?.code || error.code || null;
      const type = error.error?.type || error.type || null;
      const requestId = error.requestID ?? null;

      const requestIdSuffix = requestId ? ` [${requestId}]` : '';
      const logMessage = `OpenAI provider error (${status})${requestIdSuffix}: ${message}`;

      if (status >= 500) {
        this.logger.error(logMessage);
      } else {
        this.logger.warn(logMessage);
      }

      return new HttpException(
        {
          statusCode: status,
          message,
          error: 'OpenAIError',
          provider: 'openai',
          code,
          type,
          requestId,
        },
        status,
      );
    }

    const genericMessage =
      error instanceof Error ? error.message : 'AI provider request failed';
    this.logger.error(`Unexpected AI provider error: ${genericMessage}`);
    return new BadGatewayException({
      statusCode: 502,
      message: genericMessage,
      error: 'BadGateway',
      provider: 'openai',
    });
  }

  private normalizeStatus(status: unknown): number {
    if (typeof status !== 'number') {
      return 502;
    }

    if (status < 400 || status > 599) {
      return 502;
    }

    return status;
  }

  private isOpenAiApiError(error: unknown): error is OpenAiApiErrorShape {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const candidate = error as Record<string, unknown>;
    return (
      'status' in candidate ||
      'requestID' in candidate ||
      'error' in candidate ||
      'code' in candidate ||
      'type' in candidate
    );
  }

  private buildRolePreamble(role: UserRole): string {
    switch (role) {
      case UserRole.ADMIN:
        return [
          'The user is an ADMIN with full access to all entities and operations.',
          'They manage properties, owners, tenants, leases, payments, invoices, settlements, interested prospects, sales, and staff.',
          'They can create, update, and delete any record. Proactively provide detailed data and actionable summaries.',
        ].join(' ');

      case UserRole.STAFF:
        return [
          'The user is a STAFF member with broad operational access.',
          'They handle day-to-day property management: leases, payments, invoices, interested prospects, visits, and activities.',
          'They can create and modify most records but cannot manage users or company settings.',
          'Focus on operational efficiency and clear status updates.',
        ].join(' ');

      case UserRole.OWNER:
        return [
          'The user is a property OWNER.',
          'They can view their own properties, leases, tenants, invoices, payments, and settlements.',
          "They CANNOT see other owners' data or manage the interested pipeline.",
          'Focus responses on their portfolio: rental income, pending payments, settlement status, and property occupancy.',
          'All queries are automatically scoped to their properties.',
        ].join(' ');

      case UserRole.TENANT:
        return [
          'The user is a TENANT.',
          'They can view their own leases, invoices, payments, balance (cuenta corriente), and receipts.',
          "They CANNOT see other tenants' data, property listings, or owner information.",
          'Focus responses on their obligations: upcoming payments, current balance, lease details, and payment history.',
          'All queries are automatically scoped to their tenant account.',
        ].join(' ');

      default:
        return 'The user has limited access. Only show data they are authorized to view.';
    }
  }
}
