import { NotFoundException } from '@nestjs/common';
import { UserRole } from '../users/entities/user.entity';
import { SettlementsService } from './settlements.service';
import { SettlementStatus } from './entities/settlement.entity';

describe('SettlementsService', () => {
  const settlementsRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const ownersRepository = {
    findOne: jest.fn(),
  };
  const dataSource = {
    query: jest.fn(),
  };

  let service: SettlementsService;

  const adminUser = {
    id: 'u1',
    companyId: 'c1',
    role: UserRole.ADMIN,
  };
  const ownerUser = {
    id: 'u2',
    companyId: 'c1',
    role: UserRole.OWNER,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SettlementsService(
      settlementsRepository as any,
      ownersRepository as any,
      dataSource as any,
    );
  });

  describe('findAll', () => {
    it('returns settlements for admin with no filters', async () => {
      dataSource.query.mockResolvedValue([{ id: 's1' }]);
      const result = await service.findAll('c1', {}, adminUser);
      expect(result).toEqual([{ id: 's1' }]);
    });

    it('scopes by owner when role=OWNER', async () => {
      ownersRepository.findOne.mockResolvedValue({ id: 'o1' });
      dataSource.query.mockResolvedValue([{ id: 's1' }]);
      const result = await service.findAll('c1', {}, ownerUser);
      expect(result).toEqual([{ id: 's1' }]);
      const [sql] = dataSource.query.mock.calls[0] as [string, string[]];
      expect(sql).toContain('s.owner_id');
    });

    it('filters by status when provided', async () => {
      dataSource.query.mockResolvedValue([]);
      await service.findAll(
        'c1',
        { status: SettlementStatus.COMPLETED },
        adminUser,
      );
      const [sql] = dataSource.query.mock.calls[0] as [string, string[]];
      expect(sql).toContain('s.status');
    });
  });

  describe('findOne', () => {
    it('returns settlement when found', async () => {
      dataSource.query.mockResolvedValue([{ id: 's1' }]);
      const result = await service.findOne('s1', 'c1');
      expect(result).toEqual({ id: 's1' });
    });

    it('throws NotFoundException when not found', async () => {
      dataSource.query.mockResolvedValue([]);
      await expect(service.findOne('s1', 'c1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getSummary', () => {
    it('returns aggregated summary', async () => {
      dataSource.query.mockResolvedValue([
        {
          status: SettlementStatus.PENDING,
          total_net: '5000',
          count: '3',
          last_date: null,
        },
        {
          status: SettlementStatus.COMPLETED,
          total_net: '12000',
          count: '8',
          last_date: '2024-03-15',
        },
      ]);
      const result = await service.getSummary('c1', adminUser);
      expect(result.totalPending).toBe(5000);
      expect(result.totalCompleted).toBe(12000);
      expect(result.pendingCount).toBe(3);
      expect(result.completedCount).toBe(8);
      expect(result.lastSettlementDate).toBe('2024-03-15');
    });

    it('scopes by owner when role=OWNER', async () => {
      ownersRepository.findOne.mockResolvedValue({ id: 'o1' });
      dataSource.query.mockResolvedValue([]);
      await service.getSummary('c1', ownerUser);
      const [, params] = dataSource.query.mock.calls[0] as [string, string[]];
      expect(params).toContain('o1');
    });
  });
});
