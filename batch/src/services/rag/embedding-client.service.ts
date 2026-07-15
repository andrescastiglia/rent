import OpenAI from "openai";
import { batchMetrics } from "../../shared/metrics";
import {
  EmbeddingBatchResult,
  RAG_DEFAULT_EMBEDDING_MODEL,
  RAG_EMBEDDING_DIMENSIONS,
} from "./rag-types";

interface EmbeddingsApi {
  embeddings: {
    create(input: {
      model: string;
      input: string[];
      dimensions: number;
      encoding_format: "float";
    }): Promise<{
      data: Array<{ embedding: number[]; index: number }>;
      model: string;
      usage?: { prompt_tokens?: number; total_tokens?: number };
    }>;
  };
}

export interface EmbeddingClientOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  dimensions?: number;
  requestBatchSize?: number;
  maxAttempts?: number;
  client?: EmbeddingsApi;
  sleep?: (milliseconds: number) => Promise<void>;
}

export class EmbeddingClientService {
  readonly model: string;
  readonly dimensions: number;
  readonly requestBatchSize: number;
  private readonly maxAttempts: number;
  private readonly client: EmbeddingsApi;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(options: EmbeddingClientOptions = {}) {
    this.model =
      options.model ??
      process.env.AI_EMBEDDING_MODEL ??
      RAG_DEFAULT_EMBEDDING_MODEL;
    this.dimensions =
      options.dimensions ??
      Number(process.env.AI_EMBEDDING_DIMENSIONS ?? RAG_EMBEDDING_DIMENSIONS);
    this.requestBatchSize =
      options.requestBatchSize ??
      Number(process.env.AI_EMBEDDING_REQUEST_BATCH_SIZE ?? 64);
    this.maxAttempts =
      options.maxAttempts ?? Number(process.env.AI_EMBEDDING_MAX_ATTEMPTS ?? 5);
    this.sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));

    if (this.dimensions !== RAG_EMBEDDING_DIMENSIONS) {
      throw new Error(
        `AI_EMBEDDING_DIMENSIONS must be ${RAG_EMBEDDING_DIMENSIONS} for schema v1`,
      );
    }
    if (!Number.isInteger(this.requestBatchSize) || this.requestBatchSize < 1) {
      throw new Error(
        "AI_EMBEDDING_REQUEST_BATCH_SIZE must be a positive integer",
      );
    }

    if (options.client) {
      this.client = options.client;
      return;
    }

    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required to generate embeddings");
    }
    this.client = new OpenAI({
      apiKey,
      baseURL: options.baseURL ?? process.env.OPENAI_BASE_URL,
      timeout: Number(process.env.AI_EMBEDDING_TIMEOUT_MS ?? 60_000),
      maxRetries: 0,
    });
  }

  async embed(inputs: string[]): Promise<EmbeddingBatchResult> {
    if (inputs.length === 0) {
      return { embeddings: [], tokens: 0, model: this.model };
    }

    const embeddings: number[][] = [];
    let tokens = 0;
    for (let index = 0; index < inputs.length; index += this.requestBatchSize) {
      const batch = inputs.slice(index, index + this.requestBatchSize);
      const result = await this.requestWithRetry(batch);
      embeddings.push(...result.embeddings);
      tokens += result.tokens;
    }
    return { embeddings, tokens, model: this.model };
  }

  private async requestWithRetry(
    inputs: string[],
  ): Promise<EmbeddingBatchResult> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const startedAt = Date.now();
      try {
        const response = await this.client.embeddings.create({
          model: this.model,
          input: inputs,
          dimensions: this.dimensions,
          encoding_format: "float",
        });
        const ordered = [...response.data].sort(
          (left, right) => left.index - right.index,
        );
        if (ordered.length !== inputs.length) {
          throw new Error(
            `Embedding response count mismatch: expected ${inputs.length}, received ${ordered.length}`,
          );
        }
        const embeddings = ordered.map(({ embedding }, index) => {
          if (embedding.length !== this.dimensions) {
            throw new Error(
              `Embedding ${index} has ${embedding.length} dimensions; expected ${this.dimensions}`,
            );
          }
          return embedding;
        });
        const tokens =
          response.usage?.prompt_tokens ?? response.usage?.total_tokens ?? 0;
        batchMetrics.recordEmbeddingRequest({
          model: this.model,
          outcome: "success",
          durationMs: Date.now() - startedAt,
          tokens,
        });
        return {
          embeddings,
          tokens,
          model: response.model || this.model,
        };
      } catch (error) {
        batchMetrics.recordEmbeddingRequest({
          model: this.model,
          outcome: "error",
          durationMs: Date.now() - startedAt,
        });
        lastError = error;
        if (!this.isTransient(error) || attempt === this.maxAttempts) {
          throw error;
        }
        const exponential = Math.min(30_000, 500 * 2 ** (attempt - 1));
        const jitter = Math.floor(Math.random() * 250);
        await this.sleep(exponential + jitter);
      }
    }
    throw lastError;
  }

  private isTransient(error: unknown): boolean {
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? Number((error as { status?: unknown }).status)
        : undefined;
    return (
      status === 408 ||
      status === 409 ||
      status === 429 ||
      (status !== undefined && status >= 500) ||
      (error instanceof Error &&
        /timeout|network|ECONNRESET|ETIMEDOUT/i.test(error.message))
    );
  }
}
