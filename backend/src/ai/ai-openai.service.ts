import {
  BadGatewayException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
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

@Injectable()
export class AiOpenAiService {
  private readonly logger = new Logger(AiOpenAiService.name);

  constructor(private readonly registry: AiToolsRegistryService) {}

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
      messages: [{ role: 'user', content: prompt }],
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

      if (status >= 500) {
        this.logger.error(
          `OpenAI provider error (${status})${requestId ? ` [${requestId}]` : ''}: ${message}`,
        );
      } else {
        this.logger.warn(
          `OpenAI provider error (${status})${requestId ? ` [${requestId}]` : ''}: ${message}`,
        );
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
