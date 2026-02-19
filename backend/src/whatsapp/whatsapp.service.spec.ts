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

  const buildService = (env?: Record<string, string>) => {
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
    return new WhatsappService();
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
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid-1' }] }),
    });

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

  it('verifies webhook and document tokens', () => {
    const service = buildService();
    expect(service.verifyWebhookToken('verify-1')).toBe(true);
    expect(service.verifyWebhookToken('wrong')).toBe(false);

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

  it('handleIncomingWebhook logs both no-message and message cases', () => {
    const service = buildService();
    const logger = (service as any).logger;
    const debugSpy = jest.spyOn(logger, 'debug').mockImplementation();
    const logSpy = jest.spyOn(logger, 'log').mockImplementation();

    service.handleIncomingWebhook({});
    expect(debugSpy).toHaveBeenCalledWith(
      'WhatsApp webhook received without messages',
    );

    service.handleIncomingWebhook({
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
});
