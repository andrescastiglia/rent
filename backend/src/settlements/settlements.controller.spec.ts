import { SettlementsController } from './settlements.controller';
import { UserRole } from '../users/entities/user.entity';

describe('SettlementsController', () => {
  const settlementsService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    getSummary: jest.fn(),
  };

  let controller: SettlementsController;

  const req = {
    user: {
      id: 'u1',
      email: 'admin@test.dev',
      companyId: 'c1',
      role: UserRole.ADMIN,
    },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new SettlementsController(settlementsService as any);
  });

  it('delegates findAll to service', async () => {
    settlementsService.findAll.mockResolvedValue([{ id: 's1' }]);
    const result = await controller.findAll(req, {});
    expect(result).toEqual([{ id: 's1' }]);
    expect(settlementsService.findAll).toHaveBeenCalledWith('c1', {}, req.user);
  });

  it('delegates getSummary to service', async () => {
    const summary = {
      totalPending: 1000,
      totalCompleted: 5000,
      lastSettlementDate: '2024-03-15',
      pendingCount: 1,
      completedCount: 3,
    };
    settlementsService.getSummary.mockResolvedValue(summary);
    const result = await controller.getSummary(req, undefined);
    expect(result).toEqual(summary);
    expect(settlementsService.getSummary).toHaveBeenCalledWith(
      'c1',
      req.user,
      undefined,
    );
  });

  it('delegates findOne to service', async () => {
    settlementsService.findOne.mockResolvedValue({ id: 's1' });
    const result = await controller.findOne('s1', req);
    expect(result).toEqual({ id: 's1' });
    expect(settlementsService.findOne).toHaveBeenCalledWith('s1', 'c1');
  });
});
