import {
  BadGatewayException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { UserRole } from '../users/entities/user.entity';
import { AiToolsRegistryService } from './ai-tools-registry.service';
import { AiOpenAiService } from './ai-openai.service';

const runToolsMock = jest.fn();
const openAiCtorMock = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: class OpenAIMock {
    chat = {
      completions: {
        runTools: (...args: unknown[]) => runToolsMock(...args),
      },
    };

    constructor(config: unknown) {
      openAiCtorMock(config);
    }
  },
}));

describe('AiOpenAiService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    delete process.env.OPENAI_BASE_URL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('respond throws when OPENAI_API_KEY is missing', async () => {
    const service = new AiOpenAiService({} as AiToolsRegistryService);

    await expect(
      service.respond('hola', {
        userId: 'u1',
        companyId: 'c1',
        role: UserRole.ADMIN,
      } as any),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('respond throws when OPENAI_MODEL is missing', async () => {
    process.env.OPENAI_API_KEY = 'key';
    const service = new AiOpenAiService({} as AiToolsRegistryService);

    await expect(
      service.respond('hola', {
        userId: 'u1',
        companyId: 'c1',
        role: UserRole.ADMIN,
      } as any),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('respond builds request with history/tools and returns provider output', async () => {
    process.env.OPENAI_API_KEY = 'key-1';
    process.env.OPENAI_MODEL = 'gpt-test';
    process.env.OPENAI_BASE_URL = 'https://proxy.example';

    const registry = {
      getOpenAiTools: jest.fn().mockReturnValue([{ type: 'function' }]),
    } as unknown as AiToolsRegistryService;

    runToolsMock.mockReturnValue({
      finalContent: jest.fn().mockResolvedValue('ok'),
      finalChatCompletion: jest.fn().mockResolvedValue({ model: 'gpt-test' }),
      totalUsage: jest.fn().mockResolvedValue({ total_tokens: 10 }),
    });

    const service = new AiOpenAiService(registry);
    const result = await service.respond(
      'estado de pagos',
      {
        userId: 'u1',
        companyId: 'c1',
        role: UserRole.STAFF,
      } as any,
      [{ role: 'user', content: 'hola' }] as any,
    );

    expect(openAiCtorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'key-1',
        baseURL: 'https://proxy.example',
      }),
    );
    expect(registry.getOpenAiTools).toHaveBeenCalledWith(
      expect.objectContaining({ role: UserRole.STAFF }),
      'estado de pagos',
    );
    expect(runToolsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-test',
        tools: [{ type: 'function' }],
      }),
    );
    expect(result).toEqual({
      model: 'gpt-test',
      outputText: 'ok',
      usage: { total_tokens: 10 },
    });
  });

  it('respond maps runner failures through provider mapper', async () => {
    process.env.OPENAI_API_KEY = 'key-1';
    process.env.OPENAI_MODEL = 'gpt-test';

    runToolsMock.mockReturnValue({
      finalContent: jest.fn().mockRejectedValue({
        status: 500,
        message: 'provider down',
      }),
      finalChatCompletion: jest.fn().mockResolvedValue({ model: 'x' }),
      totalUsage: jest.fn().mockResolvedValue({ total_tokens: 0 }),
    });

    const service = new AiOpenAiService({
      getOpenAiTools: jest.fn().mockReturnValue([]),
    } as any);

    await expect(
      service.respond('x', {
        userId: 'u1',
        companyId: 'c1',
        role: UserRole.ADMIN,
      } as any),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('maps OpenAI quota errors to HttpException with provider message', () => {
    const service = new AiOpenAiService({} as AiToolsRegistryService);

    const mapped = (service as any).mapProviderError({
      status: 429,
      requestID: 'req_123',
      message: '429 quota exceeded',
      code: 'insufficient_quota',
      type: 'insufficient_quota',
      error: {
        message: 'You exceeded your current quota',
        code: 'insufficient_quota',
        type: 'insufficient_quota',
      },
    }) as HttpException;

    expect(mapped).toBeInstanceOf(HttpException);
    expect(mapped.getStatus()).toBe(429);
    expect(mapped.getResponse()).toEqual({
      statusCode: 429,
      message: 'You exceeded your current quota',
      error: 'OpenAIError',
      provider: 'openai',
      code: 'insufficient_quota',
      type: 'insufficient_quota',
      requestId: 'req_123',
    });
  });

  it('mapProviderError returns existing HttpException unchanged', () => {
    const service = new AiOpenAiService({} as AiToolsRegistryService);
    const existing = new HttpException('x', 418);
    expect((service as any).mapProviderError(existing)).toBe(existing);
  });

  it('normalizes out-of-range statuses and logs based on severity', () => {
    const service = new AiOpenAiService({} as AiToolsRegistryService);
    const logger = (service as any).logger;
    const warnSpy = jest
      .spyOn(logger, 'warn')
      .mockImplementation(() => undefined);
    const errorSpy = jest
      .spyOn(logger, 'error')
      .mockImplementation(() => undefined);

    const fromInvalidStatus = (service as any).mapProviderError({
      status: 700,
      message: 'bad status',
      error: { code: 'c1', type: 't1' },
    }) as HttpException;
    expect(fromInvalidStatus.getStatus()).toBe(502);
    expect(errorSpy).toHaveBeenCalled();

    (service as any).mapProviderError({ status: 500, message: 'server error' });
    expect(errorSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('maps unknown errors to BadGatewayException', () => {
    const service = new AiOpenAiService({} as AiToolsRegistryService);
    const mapped = (service as any).mapProviderError(
      new Error('upstream failed'),
    ) as HttpException;

    expect(mapped).toBeInstanceOf(BadGatewayException);
    expect(mapped.getStatus()).toBe(502);
    expect(mapped.getResponse()).toEqual({
      statusCode: 502,
      message: 'upstream failed',
      error: 'BadGateway',
      provider: 'openai',
    });
  });

  it('covers helper methods for status, error shape and role preamble', () => {
    const service = new AiOpenAiService({} as AiToolsRegistryService);
    const serviceAny = service as any;

    expect(serviceAny.normalizeStatus('x')).toBe(502);
    expect(serviceAny.normalizeStatus(200)).toBe(502);
    expect(serviceAny.normalizeStatus(401)).toBe(401);
    expect(serviceAny.isOpenAiApiError(null)).toBe(false);
    expect(serviceAny.isOpenAiApiError('x')).toBe(false);
    expect(serviceAny.isOpenAiApiError({ status: 500 })).toBe(true);

    expect(serviceAny.buildRolePreamble(UserRole.ADMIN)).toContain('ADMIN');
    expect(serviceAny.buildRolePreamble(UserRole.STAFF)).toContain('STAFF');
    expect(serviceAny.buildRolePreamble(UserRole.OWNER)).toContain('OWNER');
    expect(serviceAny.buildRolePreamble(UserRole.TENANT)).toContain('TENANT');
    expect(serviceAny.buildRolePreamble('other')).toContain('limited access');
  });
});
