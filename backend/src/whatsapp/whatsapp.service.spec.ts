import {
  BadRequestException,
  BadGatewayException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac } from 'node:crypto';
import OpenAI from 'openai';
import { WhatsappService } from './whatsapp.service';

jest.mock('openai', () => {
  const create = jest.fn();
  const MockOpenAI = jest.fn(() => ({
    audio: { transcriptions: { create } },
  }));
  Object.assign(MockOpenAI, { transcriptionCreate: create });
  return {
    __esModule: true,
    default: MockOpenAI,
    toFile: jest.fn(async (buffer, name, options) => ({
      buffer,
      name,
      ...options,
    })),
  };
});

describe('WhatsappService', () => {
  const originalEnv = { ...process.env };
  const fetchMock = jest.fn();

  const buildService = (
    env?: Record<string, string>,
    dataSource?: any,
    moduleRef?: any,
  ) => {
    process.env = {
      ...originalEnv,
      WHATSAPP_ENABLED: 'true',
      WHATSAPP_API_BASE_URL: 'https://graph.facebook.com/v22.0/',
      WHATSAPP_PHONE_NUMBER_ID: 'phone-1',
      WHATSAPP_ACCESS_TOKEN: 'token-1',
      WHATSAPP_VERIFY_TOKEN: 'verify-1',
      WHATSAPP_APP_SECRET: 'app-secret',
      WHATSAPP_DOCUMENT_LINK_SECRET: 'doc-secret',
      WHATSAPP_DOCUMENTS_BASE_URL: 'https://frontend.example.com/',
      BATCH_WHATSAPP_INTERNAL_TOKEN: 'batch-token',
      ...env,
    };
    return new WhatsappService(dataSource, moduleRef);
  };

  const buildDataSource = (
    queryMock = jest.fn().mockResolvedValue([]),
    type = 'postgres',
  ) => ({
    options: { type },
    query: queryMock,
  });

  const mockSuccessfulSend = (messageId = 'wamid-1') => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: messageId }] }),
    });
  };

  const buildServiceWithExactEnv = (
    env: Record<string, string>,
    dataSource?: any,
  ) => {
    process.env = { ...env };
    return new WhatsappService(dataSource);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = fetchMock;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('sendTextMessage throws when whatsapp is disabled', async () => {
    const service = buildService({ WHATSAPP_ENABLED: 'false' });
    await expect(
      service.sendTextMessage('+5491112345678', 'hola'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('sendTextMessage throws when config is incomplete', async () => {
    const service = buildService({ WHATSAPP_ACCESS_TOKEN: '' });
    await expect(
      service.sendTextMessage('+5491112345678', 'hola'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('sendTextMessage validates phone and message body', async () => {
    const service = buildService();
    await expect(service.sendTextMessage('abc', 'hola')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    await expect(
      service.sendTextMessage('+5491112345678', '   '),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('sendTextMessage sends text payload and returns message id', async () => {
    const service = buildService();
    mockSuccessfulSend();

    const result = await service.sendTextMessage(
      '+54 9 11 1234-5678',
      ` ${'a'.repeat(5000)} `,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.facebook.com/v22.0/phone-1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-1',
          'Content-Type': 'application/json',
        }),
      }),
    );
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(payload.to).toBe('5491112345678');
    expect(payload.type).toBe('text');
    expect(payload.text.body.length).toBe(4096);
    expect(result).toEqual({
      messageId: 'wamid-1',
      raw: { messages: [{ id: 'wamid-1' }] },
    });
  });

  it('sendTextMessage sends document payload with signed access URL', async () => {
    const service = buildService();
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid-doc' }] }),
    });

    await service.sendTextMessage(
      '+5491112345678',
      ` ${'b'.repeat(1500)} `,
      'db://document/123e4567-e89b-12d3-a456-426614174000',
    );

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(payload.type).toBe('document');
    expect(payload.document.filename).toBe(
      'document-123e4567-e89b-12d3-a456-426614174000.pdf',
    );
    expect(payload.document.caption.length).toBe(1024);
    expect(payload.document.link).toContain(
      'https://frontend.example.com/whatsapp/documents/123e4567-e89b-12d3-a456-426614174000?token=',
    );
    (Date.now as jest.Mock).mockRestore();
  });

  it('uses environment defaults for API base and document URL settings', async () => {
    const service = buildServiceWithExactEnv({
      PORT: '3456',
      WHATSAPP_ENABLED: 'true',
      WHATSAPP_PHONE_NUMBER_ID: 'phone-1',
      WHATSAPP_ACCESS_TOKEN: 'token-1',
      WHATSAPP_DOCUMENT_LINK_SECRET: 'doc-secret',
    });
    mockSuccessfulSend('wamid-default-env');

    await service.sendTextMessage(
      '+5491112345678',
      'documento',
      'db://document/123e4567-e89b-12d3-a456-426614174000',
    );

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://graph.facebook.com/v22.0/phone-1/messages',
    );
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(payload.document.link).toContain(
      'http://localhost:3456/whatsapp/documents/123e4567-e89b-12d3-a456-426614174000?token=',
    );
  });

  it('sendTemplateMessage sends template payload and optional document', async () => {
    const service = buildService();
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [{ id: 'wamid-template' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [{ id: 'wamid-document' }] }),
      });

    const result = await service.sendTemplateMessage(
      '+5491112345678',
      'invoice_available',
      'es',
      ['Juan', 'F-1', '2026-07-15', 'ARS 1000,00'],
      {
        textFallback: 'Factura disponible',
        pdfUrl: 'db://document/123e4567-e89b-12d3-a456-426614174000',
      },
    );

    const templatePayload = JSON.parse(
      fetchMock.mock.calls[0][1].body as string,
    );
    expect(templatePayload.type).toBe('template');
    expect(templatePayload.template).toEqual({
      name: 'invoice_available',
      language: { code: 'es_AR' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: 'Juan' },
            { type: 'text', text: 'F-1' },
            { type: 'text', text: '2026-07-15' },
            { type: 'text', text: 'ARS 1000,00' },
          ],
        },
      ],
    });
    const documentPayload = JSON.parse(
      fetchMock.mock.calls[1][1].body as string,
    );
    expect(documentPayload.type).toBe('document');
    expect(result).toEqual({
      messageId: 'wamid-template',
      raw: { messages: [{ id: 'wamid-template' }] },
      documentMessageId: 'wamid-document',
    });
    (Date.now as jest.Mock).mockRestore();
  });

  it('sendTemplateMessage sends templates without body params or document', async () => {
    const service = buildService();
    mockSuccessfulSend('wamid-no-params');

    const result = await service.sendTemplateMessage(
      '+5491112345678',
      'receipt_available',
      'pt',
      [],
    );

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(payload.template).toEqual({
      name: 'receipt_available',
      language: { code: 'pt_BR' },
    });
    expect(result).toEqual({
      messageId: 'wamid-no-params',
      raw: { messages: [{ id: 'wamid-no-params' }] },
    });
  });

  it('sendTemplateMessage uses default document caption and handles null parameters', async () => {
    const service = buildService();
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [{ id: 'wamid-template' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [{ id: 'wamid-document' }] }),
      });

    await service.sendTemplateMessage(
      '+5491112345678',
      'receipt_available',
      'en_US',
      [null as any],
      {
        pdfUrl: 'db://document/123e4567-e89b-12d3-a456-426614174000',
      },
    );

    const templatePayload = JSON.parse(
      fetchMock.mock.calls[0][1].body as string,
    );
    expect(templatePayload.template.components[0].parameters).toEqual([
      { type: 'text', text: '' },
    ]);
    const documentPayload = JSON.parse(
      fetchMock.mock.calls[1][1].body as string,
    );
    expect(documentPayload.document.caption).toBe('Documento disponible.');
    (Date.now as jest.Mock).mockRestore();
  });

  it('sendTemplateMessage validates disabled config, phone and template name', async () => {
    await expect(
      buildService({ WHATSAPP_ENABLED: 'false' }).sendTemplateMessage(
        '+5491112345678',
        'invoice_available',
        'es',
        [],
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    await expect(
      buildService({ WHATSAPP_PHONE_NUMBER_ID: '' }).sendTemplateMessage(
        '+5491112345678',
        'invoice_available',
        'es',
        [],
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    await expect(
      buildService().sendTemplateMessage('abc', 'invoice_available', 'es', []),
    ).rejects.toBeInstanceOf(BadGatewayException);

    await expect(
      buildService().sendTemplateMessage(
        '+5491112345678',
        'bad-template!',
        'es',
        [],
      ),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('sendTextMessage throws for invalid db url or missing doc secret', async () => {
    const service = buildService();
    await expect(
      service.sendTextMessage('+5491112345678', 'hola', 'db://invalid/1'),
    ).rejects.toBeInstanceOf(BadGatewayException);

    const withoutSecret = buildService({ WHATSAPP_DOCUMENT_LINK_SECRET: '' });
    await expect(
      withoutSecret.sendTextMessage(
        '+5491112345678',
        'hola',
        'db://document/123e4567-e89b-12d3-a456-426614174000',
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('sendTextMessage maps whatsapp API errors', async () => {
    const service = buildService();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'bad request upstream' } }),
    });

    await expect(
      service.sendTextMessage('+5491112345678', 'hola'),
    ).rejects.toBeInstanceOf(BadGatewayException);

    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => {
        throw new Error('invalid json');
      },
    });

    await expect(
      service.sendTextMessage('+5491112345678', 'hola'),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('verifies webhook, languages and document tokens', () => {
    const service = buildService();
    expect(service.verifyWebhookToken('verify-1')).toBe(true);
    expect(service.verifyWebhookToken('wrong')).toBe(false);
    expect(service.resolveLanguageCode('en')).toBe('en_US');
    expect(service.resolveLanguageCode('en_US')).toBe('en_US');
    expect(service.resolveLanguageCode('es_AR')).toBe('es_AR');
    expect(service.resolveLanguageCode('pt')).toBe('pt_BR');
    expect(service.resolveLanguageCode('pt_BR')).toBe('pt_BR');
    expect(service.resolveLanguageCode('unknown')).toBe('es_AR');
    expect(service.resolveLanguageCode()).toBe('es_AR');

    const rawBody = Buffer.from('{"entry":[]}');
    const webhookSignature = `sha256=${createHmac('sha256', 'app-secret')
      .update(rawBody)
      .digest('hex')}`;
    expect(service.verifyWebhookSignature(webhookSignature, rawBody)).toBe(
      true,
    );
    expect(service.verifyWebhookSignature('sha256=bad', rawBody)).toBe(false);
    expect(service.verifyWebhookSignature(undefined, rawBody)).toBe(false);

    const documentId = '123e4567-e89b-12d3-a456-426614174000';
    const exp = Math.floor(Date.now() / 1000) + 600;
    const signature = createHmac('sha256', 'doc-secret')
      .update(`${documentId}:${exp}`)
      .digest('hex');
    const token = `${exp}.${signature}`;

    expect(service.isDocumentTokenValid(documentId, token)).toBe(true);
    expect(service.isDocumentTokenValid(documentId, `${exp}.abcd`)).toBe(false);
    expect(service.isDocumentTokenValid(documentId, undefined)).toBe(false);
    expect(service.isDocumentTokenValid(documentId, `1.${signature}`)).toBe(
      false,
    );
    expect(service.isDocumentTokenValid(documentId, 'badformat')).toBe(false);
  });

  it('persists a bounded webhook payload before acknowledging it', async () => {
    const query = jest.fn().mockResolvedValue([{ id: 'inbox-1' }]);
    const service = buildService(
      { WHATSAPP_INBOUND_ENABLED: 'false' },
      buildDataSource(query),
    );
    const payload = { entry: [{ changes: [] }] };

    await expect(service.acceptIncomingWebhook(payload)).resolves.toEqual({
      received: true,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO whatsapp_webhook_inbox'),
      [expect.stringMatching(/^[0-9a-f]{64}$/), JSON.stringify(payload)],
    );

    await expect(service.acceptIncomingWebhook(null)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('processes due inbox records with an atomic lease', async () => {
    const query = jest.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id') && sql.includes('whatsapp_webhook_inbox')) {
        return [{ id: '10000000-0000-0000-0000-000000000001' }];
      }
      if (sql.includes('RETURNING payload, attempts')) {
        return [{ payload: { entry: [] }, attempts: 1 }];
      }
      return [];
    });
    const service = buildService(
      { WHATSAPP_INBOUND_ENABLED: 'true' },
      buildDataSource(query),
    );

    await expect(service.processDueWebhookInbox(500)).resolves.toEqual({
      selected: 1,
      processed: 1,
      failed: 0,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT $1'),
      [100],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'processed'"),
      ['10000000-0000-0000-0000-000000000001'],
    );
  });

  it('moves an inbox record to dead-letter after five failed attempts', async () => {
    const query = jest.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('RETURNING payload, attempts')) {
        return [{ payload: { entry: [] }, attempts: 5 }];
      }
      return [];
    });
    const service = buildService(
      { WHATSAPP_INBOUND_ENABLED: 'true' },
      buildDataSource(query),
    );
    jest
      .spyOn(service, 'handleIncomingWebhook')
      .mockRejectedValue(new Error('processor failed'));
    jest.spyOn(service, 'logIncomingError').mockImplementation(() => undefined);

    await expect(
      (service as any).processWebhookInboxItem(
        '10000000-0000-0000-0000-000000000001',
      ),
    ).resolves.toBe('failed');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('available_at = CASE'),
      ['10000000-0000-0000-0000-000000000001', 'dead_letter', 480, 'Error'],
    );
  });

  it('assertBatchToken enforces internal token', () => {
    const service = buildService();
    expect(() => service.assertBatchToken('batch-token')).not.toThrow();
    expect(() => service.assertBatchToken('wrong')).toThrow(
      UnauthorizedException,
    );

    const noBatchToken = buildService({ BATCH_WHATSAPP_INTERNAL_TOKEN: '' });
    expect(() => noBatchToken.assertBatchToken('x')).toThrow(
      ServiceUnavailableException,
    );
  });

  it('does not expose incoming error details in logs', () => {
    const service = buildService();
    const logger = (service as any).logger;
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation();

    service.logIncomingError(new Error('message from 5491112345678: secreto'));

    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to process incoming WhatsApp message',
      { errorType: 'Error' },
    );
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('5491112345678');
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('secreto');
  });

  it('handleIncomingWebhook logs both no-message and message cases', async () => {
    const service = buildService();
    const logger = (service as any).logger;
    const debugSpy = jest.spyOn(logger, 'debug').mockImplementation();
    const logSpy = jest.spyOn(logger, 'log').mockImplementation();

    await service.handleIncomingWebhook({});
    expect(debugSpy).toHaveBeenCalledWith(
      'WhatsApp webhook received without messages',
    );

    await service.handleIncomingWebhook({
      entry: [
        {
          changes: [
            {
              value: { messages: [{ from: '54911', text: { body: 'hola' } }] },
            },
          ],
        },
      ],
    });
    expect(logSpy).toHaveBeenCalledWith('WhatsApp webhook message received', {
      senderHash: expect.stringMatching(/^[0-9a-f]{16}$/),
      messageId: undefined,
      messageType: 'unknown',
    });
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain('hola');
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain('54911');
  });

  it('handleIncomingWebhook logs non-text messages and tolerates malformed changes', async () => {
    const service = buildService();
    const logger = (service as any).logger;
    const logSpy = jest.spyOn(logger, 'log').mockImplementation();

    await service.handleIncomingWebhook({
      entry: [
        {
          changes: [
            {},
            {
              value: { messages: [{}] },
            },
          ],
        },
      ],
    });

    expect(logSpy).toHaveBeenCalledWith('WhatsApp webhook message received', {
      senderHash: expect.stringMatching(/^[0-9a-f]{16}$/),
      messageId: undefined,
      messageType: 'unknown',
    });
  });

  it('processes an opted-in owner message through AI and replies', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM users')) {
        return [
          {
            id: 'user-1',
            company_id: 'company-1',
            role: 'owner',
            language: 'es',
          },
        ];
      }
      if (sql.includes('SELECT id FROM owners')) return [{ id: 'owner-1' }];
      if (sql.includes('INSERT INTO person_communications')) {
        return [{ id: 'communication-1' }];
      }
      return [];
    });
    const respond = jest.fn().mockResolvedValue({
      conversationId: 'conversation-1',
      outputText: '  La operación quedó pendiente.  ',
    });
    const moduleRef = { get: jest.fn(() => ({ respond })) };
    const service = buildService(undefined, buildDataSource(query), moduleRef);
    mockSuccessfulSend('wamid-reply');

    await service.handleIncomingWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid-inbound',
                    from: '+54 9 11 1234-5678',
                    type: 'text',
                    text: { body: '  Crear propietario  ' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(respond).toHaveBeenCalledWith({
      prompt: 'Crear propietario',
      context: {
        userId: 'user-1',
        companyId: 'company-1',
        role: 'owner',
        mutationApprovalMode: 'staff_queue',
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/phone-1/messages'),
      expect.any(Object),
    );
    expect(
      query.mock.calls.some(([sql]) => sql.includes('metadata = metadata')),
    ).toBe(true);
  });

  it('ignores ambiguous users and duplicate inbound message ids', async () => {
    const ambiguousQuery = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'user-1' }, { id: 'user-2' }]);
    const ambiguous = buildService(undefined, buildDataSource(ambiguousQuery));
    await ambiguous.handleIncomingWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid-ambiguous',
                    from: '5491112345678',
                    text: { body: 'hola' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(fetchMock).not.toHaveBeenCalled();

    const duplicateQuery = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'staff-1',
          company_id: 'company-1',
          role: 'admin',
          language: 'es',
        },
      ])
      .mockResolvedValueOnce([]);
    const duplicate = buildService(undefined, buildDataSource(duplicateQuery));
    await duplicate.handleIncomingWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid-duplicate',
                    from: '5491112345678',
                    text: { body: 'hola' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps inbound messages pending when AI is unavailable', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM users')) {
        return [
          {
            id: 'staff-1',
            company_id: 'company-1',
            role: 'staff',
            language: 'es',
          },
        ];
      }
      if (sql.includes('INSERT INTO person_communications')) {
        return [{ id: 'communication-1' }];
      }
      return [];
    });
    const service = buildService(undefined, buildDataSource(query), {
      get: jest.fn(() => undefined),
    });
    mockSuccessfulSend('wamid-fallback');

    await service.handleIncomingWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid-inbound',
                    from: '5491112345678',
                    text: { body: 'hola' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    const fallbackPayload = JSON.parse(
      fetchMock.mock.calls.find(([url]) => url.includes('/messages'))[1].body,
    );
    expect(fallbackPayload.text.body).toContain('pendiente de revisión');
    expect(
      (query.mock.calls as unknown[][]).some(
        ([, params]) =>
          Array.isArray(params) &&
          params.some((value: unknown) =>
            String(value).includes('processingError'),
          ),
      ),
    ).toBe(true);
  });

  it('records but does not process messages beyond the inbound abuse budget', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM users')) {
        return [
          {
            id: 'staff-1',
            company_id: 'company-1',
            role: 'staff',
            language: 'es',
          },
        ];
      }
      if (sql.includes('INSERT INTO person_communications')) {
        return [{ id: 'communication-limited', request_count: 3 }];
      }
      return [];
    });
    const respond = jest.fn();
    const service = buildService(
      { WHATSAPP_INBOUND_DAILY_LIMIT: '2' },
      buildDataSource(query),
      { get: jest.fn(() => ({ respond })) },
    );

    await service.handleIncomingWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid-limited',
                    from: '5491112345678',
                    type: 'audio',
                    audio: { id: 'media-never-downloaded' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    const insertCall = (query.mock.calls as unknown[][]).find(([sql]) =>
      String(sql).includes('INSERT INTO person_communications'),
    );
    expect(insertCall?.[1]).toEqual(
      expect.arrayContaining([
        'voice',
        '[pending-transcription]',
        'wamid-limited',
        expect.stringMatching(/^[0-9a-f]{64}$/),
      ]),
    );
    expect(insertCall?.[0]).toContain('INSERT INTO api_rate_limit_buckets');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("body = '[rate-limited]'"),
      ['communication-limited'],
    );
    expect(respond).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('applies configured retention and reports affected records', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        processed_inbox_deleted: 3,
        dead_letters_deleted: 1,
        communications_redacted: 7,
        outbound_messages_redacted: 4,
      },
    ]);
    const service = buildService(
      {
        WHATSAPP_INBOX_RETENTION_DAYS: '8',
        WHATSAPP_DEAD_LETTER_RETENTION_DAYS: '31',
        WHATSAPP_COMMUNICATION_RETENTION_DAYS: '366',
        WHATSAPP_OUTBOUND_RETENTION_DAYS: '91',
      },
      buildDataSource(query),
    );

    await expect(service.applyRetentionPolicy()).resolves.toEqual({
      processedInboxDeleted: 3,
      deadLettersDeleted: 1,
      communicationsRedacted: 7,
      outboundMessagesRedacted: 4,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("body = '[redacted]'"),
      [8, 31, 366, 91],
    );
    expect(query.mock.calls[0][0]).toContain("recipient_phone = '[redacted]'");
  });

  it('downloads and transcribes WhatsApp voice messages', async () => {
    const transcriptionCreate = (
      OpenAI as unknown as {
        transcriptionCreate: jest.Mock;
      }
    ).transcriptionCreate;
    transcriptionCreate.mockResolvedValueOnce({ text: '  Consulta por voz  ' });
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          url: 'https://media.example.com/voice',
          mime_type: 'audio/ogg',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
      });
    const service = buildService({ OPENAI_API_KEY: 'openai-key' });

    await expect(
      (service as any).extractIncomingContent({ audio: { id: 'media-1' } }),
    ).resolves.toEqual({ body: 'Consulta por voz', type: 'voice' });
    expect(transcriptionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-4o-mini-transcribe' }),
    );
  });

  it('validates voice download and transcription prerequisites', async () => {
    const service = buildService({ OPENAI_API_KEY: '' });
    await expect((service as any).extractIncomingContent({})).resolves.toEqual({
      body: '',
      type: 'text',
    });

    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => null });
    await expect(
      (service as any).extractIncomingContent({ audio: { id: 'media-1' } }),
    ).rejects.toBeInstanceOf(BadGatewayException);

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'https://media.example.com/voice' }),
      })
      .mockResolvedValueOnce({ ok: false });
    await expect(
      (service as any).extractIncomingContent({ audio: { id: 'media-2' } }),
    ).rejects.toBeInstanceOf(BadGatewayException);

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'https://media.example.com/voice' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Uint8Array.from([1, 2]).buffer,
      });
    await expect(
      (service as any).extractIncomingContent({ audio: { id: 'media-3' } }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('creates tracking table on postgres bootstrap only', async () => {
    const postgresQuery = jest.fn().mockResolvedValue([]);
    const postgresService = buildService(
      undefined,
      buildDataSource(postgresQuery),
    );
    await postgresService.onApplicationBootstrap();
    expect(postgresQuery).toHaveBeenCalledTimes(3);
    expect(postgresQuery.mock.calls[0][0]).toContain(
      'CREATE TABLE IF NOT EXISTS whatsapp_messages',
    );
    expect(postgresQuery.mock.calls[1][0]).toContain(
      'idx_whatsapp_messages_activity',
    );
    expect(postgresQuery.mock.calls[2][0]).toContain(
      'idx_whatsapp_messages_related',
    );

    const sqliteQuery = jest.fn();
    const sqliteService = buildService(
      undefined,
      buildDataSource(sqliteQuery, 'sqlite'),
    );
    await sqliteService.onApplicationBootstrap();
    expect(sqliteQuery).not.toHaveBeenCalled();

    const serviceWithoutDataSource = buildService();
    await expect(
      serviceWithoutDataSource.onApplicationBootstrap(),
    ).resolves.toBe(undefined);
  });

  it('records outbound sent messages and updates linked activity metadata', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = buildService(undefined, buildDataSource(query));
    mockSuccessfulSend('wamid-tracked');

    await service.sendTextMessage('+5491112345678', 'hola', undefined, {
      companyId: '123e4567-e89b-12d3-a456-426614174000',
      relatedEntityType: 'tenant',
      relatedEntityId: '123e4567-e89b-12d3-a456-426614174001',
      activityEntity: 'tenant',
      activityId: '123e4567-e89b-12d3-a456-426614174002',
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('INSERT INTO whatsapp_messages');
    expect(query.mock.calls[0][1]).toEqual(
      expect.arrayContaining([
        'wamid-tracked',
        '5491112345678',
        'text',
        'hola',
        'sent',
        '123e4567-e89b-12d3-a456-426614174000',
        'tenant',
        '123e4567-e89b-12d3-a456-426614174001',
        'tenant',
        '123e4567-e89b-12d3-a456-426614174002',
      ]),
    );
    expect(query.mock.calls[1][0]).toContain('UPDATE tenant_activities');
    expect(query.mock.calls[1][1][0]).toBe(
      '123e4567-e89b-12d3-a456-426614174002',
    );
    expect(JSON.parse(query.mock.calls[1][1][1])).toEqual(
      expect.objectContaining({
        messageId: 'wamid-tracked',
        status: 'sent',
      }),
    );
  });

  it('records sent messages without a provider message id or raw body', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = buildService(undefined, buildDataSource(query));
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const result = await service.sendTextMessage('+5491112345678', 'hola');

    expect(result).toEqual({ messageId: null, raw: {} });
    expect(query.mock.calls[0][1]).toEqual(
      expect.arrayContaining([null, '5491112345678', 'text', 'sent', '{}']),
    );
  });

  it('records outbound failures and keeps provider errors', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = buildService(undefined, buildDataSource(query));
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'template paused' } }),
    });

    await expect(
      service.sendTemplateMessage('+5491112345678', 'invoice_available', 'es', [
        'Juan',
      ]),
    ).rejects.toBeInstanceOf(BadGatewayException);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('INSERT INTO whatsapp_messages');
    expect(query.mock.calls[0][1]).toEqual(
      expect.arrayContaining([
        null,
        '5491112345678',
        'template',
        'invoice_available',
        'es_AR',
        'failed',
        'template paused',
      ]),
    );
  });

  it('does not fail sends when tracking persistence fails', async () => {
    const query = jest.fn().mockRejectedValue(new Error('db down'));
    const service = buildService(undefined, buildDataSource(query));
    const logger = (service as any).logger;
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation();
    mockSuccessfulSend('wamid-db-error');

    await expect(
      service.sendTextMessage('+5491112345678', 'hola'),
    ).resolves.toEqual({
      messageId: 'wamid-db-error',
      raw: { messages: [{ id: 'wamid-db-error' }] },
    });
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to record WhatsApp message tracking data',
      { error: 'db down' },
    );
  });

  it('logs non-Error tracking persistence failures', async () => {
    const query = jest.fn().mockRejectedValue('db string error');
    const service = buildService(undefined, buildDataSource(query));
    const logger = (service as any).logger;
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation();
    mockSuccessfulSend('wamid-string-error');

    await service.sendTextMessage('+5491112345678', 'hola');

    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to record WhatsApp message tracking data',
      { error: 'db string error' },
    );
  });

  it('updates message status from webhook and patches activity metadata', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          activity_entity: 'interested',
          activity_id: '123e4567-e89b-12d3-a456-426614174099',
        },
      ])
      .mockResolvedValueOnce([]);
    const service = buildService(undefined, buildDataSource(query));

    await service.handleIncomingWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: 'wamid-status',
                    status: 'delivered',
                    timestamp: '1700000000',
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('UPDATE whatsapp_messages');
    expect(query.mock.calls[0][1][0]).toBe('wamid-status');
    expect(query.mock.calls[0][1][1]).toBe('delivered');
    expect(query.mock.calls[0][1][3]).toEqual(new Date(1_700_000_000_000));
    expect(query.mock.calls[1][0]).toContain('UPDATE interested_activities');
    expect(JSON.parse(query.mock.calls[1][1][1])).toEqual(
      expect.objectContaining({
        messageId: 'wamid-status',
        status: 'delivered',
        deliveredAt: '2023-11-14T22:13:20.000Z',
      }),
    );
  });

  it('updates read and sent statuses with activity metadata timestamps', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          activity_entity: 'owner',
          activity_id: '123e4567-e89b-12d3-a456-426614174088',
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          activity_entity: 'tenant',
          activity_id: '123e4567-e89b-12d3-a456-426614174077',
        },
      ])
      .mockResolvedValueOnce([]);
    const service = buildService(undefined, buildDataSource(query));

    await service.handleIncomingWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: 'wamid-read',
                    status: 'read',
                    timestamp: '1700000001',
                  },
                  {
                    id: 'wamid-sent',
                    status: 'sent',
                    timestamp: '1700000002',
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(query.mock.calls[0][1][1]).toBe('read');
    expect(query.mock.calls[0][1][4]).toEqual(new Date(1_700_000_001_000));
    expect(JSON.parse(query.mock.calls[1][1][1])).toEqual(
      expect.objectContaining({
        status: 'read',
        readAt: '2023-11-14T22:13:21.000Z',
      }),
    );
    expect(query.mock.calls[2][1][1]).toBe('sent');
    expect(query.mock.calls[2][1][2]).toEqual(new Date(1_700_000_002_000));
    expect(JSON.parse(query.mock.calls[3][1][1])).toEqual(
      expect.objectContaining({
        status: 'sent',
        sentAt: '2023-11-14T22:13:22.000Z',
      }),
    );
  });

  it('handles failed status payloads, invalid statuses and missing timestamps', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = buildService(undefined, buildDataSource(query));

    await service.handleIncomingWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  { id: 'ignored', status: 'unknown' },
                  {
                    id: 'wamid-failed',
                    status: 'failed',
                    errors: [{ message: 'user unavailable' }, {}],
                  },
                  { status: 'read' },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1][0]).toBe('wamid-failed');
    expect(query.mock.calls[0][1][1]).toBe('failed');
    expect(query.mock.calls[0][1][5]).toBeInstanceOf(Date);
    expect(query.mock.calls[0][1][6]).toBe('user unavailable');
  });

  it('ignores status and metadata updates when no datasource is configured', async () => {
    const service = buildService();

    await expect(
      service.handleIncomingWebhook({
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [{ id: 'wamid-no-db', status: 'read' }],
                },
              },
            ],
          },
        ],
      }),
    ).resolves.toBeUndefined();

    await expect(
      (service as any).updateActivityMetadata('tenant', 'activity-1', {
        status: 'read',
      }),
    ).resolves.toBeUndefined();
  });
});
