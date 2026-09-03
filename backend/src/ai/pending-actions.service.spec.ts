import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { UserRole } from '../users/entities/user.entity';
import { PendingActionsService } from './pending-actions.service';

describe('PendingActionsService', () => {
  const dataSource = { query: jest.fn() };
  const executor = { executeApproved: jest.fn() };
  const authService = { verifyReauthentication: jest.fn() };
  let service: PendingActionsService;

  const reviewer = {
    id: 'staff-1',
    companyId: 'company-1',
    role: UserRole.ADMIN,
  };
  const pending = {
    id: 'action-1',
    company_id: 'company-1',
    requested_by: 'user-1',
    tool_name: 'create_owner',
    payload: { name: 'Ana' },
    status: 'executing',
    execution_key: '22222222-2222-4222-8222-222222222222',
    payload_hash: createHash('sha256')
      .update(JSON.stringify({ name: 'Ana' }))
      .digest('hex'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PendingActionsService(
      dataSource as any,
      executor as any,
      authService as any,
    );
  });

  it('lists company actions with pending items first', async () => {
    dataSource.query.mockResolvedValueOnce([pending]);

    await expect(service.list('company-1')).resolves.toEqual([pending]);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining("pa.status = 'pending'"),
      ['company-1'],
    );
  });

  it('approves, executes and returns the updated action', async () => {
    const executed = { ...pending, status: 'executed' };
    dataSource.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([pending])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([executed]);
    executor.executeApproved.mockResolvedValueOnce({ id: 'owner-1' });

    await expect(
      service.approve('action-1', reviewer, 'reauth-token'),
    ).resolves.toEqual(executed);
    expect(authService.verifyReauthentication).toHaveBeenCalledWith(
      'reauth-token',
      reviewer,
    );
    expect(executor.executeApproved).toHaveBeenCalledWith(
      'create_owner',
      pending.payload,
      {
        userId: 'staff-1',
        companyId: 'company-1',
        role: UserRole.ADMIN,
        idempotencyKey: pending.execution_key,
      },
    );
    expect(dataSource.query.mock.calls[2][1][1]).toBe(
      JSON.stringify({ id: 'owner-1' }),
    );
  });

  it('records execution failures without losing the action', async () => {
    const failed = { ...pending, status: 'failed' };
    dataSource.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([pending])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([failed]);
    executor.executeApproved.mockRejectedValueOnce(new Error('invalid data'));

    await expect(
      service.approve('action-1', reviewer, 'reauth-token'),
    ).resolves.toEqual(failed);
    expect(dataSource.query.mock.calls[2][1]).toEqual([
      'action-1',
      'invalid data',
    ]);
  });

  it('rejects actions with an optional normalized reason', async () => {
    const rejected = { ...pending, status: 'rejected' };
    dataSource.query
      .mockResolvedValueOnce([{ id: 'action-1' }])
      .mockResolvedValueOnce([rejected]);

    await expect(
      service.reject('action-1', reviewer, '  Duplicado  '),
    ).resolves.toEqual(rejected);
    expect(dataSource.query.mock.calls[0][1]).toEqual([
      'action-1',
      'company-1',
      'staff-1',
      'Duplicado',
    ]);
  });

  it('rejects already reviewed or missing actions', async () => {
    dataSource.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(
      service.approve('action-1', reviewer, 'reauth-token'),
    ).rejects.toThrow(BadRequestException);

    dataSource.query.mockResolvedValueOnce([]);
    await expect(service.reject('action-1', reviewer)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects a mutated proposal before execution', async () => {
    dataSource.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...pending, payload: { name: 'Otra' } }])
      .mockResolvedValueOnce([]);

    await expect(
      service.approve('action-1', reviewer, 'reauth-token'),
    ).rejects.toThrow(BadRequestException);
    expect(executor.executeApproved).not.toHaveBeenCalled();
  });
});
