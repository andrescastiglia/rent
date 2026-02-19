import { ForbiddenException, HttpStatus } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';

describe('WhatsappController', () => {
  const whatsappService = {
    sendTextMessage: jest.fn(),
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
    );
  });

  it('verifyWebhook returns challenge on valid subscribe token', () => {
    whatsappService.verifyWebhookToken.mockReturnValue(true);
    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      sendStatus: jest.fn().mockReturnThis(),
    } as any;

    controller.verifyWebhook(
      {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'verify',
        'hub.challenge': 'challenge-1',
      } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(res.send).toHaveBeenCalledWith('challenge-1');
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
        'hub.challenge': 'challenge-1',
      } as any,
      res,
    );

    expect(res.sendStatus).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
  });

  it('receiveWebhook delegates and returns ack', () => {
    const payload = { entry: [] } as any;
    expect(controller.receiveWebhook(payload)).toEqual({ received: true });
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
