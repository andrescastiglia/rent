import {
  BadGatewayException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { UserRole } from '../users/entities/user.entity';
import { AiToolsRegistryService } from './ai-tools-registry.service';
import { AiOpenAiService } from './ai-openai.service';

const responsesCreateMock = jest.fn();
const openAiCtorMock = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: class OpenAIMock {
    responses = {
      create: (...args: unknown[]) => responsesCreateMock(...args),
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
    delete process.env.OPENAI_REASONING_EFFORT;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it.each([
    ['/properties/10000000-0000-4000-8000-000000000001/edit', 'rentPrice'],
    ['/tenants/10000000-0000-4000-8000-000000000001/edit', 'phone'],
    ['/leases/10000000-0000-4000-8000-000000000001/edit', 'rentAmount'],
    ['/payments/10000000-0000-4000-8000-000000000001', 'edit-payment-notes'],
  ])(
    'opens %s with real field guidance without executing any mutation',
    async (path, field) => {
      process.env.OPENAI_API_KEY = 'key';
      process.env.OPENAI_MODEL = 'test';
      const read = jest
        .fn()
        .mockResolvedValue({ id: '10000000-0000-4000-8000-000000000001' });
      const registry = {
        getOpenAiTools: jest.fn().mockReturnValue([
          {
            type: 'function',
            function: { name: 'get_record', parameters: { type: 'object' } },
            $callback: read,
          },
        ]),
      } as unknown as AiToolsRegistryService;
      const action = {
        path,
        field,
        recordId: null,
        intent: 'edit',
        instruction:
          'Revisá y modificá este dato. Guardá vos desde el formulario.',
      };
      const call = (name: string, args: unknown) => ({
        id: 'response',
        model: 'test',
        output: [
          {
            type: 'function_call',
            name,
            call_id: name,
            arguments: JSON.stringify(args),
          },
        ],
      });
      responsesCreateMock
        .mockResolvedValueOnce(call('get_record', {}))
        .mockResolvedValueOnce(call('show_application_page', action))
        .mockResolvedValueOnce({
          id: 'final',
          model: 'test',
          output: [],
          output_text: 'Abrí el formulario para que revises el cambio.',
        });
      const result = await new AiOpenAiService(registry).respond(
        'quiero modificar el dato',
        {
          userId: 'u',
          companyId: 'c',
          role: UserRole.ADMIN,
          channel: 'web',
          mutationIntent: true,
        },
      );
      expect(result.uiAction).toEqual({
        type: 'navigate',
        guide: 'screen',
        path,
        field,
        intent: 'edit',
        instruction: action.instruction,
      });
      expect(read).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['web', 'whatsapp'] as const)(
    'returns arbitrary authorized queries directly in %s chat',
    async (channel) => {
      process.env.OPENAI_API_KEY = 'key';
      process.env.OPENAI_MODEL = 'test';
      const read = jest.fn().mockResolvedValue({
        data: [{ firstName: 'Ana', phone: '123' }],
        total: 1,
      });
      const registry = {
        getOpenAiTools: jest.fn().mockReturnValue([
          {
            type: 'function',
            function: { name: 'get_tenants', parameters: { type: 'object' } },
            $callback: read,
          },
        ]),
      } as unknown as AiToolsRegistryService;
      responsesCreateMock
        .mockResolvedValueOnce({
          id: 'read',
          model: 'test',
          output: [
            {
              type: 'function_call',
              name: 'get_tenants',
              call_id: 'read',
              arguments: '{}',
            },
          ],
        })
        .mockResolvedValueOnce({
          id: 'final',
          model: 'test',
          output: [],
          output_text: '**Inquilinos**\n\n- Ana · 123',
        });
      const result = await new AiOpenAiService(registry).respond(
        'mostrame los inquilinos',
        { userId: 'u', companyId: 'c', role: UserRole.ADMIN, channel },
      );
      expect(result.outputText).toContain('Ana');
      expect(result).not.toHaveProperty('uiAction');
      if (channel === 'whatsapp')
        expect(
          responsesCreateMock.mock.calls[0][0].tools.some(
            (tool: { name: string }) => tool.name === 'show_application_page',
          ),
        ).toBe(false);
    },
  );

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
      getOpenAiTools: jest.fn().mockReturnValue([
        {
          type: 'function',
          function: {
            name: 'get_test',
            description: 'test',
            parameters: { type: 'object', properties: {} },
            strict: true,
          },
        },
      ]),
    } as unknown as AiToolsRegistryService;

    responsesCreateMock.mockResolvedValue({
      id: 'resp-1',
      model: 'gpt-test',
      output_text: 'ok',
      output: [],
      usage: { input_tokens: 6, output_tokens: 4, total_tokens: 10 },
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
    expect(responsesCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-test',
        tools: [
          expect.objectContaining({ type: 'function', name: 'get_test' }),
        ],
      }),
    );
    expect(result).toEqual({
      model: 'gpt-test',
      outputText: 'ok',
      usage: { input_tokens: 6, output_tokens: 4, total_tokens: 10 },
    });
    expect(responsesCreateMock.mock.calls[0][0]).not.toHaveProperty(
      'reasoning',
    );
  });

  it('only sends reasoning effort when explicitly configured for a compatible model', async () => {
    process.env.OPENAI_API_KEY = 'key';
    process.env.OPENAI_MODEL = 'gpt-test';
    process.env.OPENAI_REASONING_EFFORT = 'low';
    responsesCreateMock.mockResolvedValue({
      id: 'response',
      model: 'gpt-test',
      output_text: 'ok',
      output: [],
    });
    await new AiOpenAiService({
      getOpenAiTools: jest.fn().mockReturnValue([]),
    } as never).respond('consulta', {
      userId: 'user',
      companyId: 'company',
      role: UserRole.ADMIN,
    });
    expect(responsesCreateMock.mock.calls[0][0].reasoning).toEqual({
      effort: 'low',
    });
  });

  it('requires a mutable tool and accepts only a persisted pending proposal', async () => {
    process.env.OPENAI_API_KEY = 'key-1';
    process.env.OPENAI_MODEL = 'gpt-test';
    const callback = jest.fn().mockResolvedValue({
      status: 'pending_confirmation',
      confirmationId: 'confirmation-1',
    });
    const registry = {
      getOpenAiTools: jest.fn().mockReturnValue([
        {
          type: 'function',
          function: {
            name: 'post_owners',
            description: 'Creates an owner proposal',
            parameters: { type: 'object', properties: {} },
            strict: true,
          },
          $callback: callback,
        },
      ]),
    } as unknown as AiToolsRegistryService;
    responsesCreateMock
      .mockResolvedValueOnce({
        id: 'resp-mutation-1',
        model: 'gpt-test',
        output_text: '',
        output: [
          {
            type: 'function_call',
            call_id: 'call-1',
            name: 'post_owners',
            arguments: '{"firstName":"Juan","lastName":"Pérez"}',
          },
        ],
        usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 },
      })
      .mockResolvedValueOnce({
        id: 'resp-mutation-2',
        model: 'gpt-test',
        output_text: 'La solicitud quedó pendiente de revisión.',
        output: [],
        usage: { input_tokens: 4, output_tokens: 3, total_tokens: 7 },
      });

    const result = await new AiOpenAiService(registry).respond(
      'Creá un propietario llamado Juan Pérez',
      {
        userId: 'u1',
        companyId: 'c1',
        role: UserRole.ADMIN,
        mutationApprovalMode: 'staff_queue',
        mutationIntent: true,
      },
    );

    expect(registry.getOpenAiTools).toHaveBeenCalledWith(
      expect.objectContaining({ mutationIntent: true }),
      expect.any(String),
    );
    expect(responsesCreateMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        tool_choice: 'required',
        parallel_tool_calls: false,
      }),
    );
    expect(callback).toHaveBeenCalledWith({
      firstName: 'Juan',
      lastName: 'Pérez',
    });
    expect(result.outputText).toBe('La solicitud quedó pendiente de revisión.');
    const first = responsesCreateMock.mock.calls[0][0];
    const next = responsesCreateMock.mock.calls[1][0];
    expect(next.instructions).toBe(first.instructions);
    expect(first.instructions).toContain(
      'Current date in America/Argentina/Buenos_Aires:',
    );
  });

  it('does not claim a mutation was queued when no tool persisted it', async () => {
    process.env.OPENAI_API_KEY = 'key-1';
    process.env.OPENAI_MODEL = 'gpt-test';
    const registry = {
      getOpenAiTools: jest.fn().mockReturnValue([]),
    } as unknown as AiToolsRegistryService;
    responsesCreateMock.mockResolvedValue({
      id: 'resp-without-call',
      model: 'gpt-test',
      output_text: 'Quedó enviada para revisión.',
      output: [],
      usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 },
    });

    const result = await new AiOpenAiService(registry).respond('Creá algo', {
      userId: 'u1',
      companyId: 'c1',
      role: UserRole.ADMIN,
      mutationApprovalMode: 'staff_queue',
      mutationIntent: true,
    });

    expect(result.outputText).toBe(
      'No pude registrar la solicitud como tarea pendiente. Revisá los datos e intentá nuevamente.',
    );
  });

  it('respond maps runner failures through provider mapper', async () => {
    process.env.OPENAI_API_KEY = 'key-1';
    process.env.OPENAI_MODEL = 'gpt-test';

    responsesCreateMock.mockRejectedValue({
      status: 500,
      message: 'provider down',
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
