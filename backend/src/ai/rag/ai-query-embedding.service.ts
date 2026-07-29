import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import OpenAI from 'openai';
import { AI_EMBEDDING_DIMENSIONS } from '../entities/ai-knowledge-chunk.entity';

@Injectable()
export class AiQueryEmbeddingService {
  async embed(input: string): Promise<number[]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException('OPENAI_API_KEY is not configured');
    }
    const dimensions = Number(
      process.env.AI_EMBEDDING_DIMENSIONS ?? AI_EMBEDDING_DIMENSIONS,
    );
    if (dimensions !== AI_EMBEDDING_DIMENSIONS) {
      throw new ServiceUnavailableException(
        `AI_EMBEDDING_DIMENSIONS must be ${AI_EMBEDDING_DIMENSIONS}`,
      );
    }
    const client = new OpenAI({
      apiKey,
      ...(process.env.OPENAI_BASE_URL
        ? { baseURL: process.env.OPENAI_BASE_URL }
        : {}),
      timeout: Number(process.env.AI_EMBEDDING_TIMEOUT_MS ?? 60_000),
      maxRetries: 2,
    });
    const configuredMaxAttempts = Number(
      process.env.AI_EMBEDDING_MAX_ATTEMPTS ?? 5,
    );
    const maxAttempts =
      Number.isInteger(configuredMaxAttempts) && configuredMaxAttempts > 0
        ? configuredMaxAttempts
        : 5;
    const configuredRetryBaseMs = Number(
      process.env.AI_EMBEDDING_RETRY_BASE_MS ?? 250,
    );
    const retryBaseMs =
      Number.isFinite(configuredRetryBaseMs) && configuredRetryBaseMs >= 0
        ? configuredRetryBaseMs
        : 250;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await client.embeddings.create({
          model: process.env.AI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
          input: input.replace(/\s+/g, ' ').trim(),
          encoding_format: 'float',
          dimensions,
        });
        return response.data[0].embedding;
      } catch (error) {
        lastError = error;
        if (attempt === maxAttempts || !this.isRetryable(error)) throw error;
        await new Promise((resolve) =>
          setTimeout(resolve, retryBaseMs * 2 ** (attempt - 1)),
        );
      }
    }
    throw lastError;
  }

  private isRetryable(error: unknown): boolean {
    const status =
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof error.status === 'number'
        ? error.status
        : undefined;
    const message = error instanceof Error ? error.message : String(error);
    return (
      status === 408 ||
      status === 409 ||
      status === 429 ||
      (status !== undefined && status >= 500) ||
      (status === 404 && /invalid url.*embeddings/i.test(message))
    );
  }
}
