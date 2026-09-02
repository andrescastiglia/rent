import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
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
  const dataSource = { query: jest.fn() };
  let service: CommunicationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    whatsappService.sendTextMessage.mockReset();
    templatesRepository.findOne.mockResolvedValue(null);
    deliveriesRepository.findOne.mockResolvedValue(null);
    whatsappService.sendTextMessage.mockResolvedValue({
      messageId: 'wamid-1',
    });
    service = new CommunicationsService(
      templatesRepository as any,
      deliveriesRepository as any,
      whatsappService as any,
      dataSource as any,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN;
    delete process.env.COMMUNICATION_EMAIL_WEBHOOK_URL;
    delete process.env.COMMUNICATION_EMAIL_WEBHOOK_TOKEN;
    delete process.env.COMMUNICATION_SMS_WEBHOOK_URL;
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

  it('persists an eligible delivery without calling the provider inline', async () => {
    const result = await service.dispatchEvent({
      ...dispatchInput,
      metadata: { attachmentUrl: 'db://document/document-1' },
    });

    expect(whatsappService.sendTextMessage).not.toHaveBeenCalled();
    expect(result.status).toBe(CommunicationDeliveryStatus.QUEUED);
    expect(result.providerMessageId).toBeNull();
    expect(result.nextAttemptAt).toBeInstanceOf(Date);
  });

  it('does not expose a provider failure path before the worker runs', async () => {
    whatsappService.sendTextMessage.mockRejectedValueOnce(
      new Error('provider unavailable'),
    );

    const result = await service.dispatchEvent(dispatchInput);

    expect(result.status).toBe(CommunicationDeliveryStatus.QUEUED);
    expect(result.attempts).toBe(0);
    expect(result.nextAttemptAt).toBeInstanceOf(Date);
    expect(result.errorMessage).toBeNull();
    expect(whatsappService.sendTextMessage).not.toHaveBeenCalled();
  });

  it('requires approval for reviewed templates and queues after approval', async () => {
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
    expect(approved.status).toBe(CommunicationDeliveryStatus.QUEUED);
    expect(approved.nextAttemptAt).toBeInstanceOf(Date);
    expect(whatsappService.sendTextMessage).not.toHaveBeenCalled();
  });

  it('rejects an invalid retry token', () => {
    process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN = 'expected';
    expect(() => service.assertBatchToken('wrong')).toThrow(
      UnauthorizedException,
    );
  });

  it('requires a configured retry token and accepts the configured value', () => {
    expect(() => service.assertBatchToken()).toThrow(
      ServiceUnavailableException,
    );
    process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN = ' expected ';
    expect(() => service.assertBatchToken('expected')).not.toThrow();
  });

  it('lists templates and deliveries with their operational ordering', async () => {
    templatesRepository.find.mockResolvedValueOnce([{ id: 'template-1' }]);
    deliveriesRepository.find.mockResolvedValueOnce([{ id: 'delivery-1' }]);

    await expect(service.listTemplates('company-1')).resolves.toEqual([
      { id: 'template-1' },
    ]);
    await expect(service.listDeliveries('company-1')).resolves.toEqual([
      { id: 'delivery-1' },
    ]);
    expect(deliveriesRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 }),
    );
  });

  it('lists the WhatsApp inbox and marks a communication as read', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ id: 'communication-1', status: 'new' }])
      .mockResolvedValueOnce([{ id: 'communication-1', status: 'read' }]);

    await expect(service.listInbox('company-1')).resolves.toEqual([
      { id: 'communication-1', status: 'new' },
    ]);
    await expect(
      service.markInboxRead('communication-1', {
        id: 'staff-1',
        companyId: 'company-1',
      }),
    ).resolves.toEqual({ id: 'communication-1', status: 'read' });
    expect(dataSource.query.mock.calls[0][0]).toContain(
      "pc.direction = 'inbound'",
    );
    expect(dataSource.query.mock.calls[1][1]).toEqual([
      'communication-1',
      'company-1',
      'staff-1',
    ]);
  });

  it('rejects missing inbox messages and revoked consent', async () => {
    dataSource.query.mockResolvedValueOnce([]);
    await expect(
      service.markInboxRead('missing', {
        id: 'staff-1',
        companyId: 'company-1',
      }),
    ).rejects.toThrow(NotFoundException);

    dataSource.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ whatsapp_enabled: false }]);
    await expect(
      service.replyToInbox(
        'missing',
        {
          id: 'staff-1',
          companyId: 'company-1',
        },
        'Hola',
      ),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.replyToInbox(
        'communication-1',
        {
          id: 'staff-1',
          companyId: 'company-1',
        },
        'Hola',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('replies through WhatsApp and records an owner activity', async () => {
    const incoming = {
      id: 'communication-1',
      company_id: 'company-1',
      user_id: 'user-1',
      person_type: 'owner',
      person_id: 'owner-1',
      phone: '+5491111111111',
      whatsapp_enabled: true,
    };
    dataSource.query
      .mockResolvedValueOnce([incoming])
      .mockResolvedValueOnce([{ id: 'reply-1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(
      service.replyToInbox(
        'communication-1',
        {
          id: 'staff-1',
          companyId: 'company-1',
        },
        '  Respuesta  ',
      ),
    ).resolves.toEqual({ id: 'reply-1' });
    expect(whatsappService.sendTextMessage).toHaveBeenCalledWith(
      incoming.phone,
      'Respuesta',
      undefined,
      { companyId: 'company-1' },
    );
    expect(dataSource.query.mock.calls[3][0]).toContain(
      'INSERT INTO owner_activities',
    );
  });

  it('records interested replies and skips unsupported activity owners', async () => {
    await (service as any).recordReplyActivity(
      {
        id: 'communication-2',
        company_id: 'company-1',
        person_type: 'interested',
        person_id: 'interested-1',
      },
      'staff-1',
      'Respuesta',
    );
    expect(dataSource.query.mock.calls[0][0]).toContain(
      'INSERT INTO interested_activities',
    );
    await (service as any).recordReplyActivity(
      { person_type: 'buyer', person_id: 'buyer-1' },
      'staff-1',
      'Respuesta',
    );
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('creates templates with defaults and inferred unique variables', async () => {
    const result = await service.createTemplate('company-1', {
      name: 'Recordatorio',
      event: CommunicationEvent.PAYMENT_REMINDER,
      recipientRole: CommunicationRecipientRole.TENANT,
      channel: CommunicationChannel.WHATSAPP,
      locale: 'es',
      subject: 'Hola {{nombre}}',
      body: '{{nombre}}, vence {{fecha}}',
    });

    expect(result).toEqual(
      expect.objectContaining({
        companyId: 'company-1',
        locale: 'es',
        isActive: true,
        autoSend: true,
        requiresApproval: false,
        variables: ['nombre', 'fecha'],
      }),
    );
  });

  it('updates a template and recalculates variables', async () => {
    templatesRepository.findOne.mockResolvedValueOnce({
      id: 'template-1',
      companyId: 'company-1',
      subject: null,
      body: 'Anterior',
      channel: CommunicationChannel.WHATSAPP,
      variables: [],
    });

    const result = await service.updateTemplate('template-1', 'company-1', {
      subject: 'Saldo {{saldo}}',
      body: 'Hola {{nombre}}',
    });

    expect(result.variables).toEqual(['saldo', 'nombre']);
  });

  it('rejects unknown templates and deliveries', async () => {
    await expect(
      service.updateTemplate('missing', 'company-1', { body: 'Hola' }),
    ).rejects.toThrow(NotFoundException);
    await expect(service.approve('missing', 'company-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('previews stored templates and rejects an empty message', async () => {
    templatesRepository.findOne.mockResolvedValueOnce({
      id: 'template-1',
      subject: 'Hola {{nombre}}',
      body: 'Saldo {{saldo}}',
    });
    await expect(
      service.preview('company-1', {
        templateId: 'template-1',
        variables: { nombre: 'Ana', saldo: 10 },
      }),
    ).resolves.toEqual({
      subject: 'Hola Ana',
      body: 'Saldo 10',
      missingVariables: [],
    });
    await expect(
      service.preview('company-1', { body: '', variables: {} }),
    ).rejects.toThrow(BadRequestException);
  });

  it('validates test variables and sends a forced test delivery', async () => {
    await expect(
      service.sendTest('company-1', {
        channel: CommunicationChannel.WHATSAPP,
        recipient: '+5491111111111',
        body: 'Hola {{nombre}}',
        variables: {},
      }),
    ).rejects.toThrow('Missing variables: nombre');

    const delivery = await service.sendTest('company-1', {
      channel: CommunicationChannel.WHATSAPP,
      recipient: '+5491111111111',
      body: 'Hola {{nombre}}',
      variables: { nombre: 'Ana' },
    });
    expect(delivery.status).toBe(CommunicationDeliveryStatus.QUEUED);
    expect(delivery.metadata).toEqual({ test: true });
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

  it('retries failed deliveries and summarizes due attempts', async () => {
    const failedDelivery = {
      ...deliveriesRepository.create(dispatchInput),
      id: 'failed-1',
      companyId: 'company-1',
      channel: CommunicationChannel.WHATSAPP,
      body: 'Hola',
      status: CommunicationDeliveryStatus.FAILED,
      attempts: 1,
      maxAttempts: 3,
      metadata: {},
      relatedEntityType: 'payment',
    };
    deliveriesRepository.findOne.mockResolvedValueOnce(failedDelivery);
    await expect(service.retry('failed-1', 'company-1')).resolves.toEqual(
      expect.objectContaining({ status: CommunicationDeliveryStatus.QUEUED }),
    );
    expect(whatsappService.sendTextMessage).not.toHaveBeenCalled();

    const dueToSend = {
      ...failedDelivery,
      id: 'due-1',
      status: CommunicationDeliveryStatus.PROCESSING,
      attempts: 1,
    };
    const dueToFail = {
      ...failedDelivery,
      id: 'due-2',
      status: CommunicationDeliveryStatus.PROCESSING,
      attempts: 1,
    };
    dataSource.query.mockResolvedValueOnce([{ id: 'due-1' }, { id: 'due-2' }]);
    deliveriesRepository.findOne
      .mockResolvedValueOnce(dueToSend)
      .mockResolvedValueOnce(dueToFail);
    whatsappService.sendTextMessage
      .mockResolvedValueOnce({ messageId: 'sent-due' })
      .mockRejectedValueOnce(new Error('still unavailable'));

    await expect(service.retryDue()).resolves.toEqual({
      processed: 2,
      sent: 1,
      failed: 1,
    });
    expect(dataSource.query.mock.calls[0][0]).toContain(
      'FOR UPDATE SKIP LOCKED',
    );
    expect(whatsappService.sendTextMessage).toHaveBeenCalledWith(
      dueToSend.recipient,
      dueToSend.body,
      undefined,
      expect.objectContaining({ idempotencyKey: 'due-1' }),
    );
  });

  it('rejects email and SMS before contacting a provider', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    await expect(
      service.dispatchEvent({
        ...dispatchInput,
        channel: CommunicationChannel.EMAIL,
        recipient: 'ana@example.com',
        skipTemplateLookup: true,
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.dispatchEvent({
        ...dispatchInput,
        channel: CommunicationChannel.SMS,
        recipient: '+5491111111111',
        skipTemplateLookup: true,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
