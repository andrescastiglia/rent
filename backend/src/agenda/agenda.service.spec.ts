import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AgendaService } from './agenda.service';
import { AgendaActor, AgendaEntry, TaskInput } from './agenda.dto';
import { SalesService } from '../sales/sales.service';
jest.mock('../common/helpers/domain-operation-receipt', () => ({
  withDomainOperationReceipt: (
    _m: unknown,
    _c: string,
    _k: string,
    _o: string,
    _p: unknown,
    action: () => unknown,
  ) => action(),
}));
const uuid = '11111111-1111-4111-8111-111111111111';
const actor: AgendaActor = { id: uuid, companyId: uuid, role: 'admin' };
const row = (extra = {}) =>
  ({
    id: `task:${uuid}`,
    title: 'Call',
    version: '1',
    timezone: 'America/Argentina/Buenos_Aires',
    reminderMinutes: 15,
    reminderHour: 9,
    scheduledDate: null,
    scheduledAt: null,
    editable: true,
    sourceType: null,
    status: 'pending',
    ...extra,
  }) as AgendaEntry;
describe('Agenda permissions, input validation and optimistic writes', () => {
  let service: AgendaService;
  const query = jest.fn();
  const sales = { getSchedule: jest.fn() };
  beforeEach(() => {
    query.mockReset().mockResolvedValue([]);
    sales.getSchedule.mockReset();
    service = new AgendaService(
      {
        query,
        transaction: (fn: (m: unknown) => unknown) => fn({ query }),
      } as unknown as DataSource,
      sales as unknown as SalesService,
    );
  });
  it.each([
    { ...actor, companyId: '' },
    { ...actor, role: 'owner' },
    { ...actor, roles: ['tenant'] },
  ])('rejects external or companyless actors', (a) => {
    expect(() => service.assertInternal(a)).toThrow(ForbiddenException);
  });
  it('accepts a secondary internal role', () => {
    expect(() =>
      service.assertInternal({
        ...actor,
        role: 'owner',
        roles: ['owner', 'staff'],
      }),
    ).not.toThrow();
  });
  it.each([
    ['a', ['a']],
    ['a', { length: 1 }],
    ['a', 42],
    ['a', 'x'.repeat(201)],
  ])('rejects parameter tampering before SQL (%s)', async (_label, input) => {
    await expect(service.people(actor, input as string)).rejects.toThrow(
      BadRequestException,
    );
    expect(query).not.toHaveBeenCalled();
  });
  it('keeps searches parameterized and bounds results', async () => {
    query.mockResolvedValue([{ name: 'Ana' }]);
    expect(await service.people(actor, "a' OR 1=1")).toEqual([{ name: 'Ana' }]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('LIMIT 100'), [
      uuid,
      "%a' OR 1=1%",
    ]);
    await service.people(actor);
    await service.staff(actor);
  });
  it('uses bounded company defaults', async () => {
    expect(await service.config(actor)).toEqual({
      timezone: 'America/Argentina/Buenos_Aires',
      reminderMinutes: 15,
      reminderHour: 9,
    });
    query.mockResolvedValue([
      {
        settings: {
          timezone: 'UTC',
          agenda: { reminderMinutes: 0, reminderHour: 23 },
        },
      },
    ]);
    expect(await service.config(actor)).toEqual({
      timezone: 'UTC',
      reminderMinutes: 0,
      reminderHour: 23,
    });
    query.mockResolvedValue([
      { settings: { agenda: { reminderMinutes: -1, reminderHour: 24 } } },
    ]);
    expect((await service.config(actor)).reminderHour).toBe(9);
  });
  it.each([
    { page: 0 },
    { from: '2026-10-05', to: '2026-10-01' },
    { search: ['a'] },
  ])('rejects invalid list queries', async (q) => {
    await expect(service.entries(actor, q as never)).rejects.toThrow(
      BadRequestException,
    );
  });
  it('filters, paginates and preserves permission restrictions', async () => {
    query.mockResolvedValue([
      row({ sourceType: 'owner', scheduledDate: '2026-10-01' }),
      row({
        id: `visit:${uuid}`,
        editable: false,
        sourceType: 'property',
        scheduledAt: new Date('2026-10-03T12:00:00Z'),
      }),
    ]);
    const result = await service.entries(
      { ...actor, role: 'staff', permissions: { owners: true } },
      {
        kind: 'visit',
        status: 'all',
        from: '2026-10-01',
        to: '2026-10-10',
        search: 'Call',
        personType: 'owner',
        personId: uuid,
        responsibleUserId: uuid,
        page: 2,
        limit: 1,
      },
    );
    expect(result.total).toBe(2);
    expect(result.data[0].canEdit).toBe(false);
    expect(result.data[0].scheduledAt).toBe('2026-10-03T12:00:00.000Z');
    expect(query.mock.calls[0][1]).toEqual([
      uuid,
      '2026-10-01',
      '2026-10-10',
      '%Call%',
      'owner',
      uuid,
      'visit',
      uuid,
    ]);
    const all = await service.entries(
      actor,
      { unscheduled: 'true', responsibleUserId: 'unassigned' },
      true,
    );
    expect(all.data).toHaveLength(2);
    expect(query.mock.calls[1][0]).toContain('IS NULL');
  });
  it('isolates entry and person lookups and validates identifiers', async () => {
    expect(() => service.validateEntryId('task:invalid')).toThrow(
      BadRequestException,
    );
    await expect(service.person(actor, 'owner', 'bad')).rejects.toThrow(
      BadRequestException,
    );
    expect(await service.person(actor, 'owner', uuid)).toBeNull();
    await expect(service.entry(actor, `task:${uuid}`)).rejects.toThrow(
      NotFoundException,
    );
    query.mockResolvedValue([row({ sourceType: 'owner' })]);
    expect(
      (
        await service.entry(
          { ...actor, role: 'staff', permissions: { owners: true } },
          `task:${uuid}`,
        )
      ).canEdit,
    ).toBe(true);
    await service.history(actor, `task:${uuid}`);
    await service.history(actor, `visit:${uuid}`);
  });
  it('requires keys and valid schemas before mutations', async () => {
    await expect(service.create(actor, { title: 'x' }, '')).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.create(actor, { title: '' }, 'key')).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.update(actor, `task:${uuid}`, { version: 1 }, ''),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.update(actor, `task:${uuid}`, { version: 0 }, 'key'),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.update(actor, `visit:${uuid}`, { version: 1 }, 'key'),
    ).rejects.toThrow(BadRequestException);
  });
  it.each([
    { locationType: 'property' },
    { locationType: 'property', locationId: uuid },
    { kind: 'visit', locationType: 'property', locationId: uuid },
    { personType: 'owner' },
    { scheduledDate: '2026-10-03', scheduledAt: '2026-10-03T12:00:00Z' },
    { endsAt: '2026-10-03T11:00:00Z' },
    { scheduledAt: '2026-10-03T12:00:00Z', endsAt: '2026-10-03T11:00:00Z' },
    { personType: 'owner', personId: uuid },
    { responsibleUserId: uuid },
    { sourceCommunicationId: uuid },
    { relatedEntryId: `task:${uuid}` },
  ])(
    'rejects unavailable references or contradictory schedules: %j',
    async (input) => {
      await expect(
        service.create(actor, { title: 'Call', ...input } as TaskInput, 'key'),
      ).rejects.toThrow();
    },
  );
  it('rejects locations and people without module permission', async () => {
    await expect(
      service.create(
        { ...actor, role: 'staff' },
        {
          title: 'Visit',
          kind: 'visit',
          locationType: 'property',
          locationId: uuid,
        },
        'key',
      ),
    ).rejects.toThrow(ForbiddenException);
    query.mockResolvedValue([{ person_id: uuid }]);
    await expect(
      service.create(
        { ...actor, role: 'staff' },
        { title: 'Call', personType: 'owner', personId: uuid },
        'key',
      ),
    ).rejects.toThrow(ForbiddenException);
  });
  it.each(['interested', 'tenant', 'owner', 'buyer'])(
    'creates optional linked histories for %s',
    async (personType) => {
      query.mockResolvedValue([{ id: uuid, person_id: uuid }]);
      const result = await service.create(
        actor,
        {
          title: 'Visit',
          kind: 'visit',
          personType,
          personId: uuid,
          locationType: 'tenant',
          locationId: uuid,
          responsibleUserId: uuid,
          sourceCommunicationId: uuid,
          scheduledDate: '2026-10-03',
        } as TaskInput,
        'key',
      );
      expect(result.id).toMatch(/^task:/);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO agenda_tasks'),
        expect.arrayContaining([uuid, 'Visit']),
      );
      if (personType !== 'buyer')
        expect(query).toHaveBeenCalledWith(
          expect.stringContaining('_activities'),
          expect.any(Array),
        );
    },
  );
  it('creates a general task with no CRM history', async () => {
    await expect(
      service.create(actor, { title: 'General' }, 'key'),
    ).resolves.toEqual({ id: expect.stringMatching(/^task:/) });
    expect(query.mock.calls.some(([sql]) => sql.includes('_activities'))).toBe(
      false,
    );
  });
  it('rejects missing, stale, forbidden and relinked tasks', async () => {
    await expect(
      service.update(
        actor,
        `task:${uuid}`,
        { version: 1, title: 'New' },
        'key',
      ),
    ).rejects.toThrow(NotFoundException);
    query.mockResolvedValue([{ version: 2, source_type: 'owner' }]);
    await expect(
      service.update(actor, `task:${uuid}`, { version: 1 }, 'key'),
    ).rejects.toThrow(ConflictException);
    await expect(
      service.update(
        { ...actor, role: 'staff' },
        `task:${uuid}`,
        { version: 2 },
        'key',
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.update(
        actor,
        `task:${uuid}`,
        { version: 2, personId: uuid },
        'key',
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.update(actor, `task:${uuid}`, { version: 2 }, 'key'),
    ).rejects.toThrow(BadRequestException);
  });
  it('updates a task without resetting its schedule or responsible person', async () => {
    query.mockResolvedValue([
      {
        version: 1,
        title: 'Old',
        scheduled_at: new Date('2026-10-03T12:00:00Z'),
      },
    ]);
    await expect(
      service.update(
        actor,
        `task:${uuid}`,
        { version: 1, title: 'New', responsibleUserId: null },
        'key',
      ),
    ).resolves.toEqual({ id: `task:${uuid}` });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'UPDATE agenda_tasks SET title=$3,responsible_user_id=$4',
      ),
      [uuid, uuid, 'New', null],
    );
  });
  it('validates settings and keeps version checks under the transaction lock', async () => {
    await expect(
      service.entrySettings(actor, `visit:${uuid}`, {}, ''),
    ).rejects.toThrow(BadRequestException);
    query.mockResolvedValue([row()]);
    await expect(
      service.entrySettings(actor, `visit:${uuid}`, {}, 'key'),
    ).rejects.toThrow(BadRequestException);
    query.mockResolvedValue([row({ editable: false, sourceType: 'property' })]);
    await expect(
      service.entrySettings(actor, `visit:${uuid}`, {}, 'key'),
    ).rejects.toThrow(BadRequestException);
    const settings = {
      version: '1:America/Argentina/Buenos_Aires:15:9',
      responsibleUserId: null,
      reminderMinutes: 0,
      reminderHour: 23,
    };
    await expect(
      service.entrySettings(
        { ...actor, role: 'staff' },
        `visit:${uuid}`,
        settings,
        'key',
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.entrySettings(
        actor,
        `visit:${uuid}`,
        { ...settings, version: 'stale' },
        'key',
      ),
    ).rejects.toThrow(ConflictException);
    await expect(
      service.entrySettings(actor, `visit:${uuid}`, settings, 'key'),
    ).resolves.toEqual({ id: `visit:${uuid}` });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      [uuid + `visit:${uuid}`],
    );
  });
  it('includes sale installment schedule and overlays', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM sale_agreements'))
        return [
          {
            id: uuid,
            start_date: '2026-10-01',
            buyer_id: uuid,
            updated_at: new Date('2026-10-01T12:00:00Z'),
          },
        ];
      if (sql.includes('SELECT name,phone')) return [{ name: 'Buyer' }];
      if (sql.includes('SELECT s.*'))
        return [
          {
            responsible_user_id: uuid,
            reminder_hour: 8,
            reminder_minutes: 0,
            version: 2,
            name: 'Staff',
          },
        ];
      if (sql.startsWith('SELECT ($1::date+make_time'))
        return [{ at: new Date('2026-10-04T11:00:00Z') }];
      return [];
    });
    sales.getSchedule.mockResolvedValue({
      data: [
        { installmentNumber: 1, dueDate: '2026-10-04', status: 'paid' },
        { installmentNumber: 2, dueDate: '2026-11-04', status: 'pending' },
      ],
      total: 2,
      paidAmount: 10,
    });
    const result = await service.entries(actor, {
      from: '2026-10-01',
      to: '2026-10-31',
      status: 'all',
    });
    expect(result.data[0]).toMatchObject({
      kind: 'sale',
      status: 'completed',
      personName: 'Buyer',
      responsibleUserId: uuid,
      canEdit: true,
    });
    expect((await service.entry(actor, `sale:${uuid}:1`)).id).toBe(
      `sale:${uuid}:1`,
    );
    expect(
      (await service.entries(actor, { status: 'pending', to: '2026-10-31' }))
        .data,
    ).toEqual([]);
    expect(
      (await service.entries(actor, { search: 'no match', to: '2026-10-31' }))
        .data,
    ).toEqual([]);
  });
});
