import { ForbiddenException, HttpStatus } from '@nestjs/common';
import { WhatsappWebhookQueryDto } from './dto/whatsapp-webhook-query.dto';
import { WhatsappController } from './whatsapp.controller';

describe('WhatsappController', () => {
  const whatsappService = {
    sendTextMessage: jest.fn(),
    sendTemplateMessage: jest.fn(),
    assertBatchToken: jest.fn(),
    verifyWebhookToken: jest.fn(),
    handleIncomingWebhook: jest.fn(),
    isDocumentTokenValid: jest.fn(),
  };

  const documentsService = {
    downloadByS3Key: jest.fn(),
  };

  let controller: WhatsappController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new WhatsappController(
      whatsappService as any,
      documentsService as any,
    );
  });

  it('sendMessage delegates to whatsapp service', async () => {
    whatsappService.sendTextMessage.mockResolvedValue({ messageId: 'x' });
    const dto = { to: '54911', text: 'hola', pdfUrl: undefined } as any;

    await expect(controller.sendMessage(dto)).resolves.toEqual({
      messageId: 'x',
    });
    expect(whatsappService.sendTextMessage).toHaveBeenCalledWith(
      '54911',
      'hola',
      undefined,
      {
        activityEntity: undefined,
        activityId: undefined,
        companyId: undefined,
        relatedEntityId: undefined,
        relatedEntityType: undefined,
      },
    );
  });

  it('sendMessageFromBatch validates token then sends', async () => {
    whatsappService.sendTextMessage.mockResolvedValue({ messageId: 'y' });
    const dto = { to: '54911', text: 'hola', pdfUrl: 'db://document/1' } as any;

    await expect(
      controller.sendMessageFromBatch(dto, 'batch-token'),
    ).resolves.toEqual({ messageId: 'y' });
    expect(whatsappService.assertBatchToken).toHaveBeenCalledWith(
      'batch-token',
    );
    expect(whatsappService.sendTextMessage).toHaveBeenCalledWith(
      '54911',
      'hola',
      'db://document/1',
      {
        activityEntity: undefined,
        activityId: undefined,
        companyId: undefined,
        relatedEntityId: undefined,
        relatedEntityType: undefined,
      },
    );
  });

  it('sendMessage delegates template payloads to whatsapp service', async () => {
    whatsappService.sendTemplateMessage.mockResolvedValue({ messageId: 'tpl' });
    const dto = {
      to: '54911',
      text: 'fallback',
      templateName: 'invoice_available',
      templateLanguage: 'es_AR',
      templateParameters: ['Juan', 'F-1', '2026-07-15', 'ARS 1000,00'],
      activityEntity: 'tenant',
      activityId: '123e4567-e89b-12d3-a456-426614174000',
    } as any;

    await expect(controller.sendMessage(dto)).resolves.toEqual({
      messageId: 'tpl',
    });
    expect(whatsappService.sendTemplateMessage).toHaveBeenCalledWith(
      '54911',
      'invoice_available',
      'es_AR',
      ['Juan', 'F-1', '2026-07-15', 'ARS 1000,00'],
      {
        textFallback: 'fallback',
        pdfUrl: undefined,
        context: {
          activityEntity: 'tenant',
          activityId: '123e4567-e89b-12d3-a456-426614174000',
          companyId: undefined,
          relatedEntityId: undefined,
          relatedEntityType: undefined,
        },
      },
    );
  });

  it('verifyWebhook returns challenge on valid subscribe token', () => {
    whatsappService.verifyWebhookToken.mockReturnValue(true);
    const res = {
      type: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      sendStatus: jest.fn().mockReturnThis(),
    } as any;

    controller.verifyWebhook(
      {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'verify',
        'hub.challenge': '123456',
      } as any,
      res,
    );

    expect(res.type).toHaveBeenCalledWith('text/plain');
    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(res.send).toHaveBeenCalledWith('123456');
  });

  it('verifyWebhook rejects non-numeric challenge values', () => {
    const res = {
      sendStatus: jest.fn().mockReturnThis(),
    } as any;

    controller.verifyWebhook(
      {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'verify',
        'hub.challenge': '<script>alert(1)</script>',
      } as any,
      res,
    );

    expect(whatsappService.verifyWebhookToken).not.toHaveBeenCalled();
    expect(res.sendStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
  });

  it('normalizes webhook verification query aliases', () => {
    expect(
      WhatsappWebhookQueryDto.zodSchema.parse({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'verify',
        'hub.challenge': '123456',
        hub_mode: 'subscribe',
        hub_verify_token: 'verify',
        hub_challenge: '123456',
      }),
    ).toEqual({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'verify',
      'hub.challenge': '123456',
    });
  });

  it('accepts webhook verification query aliases when canonical keys are missing', () => {
    expect(
      WhatsappWebhookQueryDto.zodSchema.parse({
        hub_mode: 'subscribe',
        hub_verify_token: 'verify',
        hub_challenge: '123456',
      }),
    ).toEqual({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'verify',
      'hub.challenge': '123456',
    });
  });

  it('verifyWebhook returns forbidden when token is invalid', () => {
    whatsappService.verifyWebhookToken.mockReturnValue(false);
    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      sendStatus: jest.fn().mockReturnThis(),
    } as any;

    controller.verifyWebhook(
      {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong',
        'hub.challenge': '123456',
      } as any,
      res,
    );

    expect(res.sendStatus).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
  });

  it('receiveWebhook delegates and returns ack', async () => {
    const payload = { entry: [] } as any;
    await expect(controller.receiveWebhook(payload)).resolves.toEqual({
      received: true,
    });
    expect(whatsappService.handleIncomingWebhook).toHaveBeenCalledWith(payload);
  });

  it('downloadDocument rejects invalid token', async () => {
    whatsappService.isDocumentTokenValid.mockReturnValue(false);
    await expect(
      controller.downloadDocument('doc-1', { token: 'bad' } as any, {} as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('downloadDocument streams file when token is valid', async () => {
    whatsappService.isDocumentTokenValid.mockReturnValue(true);
    documentsService.downloadByS3Key.mockResolvedValue({
      buffer: Buffer.from('pdf'),
      contentType: 'application/pdf',
    });
    const res = {
      set: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    } as any;

    await controller.downloadDocument('doc-1', { token: 'ok' } as any, res);

    expect(documentsService.downloadByS3Key).toHaveBeenCalledWith(
      'db://document/doc-1',
    );
    expect(res.set).toHaveBeenCalledWith({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="document-doc-1.pdf"',
      'Cache-Control': 'private, max-age=300',
    });
    expect(res.send).toHaveBeenCalledWith(Buffer.from('pdf'));
  });
});
