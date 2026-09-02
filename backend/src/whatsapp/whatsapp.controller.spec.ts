import { ForbiddenException, HttpStatus } from '@nestjs/common';
import { WhatsappWebhookQueryDto } from './dto/whatsapp-webhook-query.dto';
import { WhatsappController } from './whatsapp.controller';

describe('WhatsappController', () => {
  const whatsappService = {
    enqueueMessage: jest.fn(),
    sendTextMessage: jest.fn(),
    sendTemplateMessage: jest.fn(),
    assertBatchToken: jest.fn(),
    verifyWebhookToken: jest.fn(),
    verifyWebhookSignature: jest.fn(),
    acceptIncomingWebhook: jest.fn(),
    processDueWebhookInbox: jest.fn(),
    applyRetentionPolicy: jest.fn(),
    logIncomingError: jest.fn(),
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

  it('sendMessage enqueues a company-scoped activity', async () => {
    whatsappService.enqueueMessage.mockResolvedValue({
      deliveryId: 'delivery-1',
      status: 'queued',
      queued: true,
    });
    const dto = {
      to: '54911',
      text: 'hola',
      activityEntity: 'tenant',
      activityId: '123e4567-e89b-12d3-a456-426614174001',
      relatedEntityType: 'tenant',
      relatedEntityId: '123e4567-e89b-12d3-a456-426614174002',
    } as any;

    await expect(
      controller.sendMessage(dto, { user: { companyId: 'company-1' } }),
    ).resolves.toEqual({
      deliveryId: 'delivery-1',
      status: 'queued',
      queued: true,
    });
    expect(whatsappService.enqueueMessage).toHaveBeenCalledWith({
      ...dto,
      companyId: 'company-1',
      recipientRole: 'tenant',
      recipientId: '123e4567-e89b-12d3-a456-426614174002',
      idempotencyKey: 'activity:tenant:123e4567-e89b-12d3-a456-426614174001',
    });
  });

  it('sendMessageFromBatch validates token then enqueues', async () => {
    whatsappService.enqueueMessage.mockResolvedValue({
      deliveryId: 'delivery-2',
      status: 'queued',
      queued: true,
    });
    const dto = {
      to: '54911',
      text: 'hola',
      companyId: '123e4567-e89b-12d3-a456-426614174010',
      recipientRole: 'tenant',
      recipientId: '123e4567-e89b-12d3-a456-426614174011',
      idempotencyKey: 'invoice-issued:invoice-1',
    } as any;

    await expect(
      controller.sendMessageFromBatch(dto, 'batch-token'),
    ).resolves.toEqual({
      deliveryId: 'delivery-2',
      status: 'queued',
      queued: true,
    });
    expect(whatsappService.assertBatchToken).toHaveBeenCalledWith(
      'batch-token',
    );
    expect(whatsappService.enqueueMessage).toHaveBeenCalledWith(dto);
  });

  it('requires activity context for authenticated sends', async () => {
    const dto = {
      to: '54911',
      text: 'fallback',
    } as any;

    await expect(
      controller.sendMessage(dto, { user: { companyId: 'company-1' } }),
    ).rejects.toThrow(
      'Activity entity, activity id and recipient id are required',
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

  it('receiveWebhook verifies signature, persists and then returns ack', async () => {
    const payload = { entry: [] } as any;
    whatsappService.verifyWebhookSignature.mockReturnValue(true);
    whatsappService.acceptIncomingWebhook.mockResolvedValue({ received: true });
    await expect(
      controller.receiveWebhook(payload, 'sha256=test', {
        rawBody: Buffer.from('{}'),
      } as any),
    ).resolves.toEqual({
      received: true,
    });
    expect(whatsappService.verifyWebhookSignature).toHaveBeenCalled();
    expect(whatsappService.acceptIncomingWebhook).toHaveBeenCalledWith(payload);
  });

  it('processWebhookInbox authenticates the batch request', async () => {
    whatsappService.processDueWebhookInbox.mockResolvedValue({
      selected: 1,
      processed: 1,
      failed: 0,
    });

    await expect(
      controller.processWebhookInbox('batch-token', '10'),
    ).resolves.toEqual({ selected: 1, processed: 1, failed: 0 });
    expect(whatsappService.assertBatchToken).toHaveBeenCalledWith(
      'batch-token',
    );
    expect(whatsappService.processDueWebhookInbox).toHaveBeenCalledWith(10);
  });

  it('applyRetention authenticates the batch request', async () => {
    whatsappService.applyRetentionPolicy.mockResolvedValue({
      processedInboxDeleted: 2,
      deadLettersDeleted: 1,
      communicationsRedacted: 3,
      outboundMessagesRedacted: 4,
    });

    await expect(controller.applyRetention('batch-token')).resolves.toEqual({
      processedInboxDeleted: 2,
      deadLettersDeleted: 1,
      communicationsRedacted: 3,
      outboundMessagesRedacted: 4,
    });
    expect(whatsappService.assertBatchToken).toHaveBeenCalledWith(
      'batch-token',
    );
    expect(whatsappService.applyRetentionPolicy).toHaveBeenCalled();
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
