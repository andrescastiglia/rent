import { Brackets } from 'typeorm';
import { OwnersService } from './owners.service';
import { OwnerListQueryDto } from './dto/owner-list-query.dto';
import { UserRole } from '../users/entities/user.entity';

describe('Paginated owner contact directory', () => {
  const actor = { id: 'staff', companyId: 'company', role: UserRole.STAFF };
  function setup() {
    const query = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[{ id: 'owner' }], 47]),
    };
    const repository = { createQueryBuilder: jest.fn(() => query) };
    const service = new OwnersService(
      repository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, query, repository };
  }

  it('searches the entire company and preserves total independently of page length', async () => {
    const f = setup();
    await expect(
      f.service.getPage(actor, {
        page: 3,
        limit: 20,
        search: ' Ana_% ',
        sortOrder: 'DESC',
      }),
    ).resolves.toEqual({
      data: [{ id: 'owner' }],
      total: 47,
      page: 3,
      limit: 20,
    });
    expect(f.query.where).toHaveBeenCalledWith('owner.company_id=:companyId', {
      companyId: 'company',
    });
    expect(f.query.leftJoinAndSelect).toHaveBeenCalledWith(
      'owner.user',
      'person',
      expect.stringContaining('person.company_id=:companyId'),
      { companyId: 'company' },
    );
    expect(f.query.andWhere).toHaveBeenCalledWith('owner.deleted_at IS NULL');
    expect(f.query.orderBy).toHaveBeenCalledWith('person.lastName', 'DESC');
    expect(f.query.addOrderBy).toHaveBeenLastCalledWith('owner.id', 'ASC');
    expect(f.query.skip).toHaveBeenCalledWith(40);
    expect(f.query.take).toHaveBeenCalledWith(20);
    const bracket = f.query.andWhere.mock.calls.find(
      ([condition]) => condition instanceof Brackets,
    )![0] as Brackets;
    const where = {
      where: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
    };
    bracket.whereFactory(where as never);
    expect(where.where).toHaveBeenCalledWith(
      expect.stringContaining('person.first_name'),
      { search: '%Ana\\_\\%%' },
    );
    expect(where.orWhere).toHaveBeenCalledWith('person.email ILIKE :search', {
      search: '%Ana\\_\\%%',
    });
    expect(where.orWhere).toHaveBeenCalledWith('person.phone ILIKE :search', {
      search: '%Ana\\_\\%%',
    });
    expect(where.orWhere).toHaveBeenCalledWith('owner.tax_id ILIKE :search', {
      search: '%Ana\\_\\%%',
    });
  });

  it.each([{}, { search: '  ' }])(
    'uses bounded defaults and skips an empty search %#',
    async (filters) => {
      const f = setup();
      await expect(f.service.getPage(actor, filters)).resolves.toMatchObject({
        total: 47,
        page: 1,
        limit: 20,
      });
      expect(f.query.skip).toHaveBeenCalledWith(0);
      expect(f.query.take).toHaveBeenCalledWith(20);
      expect(f.query.orderBy).toHaveBeenCalledWith('person.lastName', 'ASC');
      expect(f.query.andWhere).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    { ...actor, role: UserRole.OWNER },
    { ...actor, role: UserRole.TENANT },
    { ...actor, role: UserRole.BUYER },
    { ...actor, companyId: '' },
  ])(
    'denies external roles and absent company before touching the directory %#',
    async (user) => {
      const f = setup();
      await expect(f.service.getPage(user, {})).rejects.toThrow(
        'company staff',
      );
      expect(f.repository.createQueryBuilder).not.toHaveBeenCalled();
    },
  );

  it('honors an explicit internal role for a multirole person', async () => {
    const f = setup();
    await expect(
      f.service.getPage(
        {
          ...actor,
          role: UserRole.OWNER,
          roles: [UserRole.OWNER, UserRole.STAFF],
        },
        {},
      ),
    ).resolves.toMatchObject({ total: 47 });
  });

  it('validates query bounds and trims search rather than silently discarding pagination', () => {
    expect(
      OwnerListQueryDto.zodSchema.parse({
        page: '2',
        limit: '50',
        search: ' Ana ',
      }),
    ).toEqual({ page: 2, limit: 50, search: 'Ana', sortOrder: 'ASC' });
    for (const input of [
      { page: 0 },
      { page: 1.5 },
      { limit: 101 },
      { limit: 0 },
      { sortOrder: 'DROP TABLE owners' },
      { search: 'x'.repeat(201) },
      { companyId: 'foreign' },
    ])
      expect(OwnerListQueryDto.zodSchema.safeParse(input).success).toBe(false);
  });
});
