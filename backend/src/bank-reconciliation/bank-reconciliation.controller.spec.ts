import { ForbiddenException } from '@nestjs/common';
import { BankMovementDirection } from './entities/bank-movement.entity';
import { BankReconciliationController } from './bank-reconciliation.controller';
import { BankReconciliationAlertStatus } from './entities/bank-reconciliation-alert.entity';

describe('BankReconciliationController', () => {
  const service = {
    ingestSandboxMovement: jest.fn(),
    reconcile: jest.fn(),
    assertBatchToken: jest.fn(),
    reconcileInternal: jest.fn(),
    findAlerts: jest.fn(),
    resolveAlert: jest.fn(),
  };
  const controller = new BankReconciliationController(service as any);
  const request = { user: { id: 'user-1', companyId: 'company-1' } };

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

  it('authenticates and forwards internal batch retries', async () => {
    service.reconcileInternal.mockResolvedValue({ id: 'result' });
    await expect(
      controller.reconcileFromBatch('movement-1', 'bank-token'),
    ).resolves.toEqual({ id: 'result' });
    expect(service.assertBatchToken).toHaveBeenCalledWith('bank-token');
    expect(service.reconcileInternal).toHaveBeenCalledWith('movement-1');
  });

  it('lists and resolves alerts within the authenticated company', async () => {
    service.findAlerts.mockResolvedValue([{ id: 'alert-1' }]);
    await expect(
      controller.findAlerts(request, BankReconciliationAlertStatus.OPEN),
    ).resolves.toEqual([{ id: 'alert-1' }]);
    expect(service.findAlerts).toHaveBeenCalledWith(
      'company-1',
      BankReconciliationAlertStatus.OPEN,
    );

    service.resolveAlert.mockResolvedValue({
      id: 'alert-1',
      status: 'resolved',
    });
    await expect(controller.resolveAlert(request, 'alert-1')).resolves.toEqual({
      id: 'alert-1',
      status: 'resolved',
    });
    expect(service.resolveAlert).toHaveBeenCalledWith(
      'alert-1',
      'company-1',
      'user-1',
    );
  });
});
