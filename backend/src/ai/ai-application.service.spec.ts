import { AiApplicationService } from './ai-application.service';
import {
  applicationGuidance,
  isDailyCollectionRequest,
} from './ai-application-guidance';
import { AiExecutionContext } from './types/ai-tool.types';
import { UserRole } from '../users/entities/user.entity';
import { pageForPath } from './ai-page-catalog';

describe('Application assistant', () => {
  const context: AiExecutionContext = {
    userId: 'user',
    companyId: 'company',
    role: UserRole.ADMIN,
    channel: 'web',
  };
  const conversation = { id: 'conversation', messages: [], toolState: {} };
  const conversations = {
    getOrCreateConversation: jest.fn(),
    appendExchange: jest.fn(),
    appendAssistantError: jest.fn(),
  };
  const executor = { execute: jest.fn() };
  const service = new AiApplicationService(
    conversations as never,
    executor as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    conversations.getOrCreateConversation.mockResolvedValue(conversation);
    conversations.appendExchange.mockResolvedValue(conversation);
  });
  afterEach(() => jest.useRealTimers());

  it.each([
    'quiero cambiar la password',
    '¿Cómo cambio mi contraseña?',
    'quiero cambiar la clave',
  ])('guides %s without executing a password mutation', async (prompt) => {
    const response = await service.respond(prompt, context);
    expect(response?.uiAction).toEqual({
      type: 'navigate',
      path: '/settings',
      guide: 'password',
    });
    expect(response?.outputText).toContain('mínimo 8 caracteres');
    expect(executor.execute).not.toHaveBeenCalled();
    expect(conversations.appendExchange).toHaveBeenCalledWith(
      expect.objectContaining({ userPrompt: prompt }),
    );
  });

  it.each(['mobile', 'whatsapp'] as const)(
    'returns instructions without navigation for %s',
    async (channel) => {
      const response = await service.respond('quiero cambiar password', {
        ...context,
        channel,
      });
      expect(response?.outputText).toContain('Configuración');
      expect(response).not.toHaveProperty('uiAction');
    },
  );

  it('continues a password workflow from the stored exchange', async () => {
    conversations.getOrCreateConversation.mockResolvedValue({
      ...conversation,
      messages: [
        { role: 'assistant', content: '**Cambiar contraseña**\nAyuda' },
      ],
    });
    const response = await service.respond(
      '¿Cómo sigo?',
      { ...context, currentPath: '/es/settings' },
      'conversation',
    );
    expect(response?.uiAction?.guide).toBe('password');
  });

  it('separates usage help from data queries and named filters', () => {
    expect(
      applicationGuidance('¿Cómo está la cobranza de hoy?', context),
    ).toBeUndefined();
    expect(
      applicationGuidance('¿Cómo registrar un pago?', context)?.uiAction?.path,
    ).toBeUndefined();
    expect(applicationGuidance('¿Cuánto debe Juan?', context)).toBeUndefined();
    expect(
      isDailyCollectionRequest('quiero ver la cobranza del dia de hoy'),
    ).toBe(true);
    expect(isDailyCollectionRequest('mostrame los cobros de hoy')).toBe(true);
    expect(isDailyCollectionRequest('¿Cuánto se cobró hoy?')).toBe(true);
    expect(isDailyCollectionRequest('cobranza de hoy de Juan')).toBe(false);
    expect(isDailyCollectionRequest('registrar cobros de hoy')).toBe(false);
    expect(isDailyCollectionRequest('pagos de hoy')).toBe(false);
  });

  it('respects simultaneous roles and staff module permissions for screen help', () => {
    expect(
      pageForPath('/properties', {
        ...context,
        role: UserRole.STAFF,
        permissions: { properties: false },
      }),
    ).toBeUndefined();
    expect(
      pageForPath('/properties', {
        ...context,
        role: UserRole.OWNER,
      }),
    ).toBeUndefined();
    expect(
      pageForPath('/properties', {
        ...context,
        role: UserRole.OWNER,
        roles: [UserRole.ADMIN, UserRole.OWNER],
      })?.path,
    ).toBe('/properties');
  });

  it('uses the Buenos Aires date and complete currency totals in chat', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-03T02:30:00Z'));
    executor.execute.mockResolvedValue({
      fromDate: '2026-10-02',
      toDate: '2026-10-02',
      totalCount: 22,
      totals: [
        { currency: 'ARS', amount: '9007199254740993.15', count: 21 },
        { currency: 'USD', amount: '40.20', count: 1 },
      ],
      details: [
        {
          id: 'internal-id',
          paymentNumber: 'COB-1',
          tenantName: '<img> A|B',
          currency: 'ARS',
          amount: '1000.10',
        },
      ],
    });
    const response = await service.respond(
      'quiero ver la cobranza del dia de hoy',
      context,
    );
    expect(executor.execute).toHaveBeenCalledWith(
      'get_payments_collection_summary',
      { fromDate: '2026-10-02', toDate: '2026-10-02' },
      expect.objectContaining({ companyId: 'company', userId: 'user' }),
    );
    expect(response?.outputText).toContain('9.007.199.254.740.993,15');
    expect(response?.outputText).toContain('USD 40,20');
    expect(response?.outputText).toContain('| Pago | Inquilino |');
    expect(response?.outputText).toContain('Mostrando 1 de 22');
    expect(response?.outputText).not.toContain('<img>');
    expect(response?.outputText).not.toContain('internal-id');
    expect(response).not.toHaveProperty('uiAction');
    const whatsapp = await service.respond('cobranza de hoy', {
      ...context,
      channel: 'whatsapp',
    });
    expect(whatsapp?.outputText).not.toContain('|');
    expect(whatsapp?.outputText).toContain('- COB-1');
  });

  it('distinguishes no collections from a denied or failed query', async () => {
    executor.execute.mockResolvedValueOnce({
      fromDate: '2026-10-02',
      toDate: '2026-10-02',
      totalCount: 0,
      totals: [],
      details: [],
    });
    expect(
      (await service.respond('cobranza de hoy', context))?.outputText,
    ).toContain('No hay pagos completados');
    executor.execute.mockRejectedValueOnce(new Error('Forbidden'));
    await expect(service.respond('cobranza de hoy', context)).rejects.toThrow(
      'Forbidden',
    );
    expect(conversations.appendAssistantError).toHaveBeenCalled();
  });
});
