import { ForbiddenException } from '@nestjs/common';
import { BankMovementDirection } from './entities/bank-movement.entity';
import { BankReconciliationController } from './bank-reconciliation.controller';

describe('BankReconciliationController', () => {
  const service = {
    ingestSandboxMovement: jest.fn(),
    reconcile: jest.fn(),
  };
  const controller = new BankReconciliationController(service as any);
  const request = { user: { companyId: 'company-1' } };

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.NODE_ENV;
  });

  it('forwards sandbox ingestion outside production', async () => {
    const dto = {
      externalId: 'movement-1',
      direction: BankMovementDirection.CREDIT,
      amount: 100,
      occurredAt: '2026-08-01',
    };
    service.ingestSandboxMovement.mockResolvedValue({ id: 'result' });
    await expect(
      controller.ingestSandboxMovement(request, dto),
    ).resolves.toEqual({ id: 'result' });
    expect(service.ingestSandboxMovement).toHaveBeenCalledWith(
      'company-1',
      dto,
    );
  });

  it('disables sandbox ingestion in production', () => {
    process.env.NODE_ENV = 'production';
    expect(() =>
      controller.ingestSandboxMovement(request, {
        externalId: 'movement-1',
        direction: BankMovementDirection.CREDIT,
        amount: 100,
        occurredAt: '2026-08-01',
      }),
    ).toThrow(ForbiddenException);
    expect(service.ingestSandboxMovement).not.toHaveBeenCalled();
  });

  it('forwards a manual retry within company scope', async () => {
    service.reconcile.mockResolvedValue({ id: 'result' });
    await expect(controller.reconcile(request, 'movement-1')).resolves.toEqual({
      id: 'result',
    });
    expect(service.reconcile).toHaveBeenCalledWith('movement-1', 'company-1');
  });
});
