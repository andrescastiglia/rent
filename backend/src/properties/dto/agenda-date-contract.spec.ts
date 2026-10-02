import { CreatePropertyVisitDto } from './create-property-visit.dto';
import { CreatePropertyMaintenanceTaskDto } from './create-property-maintenance-task.dto';
import { CreateTenantActivityDto } from '../../tenants/dto/create-tenant-activity.dto';

describe('agenda date contracts', () => {
  const inputs = [
    { schema: CreatePropertyVisitDto.zodSchema, field: 'visitedAt', base: {} },
    {
      schema: CreatePropertyMaintenanceTaskDto.zodSchema,
      field: 'scheduledAt',
      base: { title: 'Inspección' },
    },
    {
      schema: CreateTenantActivityDto.zodSchema,
      field: 'dueAt',
      base: { type: 'task', subject: 'Visita' },
    },
    {
      schema: CreateTenantActivityDto.zodSchema,
      field: 'completedAt',
      base: { type: 'task', subject: 'Visita' },
    },
  ];
  it.each(inputs)(
    'preserves a civil date or an explicit UTC/offset datetime for $field',
    ({ schema, field, base }) => {
      for (const date of [
        '2026-10-01',
        '2026-10-01T13:30:00Z',
        '2026-10-01T10:30:00-03:00',
        '2026-10-01T13:30:00.123Z',
      ]) {
        expect(schema.parse({ ...base, [field]: date })).toHaveProperty(
          field,
          date,
        );
      }
    },
  );
  it.each(inputs)(
    'rejects malformed calendar values and datetimes without a timezone for $field',
    ({ schema, field, base }) => {
      for (const date of [
        '2026-02-30',
        '2026-13-01',
        '2026-10-01T25:00:00Z',
        '2026-10-01T10:30:00',
        'bad',
      ]) {
        expect(schema.safeParse({ ...base, [field]: date }).success).toBe(
          false,
        );
      }
    },
  );
});
