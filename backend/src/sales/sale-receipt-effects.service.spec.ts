import { SaleReceiptEffectsService } from './sale-receipt-effects.service';
import { SaleReceiptEffectsController } from './sale-receipt-effects.controller';

describe('Sale receipt effects', () => {
  function setup() {
    const receipt = {
      id: 'receipt-1',
      pdfUrl: null as string | null,
      agreement: { companyId: 'company-1' },
    };
    const repository = {
      findOneOrFail: jest.fn().mockResolvedValue(receipt),
      save: jest.fn(),
    };
    const events = [
      {
        id: 'event-1',
        company_id: 'company-1',
        entity_id: receipt.id,
        attempts: 0,
      },
    ];
    const manager = {
      getRepository: jest.fn().mockReturnValue(repository),
      query: jest.fn(async (sql: string) =>
        sql.startsWith('SELECT id') ? events.splice(0, 1) : [],
      ),
    };
    const dataSource = {
      transaction: jest.fn(async (work) => work(manager)),
      query: jest.fn().mockResolvedValue([{ queued: 0, deadLetter: 0 }]),
    };
    const pdf = {
      generate: jest.fn().mockResolvedValue('db://document/sale-receipt'),
    };
    const service = new SaleReceiptEffectsService(
      dataSource as never,
      pdf as never,
    );
    return { receipt, repository, manager, pdf, service };
  }

  it('persists the PDF and receipt in the claimed transaction', async () => {
    const f = setup();
    await expect(f.service.processDue()).resolves.toMatchObject({
      completed: 1,
      failed: 0,
    });
    expect(f.pdf.generate).toHaveBeenCalledWith(
      f.receipt,
      f.receipt.agreement,
      f.manager,
    );
    expect(f.repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ pdfUrl: 'db://document/sale-receipt' }),
    );
  });

  it('does not regenerate a completed receipt on replay', async () => {
    const f = setup();
    f.receipt.pdfUrl = 'db://document/existing';
    await f.service.processDue();
    expect(f.pdf.generate).not.toHaveBeenCalled();
    expect(f.repository.save).not.toHaveBeenCalled();
  });

  it.each(['company', 'agreement', 'missing', 'pdf', 'save'])(
    'retries %s failures without committing an incomplete PDF',
    async (failure) => {
      const f = setup();
      if (failure === 'company')
        f.receipt.agreement.companyId = 'foreign-company';
      if (failure === 'agreement') f.receipt.agreement = undefined as never;
      if (failure === 'missing')
        f.repository.findOneOrFail.mockRejectedValue(new Error('missing'));
      if (failure === 'pdf') f.pdf.generate.mockRejectedValue(new Error('pdf'));
      if (failure === 'save')
        f.repository.save.mockRejectedValue(new Error('save'));
      await expect(f.service.processDue()).resolves.toMatchObject({
        completed: 0,
        failed: 1,
      });
      expect(f.manager.query).toHaveBeenCalledWith(
        'ROLLBACK TO SAVEPOINT document_effects',
      );
      if (['company', 'agreement', 'missing'].includes(failure))
        expect(f.pdf.generate).not.toHaveBeenCalled();
    },
  );

  it('checks the batch credential before starting the worker', async () => {
    const effects = {
      processDue: jest.fn().mockResolvedValue({ completed: 1 }),
    };
    const communications = { assertBatchToken: jest.fn() };
    const controller = new SaleReceiptEffectsController(
      effects as never,
      communications as never,
    );
    await expect(controller.process('valid')).resolves.toEqual({
      completed: 1,
    });
    expect(communications.assertBatchToken).toHaveBeenCalledWith('valid');
    effects.processDue.mockClear();
    communications.assertBatchToken.mockImplementation(() => {
      throw new Error('unauthorized');
    });
    expect(() => controller.process()).toThrow('unauthorized');
    expect(effects.processDue).not.toHaveBeenCalled();
  });
});
