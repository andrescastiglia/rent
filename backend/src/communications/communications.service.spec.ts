import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { CommunicationsService } from './communications.service';
import {
  CommunicationChannel,
  CommunicationEvent,
  CommunicationRecipientRole,
} from './entities/communication-template.entity';
import { CommunicationDeliveryStatus } from './entities/communication-delivery.entity';

describe('CommunicationsService', () => {
  const templatesRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn(async (data) => data),
  };
  const deliveriesRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((data) => ({ id: 'delivery-1', ...data })),
    save: jest.fn(async (data) => data),
  };
  const whatsappService = {
    sendTextMessage: jest.fn(),
  };
  let service: CommunicationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    templatesRepository.findOne.mockResolvedValue(null);
    whatsappService.sendTextMessage.mockResolvedValue({
      messageId: 'wamid-1',
    });
    service = new CommunicationsService(
      templatesRepository as any,
      deliveriesRepository as any,
      whatsappService as any,
    );
  });

  const dispatchInput = {
    companyId: 'company-1',
    event: CommunicationEvent.PAYMENT_RECEIVED,
    recipientRole: CommunicationRecipientRole.TENANT,
    recipientId: 'tenant-1',
    channel: CommunicationChannel.WHATSAPP,
    recipient: '+5491111111111',
    variables: { nombre: 'Ana', monto: 100 },
    fallbackBody: 'Hola {{nombre}}, recibimos {{monto}}.',
    consented: true,
    relatedEntityType: 'payment',
    relatedEntityId: '00000000-0000-4000-8000-000000000001',
  };

  it('renders a preview and reports missing variables', async () => {
    await expect(
      service.preview('company-1', {
        body: 'Hola {{nombre}}, saldo {{saldo}}',
        variables: { nombre: 'Ana' },
      }),
    ).resolves.toEqual({
      subject: null,
      body: 'Hola Ana, saldo ',
      missingVariables: ['saldo'],
    });
  });

  it('records a blocked delivery when consent is absent', async () => {
    const result = await service.dispatchEvent({
      ...dispatchInput,
      consented: false,
    });

    expect(result.status).toBe(CommunicationDeliveryStatus.BLOCKED);
    expect(result.errorMessage).toContain('not consented');
    expect(whatsappService.sendTextMessage).not.toHaveBeenCalled();
  });

  it('sends immediately and records provider status', async () => {
    const result = await service.dispatchEvent({
      ...dispatchInput,
      metadata: { attachmentUrl: 'db://document/document-1' },
    });

    expect(whatsappService.sendTextMessage).toHaveBeenCalledWith(
      '+5491111111111',
      'Hola Ana, recibimos 100.',
      'db://document/document-1',
      expect.objectContaining({ companyId: 'company-1' }),
    );
    expect(result.status).toBe(CommunicationDeliveryStatus.SENT);
    expect(result.providerMessageId).toBe('wamid-1');
  });

  it('queues failed deliveries with exponential retry', async () => {
    whatsappService.sendTextMessage.mockRejectedValueOnce(
      new Error('provider unavailable'),
    );

    const result = await service.dispatchEvent(dispatchInput);

    expect(result.status).toBe(CommunicationDeliveryStatus.FAILED);
    expect(result.attempts).toBe(1);
    expect(result.nextAttemptAt).toBeInstanceOf(Date);
    expect(result.errorMessage).toBe('provider unavailable');
  });

  it('requires approval for reviewed templates and sends after approval', async () => {
    templatesRepository.findOne.mockResolvedValue({
      id: 'template-1',
      subject: null,
      body: 'Hola {{nombre}}',
      requiresApproval: true,
      autoSend: false,
    });
    const pending = await service.dispatchEvent(dispatchInput);
    expect(pending.status).toBe(CommunicationDeliveryStatus.PENDING_APPROVAL);

    deliveriesRepository.findOne.mockResolvedValue(pending);
    const approved = await service.approve(pending.id, 'company-1');
    expect(approved.status).toBe(CommunicationDeliveryStatus.SENT);
  });

  it('rejects an invalid retry token', () => {
    process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN = 'expected';
    expect(() => service.assertBatchToken('wrong')).toThrow(
      UnauthorizedException,
    );
    delete process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN;
  });

  it('rejects retrying a non-failed delivery', async () => {
    deliveriesRepository.findOne.mockResolvedValue({
      id: 'delivery-1',
      companyId: 'company-1',
      status: CommunicationDeliveryStatus.SENT,
    });
    await expect(service.retry('delivery-1', 'company-1')).rejects.toThrow(
      BadRequestException,
    );
  });
});
