import { PaymentEffectsService } from './payment-effects.service';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { Receipt } from './entities/receipt.entity';
import { CreditNote } from './entities/credit-note.entity';
import { CommunicationChannel } from '../communications/entities/communication-template.entity';

describe('PaymentEffectsService', () => {
  const tenant = () => ({
    id: 'tenant-1',
    contactConsent: true,
    user: {
      phone: '5491112345678',
      whatsappEnabled: true,
      firstName: 'Ana',
      lastName: 'Test',
      language: 'es',
    },
  });
  const setup = () => {
    const person = tenant();
    const payment = {
      id: 'payment-1',
      companyId: 'company-1',
      status: PaymentStatus.COMPLETED,
      amount: '120',
      currencyCode: 'ARS',
      tenant: person,
      tenantAccount: { balance: '0', lease: { tenant: person } },
    };
    const receipt: any = {
      id: 'receipt-1',
      receiptNumber: 'R-1',
      pdfUrl: null,
      cancelledAt: null,
    };
    const notes: any[] = [
      {
        id: 'note-1',
        noteNumber: 'NC-1',
        amount: '20',
        currencyCode: 'ARS',
        pdfUrl: null,
        invoice: { companyId: 'company-1', lease: { tenant: person } },
      },
    ];
    const paymentRepo = {
      findOne: jest.fn().mockResolvedValue(payment),
      findOneOrFail: jest.fn().mockResolvedValue(payment),
    };
    const receiptRepo = {
      findOneOrFail: jest.fn().mockResolvedValue(receipt),
      save: jest.fn(),
    };
    const noteRepo = {
      find: jest.fn().mockResolvedValue(notes),
      findOneOrFail: jest.fn(async ({ where }) =>
        notes.find((note) => note.id === where.id),
      ),
      save: jest.fn(),
    };
    const events = [
      {
        id: 'event-1',
        entity_id: 'payment-1',
        company_id: 'company-1',
        attempts: 0,
      },
    ];
    const manager = {
      query: jest.fn(async (sql: string) =>
        sql.startsWith('SELECT id') ? events.splice(0, 1) : [],
      ),
      getRepository: jest.fn((entity: unknown) => {
        if (entity === Payment) return paymentRepo;
        if (entity === Receipt) return receiptRepo;
        if (entity === CreditNote) return noteRepo;
        throw new Error('Unexpected repository');
      }),
    };
    const dataSource = {
      transaction: jest.fn(
        async (work: (manager: unknown) => Promise<unknown>) => work(manager),
      ),
      query: jest.fn().mockResolvedValue([{ queued: 0, deadLetter: 0 }]),
    };
    const receiptPdf = {
      generate: jest.fn().mockResolvedValue('db://document/receipt'),
    };
    const notePdf = {
      generate: jest.fn().mockResolvedValue('db://document/note'),
    };
    const communications = { dispatchEvent: jest.fn() };
    const service = new PaymentEffectsService(
      dataSource as never,
      receiptPdf as never,
      notePdf as never,
      communications as never,
    );
    return {
      service,
      payment,
      receipt,
      notes,
      person,
      events,
      manager,
      dataSource,
      paymentRepo,
      receiptRepo,
      noteRepo,
      receiptPdf,
      notePdf,
      communications,
    };
  };

  it('renders documents and queues consent-aware deliveries on the claimed transaction', async () => {
    const f = setup();
    await expect(f.service.processDue()).resolves.toEqual({
      processed: 1,
      completed: 1,
      failed: 0,
      queued: 0,
      deadLetter: 0,
    });
    expect(f.paymentRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'payment-1', companyId: 'company-1' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(f.receiptPdf.generate).toHaveBeenCalledWith(
      f.receipt,
      f.payment,
      f.manager,
    );
    expect(f.notePdf.generate).toHaveBeenCalledWith(
      f.notes[0],
      f.notes[0].invoice,
      f.manager,
    );
    expect(f.receiptRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        pdfUrl: 'db://document/receipt',
        pdfGeneratedAt: expect.any(Date),
      }),
    );
    expect(f.communications.dispatchEvent).toHaveBeenCalledTimes(2);
    for (const [delivery, manager] of f.communications.dispatchEvent.mock
      .calls) {
      expect(delivery).toMatchObject({
        companyId: 'company-1',
        consented: true,
        relatedEntityId: 'payment-1',
      });
      expect(manager).toBe(f.manager);
    }
  });

  it('skips all effects for a cancelled payment', async () => {
    const f = setup();
    f.payment.status = PaymentStatus.CANCELLED;
    await expect(f.service.processDue()).resolves.toMatchObject({
      completed: 1,
      failed: 0,
    });
    expect(f.receiptPdf.generate).not.toHaveBeenCalled();
    expect(f.notePdf.generate).not.toHaveBeenCalled();
    expect(f.communications.dispatchEvent).not.toHaveBeenCalled();
  });

  it.each([
    'missing',
    'pending',
    'foreign-invoice',
    'missing-invoice',
    'render',
    'dispatch',
  ])(
    'retries %s failures without committing partial effects',
    async (failure) => {
      const f = setup();
      if (failure === 'missing') f.paymentRepo.findOne.mockResolvedValue(null);
      if (failure === 'pending') f.payment.status = PaymentStatus.PENDING;
      if (failure === 'foreign-invoice')
        f.notes[0].invoice.companyId = 'other-company';
      if (failure === 'missing-invoice') f.notes[0].invoice = null;
      if (failure === 'render')
        f.receiptPdf.generate.mockRejectedValue(new Error('render failed'));
      if (failure === 'dispatch')
        f.communications.dispatchEvent.mockRejectedValue(
          new Error('dispatch failed'),
        );
      await expect(f.service.processDue()).resolves.toMatchObject({
        completed: 0,
        failed: 1,
      });
      const sql = f.manager.query.mock.calls.map(([query]) => query);
      expect(sql).toContain('ROLLBACK TO SAVEPOINT document_effects');
      expect(sql.some((query) => query.includes("THEN 'dead_letter'"))).toBe(
        true,
      );
      expect(
        sql.some((query) => query.includes("SET status = 'completed'")),
      ).toBe(false);
    },
  );

  it('does not regenerate existing documents or repeat their notifications', async () => {
    const f = setup();
    f.receipt.pdfUrl = 'db://existing-receipt';
    f.notes[0].pdfUrl = 'db://existing-note';
    await f.service.processDue();
    expect(f.receiptPdf.generate).not.toHaveBeenCalled();
    expect(f.notePdf.generate).not.toHaveBeenCalled();
    expect(f.communications.dispatchEvent).not.toHaveBeenCalled();
  });

  it('skips cancelled receipts and does not enqueue a note without a recipient', async () => {
    const f = setup();
    f.receipt.cancelledAt = new Date();
    f.notes[0].invoice.lease = null;
    await f.service.processDue();
    expect(f.receiptPdf.generate).not.toHaveBeenCalled();
    expect(f.notePdf.generate).toHaveBeenCalled();
    expect(f.communications.dispatchEvent).not.toHaveBeenCalled();
  });

  it('uses the lease tenant when the payment has no direct tenant and preserves consent', async () => {
    const f = setup();
    f.payment.tenant = undefined as never;
    f.person.contactConsent = false;
    f.person.user.language = undefined as never;
    await f.service.processDue();
    expect(f.communications.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'tenant-1',
        consented: false,
        locale: 'es',
      }),
      f.manager,
    );
  });

  it.each(['no-tenant', 'no-phone', 'email'])(
    'renders the receipt without dispatch for %s',
    async (state) => {
      const f = setup();
      f.notes.splice(0);
      if (state === 'no-tenant') {
        f.payment.tenant = undefined as never;
        f.payment.tenantAccount = undefined as never;
      }
      if (state === 'no-phone') f.person.user.phone = '';
      if (state === 'email')
        Object.assign(f.person, {
          preferredContactChannel: CommunicationChannel.EMAIL,
        });
      await f.service.processDue();
      expect(f.receiptPdf.generate).toHaveBeenCalled();
      expect(f.communications.dispatchEvent).not.toHaveBeenCalled();
    },
  );

  it('stops without claiming work when the queue is empty and exposes dead letters', async () => {
    const f = setup();
    f.events.splice(0);
    f.dataSource.query.mockResolvedValue([{ queued: 2, deadLetter: 1 }]);
    await expect(f.service.processDue()).resolves.toEqual({
      processed: 0,
      completed: 0,
      failed: 0,
      queued: 2,
      deadLetter: 1,
    });
    expect(f.dataSource.transaction).toHaveBeenCalledTimes(1);
  });
});
