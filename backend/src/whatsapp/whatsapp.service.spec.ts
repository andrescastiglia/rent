import {
  BadGatewayException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { WhatsappService } from './whatsapp.service';

describe('WhatsappService', () => {
  const originalEnv = { ...process.env };
  const fetchMock = jest.fn();

  const buildService = (env?: Record<string, string>, dataSource?: any) => {
    process.env = {
      ...originalEnv,
      WHATSAPP_ENABLED: 'true',
      WHATSAPP_API_BASE_URL: 'https://graph.facebook.com/v22.0/',
      WHATSAPP_PHONE_NUMBER_ID: 'phone-1',
      WHATSAPP_ACCESS_TOKEN: 'token-1',
      WHATSAPP_VERIFY_TOKEN: 'verify-1',
      WHATSAPP_DOCUMENT_LINK_SECRET: 'doc-secret',
      WHATSAPP_DOCUMENTS_BASE_URL: 'https://frontend.example.com/',
      BATCH_WHATSAPP_INTERNAL_TOKEN: 'batch-token',
      ...env,
    };
    return new WhatsappService(dataSource);
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

  it('uses environment defaults for API base, enabled flag and document URL settings', async () => {
    const service = buildServiceWithExactEnv({
      PORT: '3456',
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
    expect(logSpy).toHaveBeenCalledWith(
      'WhatsApp webhook message from 54911: hola',
    );
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

    expect(logSpy).toHaveBeenCalledWith(
      'WhatsApp webhook message from unknown: [non-text-message]',
    );
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
