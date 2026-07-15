import { ServiceUnavailableException } from '@nestjs/common';
import { AI_EMBEDDING_DIMENSIONS } from '../entities/ai-knowledge-chunk.entity';
import { AiQueryEmbeddingService } from './ai-query-embedding.service';

const createMock = jest.fn();
const openAiConstructor = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: class OpenAIMock {
    embeddings = { create: (...args: unknown[]) => createMock(...args) };

    constructor(options: unknown) {
      openAiConstructor(options);
    }
  },
}));

describe('AiQueryEmbeddingService', () => {
  const originalEnv = process.env;
  const service = new AiQueryEmbeddingService();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.AI_EMBEDDING_DIMENSIONS;
    delete process.env.AI_EMBEDDING_MODEL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('requires an API key', async () => {
    await expect(service.embed('consulta')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects dimensions incompatible with the database schema', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.AI_EMBEDDING_DIMENSIONS = '10';

    await expect(service.embed('consulta')).rejects.toThrow(
      `must be ${AI_EMBEDDING_DIMENSIONS}`,
    );
  });

  it('normalizes input and returns the provider embedding', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_BASE_URL = 'https://proxy.example';
    process.env.AI_EMBEDDING_MODEL = 'embedding-model';
    createMock.mockResolvedValue({ data: [{ embedding: [0.1, 0.2] }] });

    await expect(service.embed('  una\n consulta   limpia  ')).resolves.toEqual(
      [0.1, 0.2],
    );
    expect(openAiConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'test-key',
        baseURL: 'https://proxy.example',
      }),
    );
    expect(createMock).toHaveBeenCalledWith({
      model: 'embedding-model',
      input: 'una consulta limpia',
      encoding_format: 'float',
      dimensions: AI_EMBEDDING_DIMENSIONS,
    });
  });
});
