import { createHash } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { InvoiceEffectsService } from './invoice-effects.service';
import { Invoice, InvoiceStatus } from './entities/invoice.entity';
import { LeaseContractEffectsService } from '../leases/lease-contract-effects.service';
import { Lease } from '../leases/entities/lease.entity';
import {
  enqueuePayoutReceipt,
  SettlementPayoutEffectsService,
} from '../settlements/settlement-payout-effects.service';
import { Document } from '../documents/entities/document.entity';
import {
  CommunicationEvent,
  CommunicationRecipientRole,
} from '../communications/entities/communication-template.entity';

function localQueue(
  entity: unknown,
  repository: object,
  resolve: (sql: string) => unknown[],
) {
  const jobs = [
    {
      id: 'job-1',
      company_id: 'company-1',
      entity_id: 'entity-1',
      attempts: 0,
    },
  ];
  const manager = {
    query: jest.fn(async (sql: string, _params?: unknown[]) =>
      sql.includes('FOR UPDATE SKIP LOCKED') ? jobs.splice(0, 1) : resolve(sql),
    ),
    getRepository: jest.fn((requested: unknown) => {
      if (requested !== entity) throw new Error('Unexpected repository');
      return repository;
    }),
  };
  const db = {
    transaction: jest.fn(async (work: (value: unknown) => unknown) =>
      work(manager),
    ),
    query: jest.fn(async (_sql: string, _params?: unknown[]) => [
      { queued: 0, deadLetter: 0 },
    ]),
  };
  return { jobs, manager, db };
}

function expectRetry(manager: ReturnType<typeof localQueue>['manager']) {
  const statements = manager.query.mock.calls.map(([sql]) => sql);
  expect(statements).toContain('ROLLBACK TO SAVEPOINT document_effects');
  expect(statements.some((sql) => sql.includes("THEN 'dead_letter'"))).toBe(
    true,
  );
  expect(
    statements.some((sql) => sql.includes("SET status = 'completed'")),
  ).toBe(false);
}

describe('invoice effects', () => {
  const setup = () => {
    const invoice = {
      id: 'entity-1',
      companyId: 'company-1',
      leaseId: 'lease-1',
      status: InvoiceStatus.PENDING,
      deletedAt: null as Date | null,
      pdfUrl: null as string | null,
    };
    const event = {
      document_id: null as string | null,
      snapshot: {
        version: 1,
        invoice: {
          id: invoice.id,
          companyId: invoice.companyId,
          issuedAt: '2026-10-01',
          lease: { tenant: { id: 'tenant-1' } },
          invoiceNumber: 'F-2026-1',
          dueDate: '2026-10-10',
          currencyCode: 'ARS',
          total: '120.05',
        },
        paymentUrl: 'https://rent.test/pay/invoice-1',
      },
    };
    const recipient = {
      id: 'tenant-1',
      phone: '5491112345678',
      name: 'Ana Pérez',
      language: 'es' as string | null,
    };
    const repo = {
      findOne: jest.fn().mockResolvedValue(invoice),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const f = localQueue(Invoice, repo, (sql) => {
      if (sql.includes('SELECT snapshot,document_id')) return [event];
      if (sql.includes('SELECT t.id')) return [recipient];
      return [];
    });
    const pdf = {
      generateSnapshot: jest.fn().mockResolvedValue('db://document/document-1'),
    };
    const communications = { dispatchEvent: jest.fn().mockResolvedValue({}) };
    return {
      ...f,
      invoice,
      event,
      recipient,
      repo,
      pdf,
      communications,
      service: new InvoiceEffectsService(
        f.db as never,
        pdf as never,
        communications as never,
      ),
    };
  };

  it('renders the issued snapshot and atomically stores its document and notification', async () => {
    const f = setup();
    await expect(f.service.processDue()).resolves.toMatchObject({
      completed: 1,
      failed: 0,
    });
    expect(f.repo.findOne).toHaveBeenCalledWith({
      where: { id: 'entity-1', companyId: 'company-1' },
      withDeleted: true,
      lock: { mode: 'pessimistic_write' },
    });
    expect(f.pdf.generateSnapshot).toHaveBeenCalledWith(
      f.event.snapshot,
      f.manager,
    );
    expect(f.repo.update).toHaveBeenCalledWith(
      { id: 'entity-1', companyId: 'company-1' },
      { pdfUrl: 'db://document/document-1' },
    );
    expect(f.communications.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        event: CommunicationEvent.INVOICE_ISSUED,
        recipientRole: CommunicationRecipientRole.TENANT,
        recipientId: 'tenant-1',
        recipient: '5491112345678',
        consented: true,
        forceSend: true,
        variables: expect.objectContaining({ monto: 'ARS 120.05' }),
        relatedEntityId: 'entity-1',
        metadata: expect.objectContaining({
          attachmentUrl: 'db://document/document-1',
        }),
      }),
      f.manager,
    );
    const recipientQuery = f.manager.query.mock.calls.find(([sql]) =>
      sql.includes('SELECT t.id'),
    );
    expect(recipientQuery?.[1]).toEqual(['lease-1', 'company-1', 'tenant-1']);
    expect(recipientQuery?.[0]).toContain('t.contact_consent=true');
    expect(recipientQuery?.[0]).toContain('u.whatsapp_enabled=true');
  });

  it.each([
    InvoiceStatus.PAID,
    InvoiceStatus.CANCELLED,
    InvoiceStatus.REFUNDED,
  ])(
    'preserves the original issued document but sends no invoice notice after %s',
    async (status) => {
      const f = setup();
      f.invoice.status = status;
      await f.service.processDue();
      expect(f.pdf.generateSnapshot).toHaveBeenCalled();
      expect(f.communications.dispatchEvent).not.toHaveBeenCalled();
    },
  );

  it.each(['deleted', 'missing-tenant', 'missing-recipient'])(
    'generates the document without delivery for %s',
    async (state) => {
      const f = setup();
      if (state === 'deleted') f.invoice.deletedAt = new Date();
      if (state === 'missing-tenant')
        f.event.snapshot.invoice.lease = undefined as never;
      if (state === 'missing-recipient')
        f.manager.query.mockImplementation(async (sql: string) => {
          if (sql.includes('FOR UPDATE SKIP LOCKED'))
            return f.jobs.splice(0, 1);
          if (sql.includes('SELECT snapshot,document_id')) return [f.event];
          return [];
        });
      await expect(f.service.processDue()).resolves.toMatchObject({
        completed: 1,
      });
      expect(f.pdf.generateSnapshot).toHaveBeenCalled();
      expect(f.communications.dispatchEvent).not.toHaveBeenCalled();
    },
  );

  it('defaults a recipient without a language to Spanish', async () => {
    const f = setup();
    f.recipient.language = null;
    await f.service.processDue();
    expect(f.communications.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'es' }),
      f.manager,
    );
  });

  it.each([
    'missing-event',
    'existing-event-document',
    'missing-invoice',
    'existing-invoice-document',
    'invalid-version',
    'foreign-invoice',
    'foreign-company',
    'not-issued',
    'pdf',
    'dispatch',
  ])('rolls back incomplete effects for %s', async (state) => {
    const f = setup();
    if (state === 'missing-event')
      f.manager.query.mockImplementation(async (sql: string) =>
        sql.includes('FOR UPDATE SKIP LOCKED') ? f.jobs.splice(0, 1) : [],
      );
    if (state === 'existing-event-document') f.event.document_id = 'document-0';
    if (state === 'missing-invoice') f.repo.findOne.mockResolvedValue(null);
    if (state === 'existing-invoice-document')
      f.invoice.pdfUrl = 'db://existing';
    if (state === 'invalid-version') f.event.snapshot.version = 2;
    if (state === 'foreign-invoice') f.event.snapshot.invoice.id = 'foreign';
    if (state === 'foreign-company')
      f.event.snapshot.invoice.companyId = 'foreign';
    if (state === 'not-issued') f.event.snapshot.invoice.issuedAt = '';
    if (state === 'pdf')
      f.pdf.generateSnapshot.mockRejectedValue(new Error('PDF'));
    if (state === 'dispatch')
      f.communications.dispatchEvent.mockRejectedValue(new Error('enqueue'));
    await expect(f.service.processDue()).resolves.toMatchObject({
      completed: 0,
      failed: 1,
    });
    expectRetry(f.manager);
  });
});

describe('confirmed contract effects', () => {
  const setup = () => {
    const event = {
      document_id: null as string | null,
      requested_by: 'admin-1',
      snapshot: {
        text: '<p>Confirmed clauses</p>',
        format: 'html',
        locale: 'pt',
        confirmedAt: '2026-10-01T15:00:00Z',
        version: 3,
      },
    };
    const repo = {
      findOne: jest.fn().mockResolvedValue({ id: 'entity-1' }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const f = localQueue(Lease, repo, (sql) =>
      sql.includes('SELECT snapshot,requested_by') ? [event] : [],
    );
    const pdf = {
      generateContract: jest.fn().mockResolvedValue({
        id: 'contract-document',
        fileUrl: 'db://document/contract-document',
      }),
    };
    return {
      ...f,
      event,
      repo,
      pdf,
      service: new LeaseContractEffectsService(f.db as never, pdf as never),
    };
  };

  it('uses the confirmed text and locale instead of later live contract changes', async () => {
    const f = setup();
    await expect(f.service.processDue()).resolves.toMatchObject({
      completed: 1,
    });
    expect(f.pdf.generateContract).toHaveBeenCalledWith(
      {
        id: 'entity-1',
        companyId: 'company-1',
        confirmedAt: new Date('2026-10-01T15:00:00Z'),
        versionNumber: 3,
        tenant: { user: { language: 'pt' } },
      },
      'admin-1',
      '<p>Confirmed clauses</p>',
      'html',
      f.manager,
    );
    expect(f.repo.update).toHaveBeenCalledWith(
      { id: 'entity-1', companyId: 'company-1' },
      { contractPdfUrl: 'db://document/contract-document' },
    );
  });

  it.each([
    'missing-event',
    'existing-document',
    'missing-lease',
    'empty-text',
    'missing-text',
    'invalid-format',
    'invalid-date',
    'pdf',
  ])('retries %s without marking the job complete', async (state) => {
    const f = setup();
    if (state === 'missing-event')
      f.manager.query.mockImplementation(async (sql: string) =>
        sql.includes('FOR UPDATE SKIP LOCKED') ? f.jobs.splice(0, 1) : [],
      );
    if (state === 'existing-document') f.event.document_id = 'document-0';
    if (state === 'missing-lease') f.repo.findOne.mockResolvedValue(null);
    if (state === 'empty-text') f.event.snapshot.text = ' ';
    if (state === 'missing-text') f.event.snapshot.text = undefined as never;
    if (state === 'invalid-format') f.event.snapshot.format = 'markdown';
    if (state === 'invalid-date') f.event.snapshot.confirmedAt = 'unknown';
    if (state === 'pdf')
      f.pdf.generateContract.mockRejectedValue(new Error('PDF'));
    await expect(f.service.processDue()).resolves.toMatchObject({ failed: 1 });
    expectRetry(f.manager);
  });
});

describe('payout receipt effects', () => {
  const setup = () => {
    const snapshot = {
      version: 1,
      movementId: 'entity-1',
      settlementId: 'settlement-1',
      ownerId: 'owner-1',
      ownerName: 'Owner Name',
      companyName: 'Company Name',
      period: '2026-10',
      kind: 'transfer',
      amount: '90.00',
      currency: 'ARS',
      grossAmount: '100.00',
      commissionAmount: '10.00',
      withholdingsAmount: '0.00',
      transactionId: 'transaction-1',
      providerUpdatedAt: '2026-10-01T15:00:00Z',
    };
    const event = {
      id: 'document-1',
      snapshot,
      document_id: null as string | null,
    };
    const settlement = { status: 'completed' };
    const owner = {
      phone: '5491112345678',
      preferred_contact_channel: 'whatsapp',
      contact_consent: true,
      whatsapp_enabled: true,
      language: 'en' as string | null,
    };
    const repo = {
      create: jest.fn((data: unknown) => data),
      save: jest.fn().mockResolvedValue({}),
    };
    const f = localQueue(Document, repo, (sql) => {
      if (sql.includes('SELECT e.id,e.snapshot')) return [event];
      if (sql.includes('SELECT status FROM settlements')) return [settlement];
      if (sql.includes('SELECT o.contact_consent')) return [owner];
      return [];
    });
    const pdf = {
      generate: jest.fn().mockResolvedValue(Buffer.from('immutable PDF')),
    };
    const communications = { dispatchEvent: jest.fn().mockResolvedValue({}) };
    const config = { enabled: jest.fn().mockReturnValue(true) };
    return {
      ...f,
      snapshot,
      event,
      settlement,
      owner,
      repo,
      pdf,
      communications,
      config,
      service: new SettlementPayoutEffectsService(
        f.db as never,
        pdf as never,
        communications as never,
        config as never,
      ),
    };
  };

  it('does not touch the queue while payout integration is disabled', async () => {
    const f = setup();
    f.config.enabled.mockReturnValue(false);
    await expect(f.service.processDue()).resolves.toMatchObject({
      disabled: true,
      processed: 0,
    });
    expect(f.db.transaction).not.toHaveBeenCalled();
    expect(f.db.query).not.toHaveBeenCalled();
    expect(f.pdf.generate).not.toHaveBeenCalled();
  });

  it.each(['transfer', 'reversal'])(
    'stores immutable %s evidence and enqueues its matching notice',
    async (kind) => {
      const f = setup();
      f.snapshot.kind = kind;
      f.settlement.status = kind === 'reversal' ? 'reversed' : 'completed';
      await expect(f.service.processDue()).resolves.toMatchObject({
        completed: 1,
      });
      const buffer = Buffer.from('immutable PDF');
      expect(f.repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 'company-1',
          entityId: 'settlement-1',
          fileData: buffer,
          fileMimeType: 'application/pdf',
          fileSize: buffer.length,
          metadata: expect.objectContaining({
            kind,
            sha256: createHash('sha256').update(buffer).digest('hex'),
          }),
        }),
      );
      expect(f.communications.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event:
            kind === 'transfer'
              ? CommunicationEvent.SETTLEMENT_PAID
              : CommunicationEvent.SETTLEMENT_REVERSED,
          recipientRole: CommunicationRecipientRole.OWNER,
          recipientId: 'owner-1',
          consented: true,
          locale: 'en',
          metadata: expect.objectContaining({ payoutMovementKind: kind }),
        }),
        f.manager,
      );
    },
  );

  it('does not render or send an existing artifact again', async () => {
    const f = setup();
    f.event.document_id = 'document-1';
    await expect(f.service.processDue()).resolves.toMatchObject({
      completed: 1,
    });
    expect(f.pdf.generate).not.toHaveBeenCalled();
    expect(f.communications.dispatchEvent).not.toHaveBeenCalled();
  });

  it.each(['reversed-payment', 'no-phone', 'email', 'missing-owner'])(
    'preserves the evidence without delivering for %s',
    async (state) => {
      const f = setup();
      if (state === 'reversed-payment') f.settlement.status = 'reversed';
      if (state === 'no-phone') f.owner.phone = '';
      if (state === 'email') f.owner.preferred_contact_channel = 'email';
      if (state === 'missing-owner')
        f.manager.query.mockImplementation(async (sql: string) => {
          if (sql.includes('FOR UPDATE SKIP LOCKED'))
            return f.jobs.splice(0, 1);
          if (sql.includes('SELECT e.id,e.snapshot')) return [f.event];
          if (sql.includes('SELECT status FROM settlements'))
            return [f.settlement];
          return [];
        });
      await expect(f.service.processDue()).resolves.toMatchObject({
        completed: 1,
      });
      expect(f.repo.save).toHaveBeenCalled();
      expect(f.communications.dispatchEvent).not.toHaveBeenCalled();
    },
  );

  it.each(['contact-consent', 'whatsapp-consent'])(
    'passes revoked %s to the consent-aware queue and defaults locale',
    async (state) => {
      const f = setup();
      if (state === 'contact-consent') f.owner.contact_consent = false;
      if (state === 'whatsapp-consent') f.owner.whatsapp_enabled = false;
      f.owner.language = null;
      await f.service.processDue();
      expect(f.communications.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({ consented: false, locale: 'es' }),
        f.manager,
      );
    },
  );

  it.each([
    'missing-event',
    'invalid-version',
    'foreign-movement',
    'missing-settlement',
    'pdf',
    'dispatch',
  ])('retries %s with all partial effects rolled back', async (state) => {
    const f = setup();
    if (state === 'missing-event' || state === 'missing-settlement')
      f.manager.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FOR UPDATE SKIP LOCKED')) return f.jobs.splice(0, 1);
        if (state !== 'missing-event' && sql.includes('SELECT e.id,e.snapshot'))
          return [f.event];
        return [];
      });
    if (state === 'invalid-version') f.snapshot.version = 2;
    if (state === 'foreign-movement') f.snapshot.movementId = 'foreign';
    if (state === 'pdf') f.pdf.generate.mockRejectedValue(new Error('PDF'));
    if (state === 'dispatch')
      f.communications.dispatchEvent.mockRejectedValue(new Error('enqueue'));
    await expect(f.service.processDue()).resolves.toMatchObject({ failed: 1 });
    expectRetry(f.manager);
  });

  it('downloads historical evidence only for its settlement/company and verifies checksum', async () => {
    const f = setup();
    const buffer = Buffer.from('immutable PDF');
    const checksum = createHash('sha256').update(buffer).digest('hex');
    f.db.query.mockResolvedValue([{ file_data: buffer, checksum }] as never);
    await expect(
      f.service.download('settlement-1', 'movement-1', 'company-1'),
    ).resolves.toEqual({
      buffer,
      checksum,
      filename: 'liquidacion-movement-1.pdf',
    });
    expect(f.db.query.mock.calls[0][1]).toEqual([
      'movement-1',
      'settlement-1',
      'company-1',
    ]);
    expect(f.db.query.mock.calls[0][0]).toContain('d.company_id=m.company_id');
    expect(f.db.query.mock.calls[0][0]).toContain(
      'd.entity_id=m.settlement_id',
    );
  });

  it.each(['missing', 'missing-data', 'corrupt'])(
    'rejects a %s historical document',
    async (state) => {
      const f = setup();
      const rows =
        state === 'missing'
          ? []
          : [
              {
                file_data:
                  state === 'missing-data' ? null : Buffer.from('changed'),
                checksum: 'invalid',
              },
            ];
      f.db.query.mockResolvedValue(rows as never);
      await expect(
        f.service.download('settlement-1', 'movement-1', 'company-1'),
      ).rejects.toBeInstanceOf(
        state === 'corrupt' ? ConflictException : NotFoundException,
      );
    },
  );

  it('requires the atomic payout receipt snapshot to be inserted', async () => {
    const manager = { query: jest.fn().mockResolvedValue([{ id: 'event-1' }]) };
    await expect(
      enqueuePayoutReceipt(manager as never, 'movement-1'),
    ).resolves.toBeUndefined();
    expect(manager.query.mock.calls[0][1]).toEqual(['movement-1']);
    manager.query.mockResolvedValue([]);
    await expect(
      enqueuePayoutReceipt(manager as never, 'movement-2'),
    ).rejects.toThrow('Payout receipt snapshot could not be persisted');
  });
});
