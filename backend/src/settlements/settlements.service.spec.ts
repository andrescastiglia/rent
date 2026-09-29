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

  it.each(['', 'other-company'])(
    'rejects a missing or conflicting company scope (%s)',
    async (companyId) => {
      await expect(service.findAll(companyId, {}, adminUser)).rejects.toThrow(
        'Company scope required',
      );
      await expect(service.findOne('s1', companyId, adminUser)).rejects.toThrow(
        'Company scope required',
      );
      await expect(service.getSummary(companyId, adminUser)).rejects.toThrow(
        'Company scope required',
      );
      expect(dataSource.query).not.toHaveBeenCalled();
      expect(ownersRepository.findOne).not.toHaveBeenCalled();
    },
  );

  it('allows staff with an owner role to read the company scope', async () => {
    dataSource.query.mockResolvedValue([]);
    await service.findAll(
      'c1',
      {},
      { ...ownerUser, roles: [UserRole.OWNER, UserRole.STAFF] },
    );
    expect(ownersRepository.findOne).not.toHaveBeenCalled();
    expect(dataSource.query.mock.calls[0][1]).toEqual(['c1']);
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

    it('returns no settlements when an owner has no linked profile', async () => {
      ownersRepository.findOne.mockResolvedValue(null);

      await expect(service.findAll('c1', {}, ownerUser)).resolves.toEqual([]);
      expect(dataSource.query).not.toHaveBeenCalled();
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
      const result = await service.findOne('s1', 'c1', adminUser);
      expect(result).toEqual({ id: 's1' });
    });

    it('scopes an owner lookup to its linked owner profile', async () => {
      ownersRepository.findOne.mockResolvedValue({ id: 'o1' });
      dataSource.query.mockResolvedValue([{ id: 's1' }]);

      await service.findOne('s1', 'c1', ownerUser);

      const [sql, params] = dataSource.query.mock.calls[0] as [
        string,
        string[],
      ];
      expect(sql).toContain('s.owner_id = $3');
      expect(params).toEqual(['c1', 's1', 'o1']);
    });

    it('hides settlements when an owner has no linked profile', async () => {
      ownersRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('s1', 'c1', ownerUser)).rejects.toThrow(
        NotFoundException,
      );
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when not found', async () => {
      dataSource.query.mockResolvedValue([]);
      await expect(service.findOne('s1', 'c1', adminUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getSummary', () => {
    it('preserves exact amounts, currencies and recorded statuses', async () => {
      const totals = [
        {
          currencyCode: 'ARS',
          status: 'pending',
          netAmount: '9007199254740993.01',
          count: 3,
          lastProcessedAt: null,
        },
        {
          currencyCode: 'USD',
          status: 'completed',
          netAmount: '12.01',
          count: 1,
          lastProcessedAt: '2026-09-01T12:00:00Z',
        },
      ];
      dataSource.query.mockResolvedValue(totals);
      expect(await service.getSummary('c1', adminUser)).toEqual({ totals });
    });
    it('scopes owners despite a requested owner filter', async () => {
      ownersRepository.findOne.mockResolvedValue({ id: 'o1' });
      dataSource.query.mockResolvedValue([]);
      await service.getSummary('c1', ownerUser, { ownerId: 'foreign' });
      expect(dataSource.query.mock.calls[0][1]).toEqual(['c1', 'o1']);
    });
    it('returns no totals for an unlinked owner', async () => {
      ownersRepository.findOne.mockResolvedValue(null);
      expect(await service.getSummary('c1', ownerUser)).toEqual({ totals: [] });
      expect(dataSource.query).not.toHaveBeenCalled();
    });
    it('rejects inverted month bounds for list and summary', async () => {
      const filters = { periodStart: '2026-10', periodEnd: '2026-09' };
      await expect(
        service.getSummary('c1', adminUser, filters),
      ).rejects.toThrow('periodStart');
      await expect(service.findAll('c1', filters, adminUser)).rejects.toThrow(
        'periodStart',
      );
      expect(dataSource.query).not.toHaveBeenCalled();
    });
  });
});
