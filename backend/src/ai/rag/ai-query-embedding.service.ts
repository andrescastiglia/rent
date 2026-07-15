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
    const response = await client.embeddings.create({
      model: process.env.AI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
      input: input.replace(/\s+/g, ' ').trim(),
      encoding_format: 'float',
      dimensions,
    });
    return response.data[0].embedding;
  }
}
