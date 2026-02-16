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

  async respond(prompt: string, context: AiExecutionContext) {
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

    const runner = client.chat.completions.runTools({
      model,
      messages: [
        {
          role: 'system',
          content:
            'Use the following DB relationship map as hard context for tool planning.',
        },
        { role: 'system', content: this.relationshipContext.content },
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
}
