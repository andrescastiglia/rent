import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { withDomainOperationReceipt } from '../common/helpers/domain-operation-receipt';
import {
  AgendaActor,
  AgendaEntry,
  AgendaQuery,
  TaskInput,
  agendaQuerySchema,
  taskSchema,
  updateTaskSchema,
} from './agenda.dto';
import { SalesService } from '../sales/sales.service';
import { UserRole } from '../users/entities/user.entity';
const personModules: Record<string, string> = {
  interested: 'interested',
  tenant: 'tenants',
  owner: 'owners',
  buyer: 'sales',
  user: 'users',
};
const fieldColumns: Record<string, string> = {
  title: 'title',
  description: 'description',
  kind: 'kind',
  personType: 'person_type',
  personId: 'person_id',
  responsibleUserId: 'responsible_user_id',
  scheduledDate: 'scheduled_date',
  scheduledAt: 'scheduled_at',
  endsAt: 'ends_at',
  reminderMinutes: 'reminder_minutes',
  reminderHour: 'reminder_hour',
  status: 'status',
  relatedEntryId: 'related_entry_id',
  sourceCommunicationId: 'source_communication_id',
};
@Injectable()
export class AgendaService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly sales: SalesService,
  ) {}
  assertInternal(actor: AgendaActor) {
    if (
      !actor.companyId ||
      !(actor.roles?.length ? actor.roles : [actor.role]).some(
        (r) => r === 'admin' || r === 'staff',
      )
    )
      throw new ForbiddenException(
        'Agenda reservada al personal de la empresa',
      );
  }
  private canEdit(actor: AgendaActor, source: string | null) {
    return (
      (actor.roles?.length ? actor.roles : [actor.role]).includes('admin') ||
      !source ||
      actor.permissions?.[personModules[source] ?? source] === true
    );
  }
  async config(actor: AgendaActor) {
    this.assertInternal(actor);
    const [company] = await this.db.query(
      'SELECT settings FROM companies WHERE id=$1',
      [actor.companyId],
    );
    const settings = company?.settings ?? {};
    const defaults = settings.agenda ?? {};
    return {
      timezone: settings.timezone ?? 'America/Argentina/Buenos_Aires',
      reminderMinutes:
        Number.isInteger(defaults.reminderMinutes) &&
        defaults.reminderMinutes >= 0 &&
        defaults.reminderMinutes <= 10080
          ? defaults.reminderMinutes
          : 15,
      reminderHour:
        Number.isInteger(defaults.reminderHour) &&
        defaults.reminderHour >= 0 &&
        defaults.reminderHour <= 23
          ? defaults.reminderHour
          : 9,
    };
  }
  async people(actor: AgendaActor, search = '') {
    this.assertInternal(actor);
    if (search.length > 200)
      throw new BadRequestException('Búsqueda demasiado larga');
    return this.db.query(
      `SELECT person_type AS "personType",person_id AS "personId",name,phone,email FROM agenda_people WHERE company_id=$1 AND (name ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2) ORDER BY name,person_type LIMIT 100`,
      [actor.companyId, `%${search}%`],
    );
  }
  async staff(actor: AgendaActor) {
    this.assertInternal(actor);
    return this.db.query(
      `SELECT id,concat_ws(' ',first_name,last_name) AS name FROM users WHERE company_id=$1 AND deleted_at IS NULL AND is_active AND (CASE WHEN cardinality(roles)>0 THEN roles ELSE ARRAY[role] END)::text[] && ARRAY['admin','staff'] ORDER BY name`,
      [actor.companyId],
    );
  }
  async entries(
    actor: AgendaActor,
    query: AgendaQuery = {},
    allEntries = false,
  ) {
    this.assertInternal(actor);
    const parsed = agendaQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const q = parsed.data;
    if (q.from && q.to && q.from > q.to)
      throw new BadRequestException('Intervalo inválido');
    const values: unknown[] = [actor.companyId];
    const where = ['e.company_id=$1'];
    const add = (expr: string, value: unknown) => {
      values.push(value);
      where.push(expr.replace('?', `$${values.length}`));
    };
    if (q.from)
      add(
        `COALESCE(e.scheduled_date,(e.scheduled_at AT TIME ZONE COALESCE(c.settings->>'timezone','America/Argentina/Buenos_Aires'))::date)>=?::date`,
        q.from,
      );
    if (q.to)
      add(
        `COALESCE(e.scheduled_date,(e.scheduled_at AT TIME ZONE COALESCE(c.settings->>'timezone','America/Argentina/Buenos_Aires'))::date)<=?::date`,
        q.to,
      );
    if (q.search) add('(e.title ILIKE ?)', `%${q.search}%`);
    if (q.personType) add('e.person_type=?', q.personType);
    if (q.personId) add('e.person_id=?::uuid', q.personId);
    if (q.kind) add('e.kind=?', q.kind);
    if (q.status !== 'all') add('e.status=?', q.status);
    if (q.unscheduled === 'true')
      where.push('e.scheduled_date IS NULL AND e.scheduled_at IS NULL');
    if (q.responsibleUserId === 'unassigned')
      where.push(
        '(CASE WHEN s.entry_id IS NOT NULL THEN s.responsible_user_id ELSE e.responsible_user_id END) IS NULL',
      );
    else if (q.responsibleUserId)
      add(
        '(CASE WHEN s.entry_id IS NOT NULL THEN s.responsible_user_id ELSE e.responsible_user_id END)=?::uuid',
        q.responsibleUserId,
      );
    const rows = (await this.db.query(
      this.selectSql() +
        ` WHERE ${where.join(' AND ')} ORDER BY COALESCE(e.scheduled_date::timestamp,e.scheduled_at AT TIME ZONE COALESCE(c.settings->>'timezone','America/Argentina/Buenos_Aires')) ASC NULLS LAST,e.entry_id`,
      values,
    )) as AgendaEntry[];
    const saleEntries =
      q.unscheduled === 'true' || (q.kind && q.kind !== 'sale')
        ? []
        : await this.saleEntries(actor, q);
    const all = [
      ...rows.map((e) => this.normalize(e)),
      ...saleEntries.map((e) => this.normalize(e)),
    ].sort(
      (a, b) =>
        (a.scheduledDate ?? a.scheduledAt ?? '9999').localeCompare(
          b.scheduledDate ?? b.scheduledAt ?? '9999',
        ) || a.id.localeCompare(b.id),
    );
    return {
      data: (allEntries
        ? all
        : all.slice((q.page - 1) * q.limit, q.page * q.limit)
      ).map((e) => ({
        ...e,
        canEdit: this.canEdit(
          actor,
          e.editable
            ? e.sourceType
            : ({
                property: 'properties',
                lease: 'leases',
                invoice: 'invoices',
                sale: 'sales',
              }[e.sourceType ?? ''] ?? e.sourceType),
        ),
      })),
      total: all.length,
      page: q.page,
      limit: q.limit,
    };
  }
  private normalize(e: AgendaEntry): AgendaEntry {
    e = {
      ...e,
      version: `${e.version}:${e.timezone}:${e.reminderMinutes}:${e.reminderHour}`,
    };
    return Object.fromEntries(
      Object.entries(e).map(([key, value]) => [
        key,
        (value as unknown) instanceof Date
          ? (value as unknown as Date).toISOString()
          : value,
      ]),
    ) as AgendaEntry;
  }
  private selectSql() {
    return `SELECT e.entry_id AS id,e.title,e.description,e.kind,e.person_type AS "personType",e.person_id AS "personId",p.name AS "personName",
 CASE WHEN s.entry_id IS NOT NULL THEN s.responsible_user_id ELSE e.responsible_user_id END AS "responsibleUserId",concat_ws(' ',u.first_name,u.last_name) AS "responsibleName",
 e.scheduled_date::text AS "scheduledDate",e.scheduled_at AS "scheduledAt",e.ends_at AS "endsAt",COALESCE(s.reminder_minutes,CASE WHEN e.editable THEN e.reminder_minutes ELSE (c.settings->'agenda'->>'reminderMinutes')::int END,15) AS "reminderMinutes",COALESCE(s.reminder_hour,CASE WHEN e.editable THEN e.reminder_hour ELSE (c.settings->'agenda'->>'reminderHour')::int END,9) AS "reminderHour",
 CASE WHEN e.scheduled_date IS NOT NULL THEN (e.scheduled_date+make_time(COALESCE(s.reminder_hour,CASE WHEN e.editable THEN e.reminder_hour ELSE (c.settings->'agenda'->>'reminderHour')::int END,9),0,0)) AT TIME ZONE COALESCE(c.settings->>'timezone','America/Argentina/Buenos_Aires') ELSE e.scheduled_at-make_interval(mins=>COALESCE(s.reminder_minutes,CASE WHEN e.editable THEN e.reminder_minutes ELSE (c.settings->'agenda'->>'reminderMinutes')::int END,15)) END AS "reminderAt",
 e.status,e.version||':'||COALESCE(s.version::text,'0') AS version,e.editable,e.source_type AS "sourceType",e.source_id AS "sourceId",e.related_entry_id AS "relatedEntryId",e.updated_at AS "updatedAt",COALESCE(c.settings->>'timezone','America/Argentina/Buenos_Aires') AS timezone
 FROM agenda_entries e JOIN companies c ON c.id=e.company_id LEFT JOIN agenda_entry_settings s ON s.company_id=e.company_id AND s.entry_id=e.entry_id
 LEFT JOIN agenda_people p ON p.company_id=e.company_id AND p.person_type=e.person_type AND p.person_id=e.person_id
 LEFT JOIN users u ON u.id=CASE WHEN s.entry_id IS NOT NULL THEN s.responsible_user_id ELSE e.responsible_user_id END AND u.company_id=e.company_id AND u.deleted_at IS NULL`;
  }
  async entry(actor: AgendaActor, id: string, manager?: EntityManager) {
    this.assertInternal(actor);
    this.validateEntryId(id);
    if (id.startsWith('sale:')) {
      const entries = await this.saleEntries(actor, { status: 'all' }, id);
      if (!entries[0]) throw new NotFoundException('Compromiso no encontrado');
      return this.normalize(entries[0]);
    }
    const [entry] = await (manager ?? this.db).query<AgendaEntry[]>(
      this.selectSql() + ' WHERE e.company_id=$1 AND e.entry_id=$2',
      [actor.companyId, id],
    );
    if (!entry) throw new NotFoundException('Compromiso no encontrado');
    return this.normalize({
      ...entry,
      canEdit: this.canEdit(
        actor,
        entry.editable
          ? entry.sourceType
          : ({
              property: 'properties',
              lease: 'leases',
              invoice: 'invoices',
              sale: 'sales',
            }[entry.sourceType ?? ''] ?? entry.sourceType),
      ),
    });
  }
  validateEntryId(id: string) {
    if (
      !/^(?:(task|visit|maintenance|lease|invoice):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|sale:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[1-9]\d*)$/i.test(
        id,
      )
    )
      throw new BadRequestException('Identificador inválido');
  }
  async person(actor: AgendaActor, type: string, id: string) {
    this.assertInternal(actor);
    if (!z.uuid().safeParse(id).success)
      throw new BadRequestException('Persona inválida');
    const [person] = await this.db.query(
      'SELECT name,phone,email FROM agenda_people WHERE company_id=$1 AND person_type=$2 AND person_id=$3::uuid',
      [actor.companyId, type, id],
    );
    return person ?? null;
  }
  async history(actor: AgendaActor, id: string) {
    await this.entry(actor, id);
    if (!id.startsWith('task:'))
      return this.db.query(
        `SELECT 'updated' AS event,version,actor_id AS "actorId",snapshot AS after,created_at AS "createdAt" FROM agenda_entry_settings_history WHERE company_id=$1 AND entry_id=$2 ORDER BY version DESC`,
        [actor.companyId, id],
      );
    return this.db.query(
      'SELECT event,version,actor_id AS "actorId",before_snapshot AS before,after_snapshot AS after,created_at AS "createdAt" FROM agenda_history WHERE company_id=$1 AND task_id=$2::uuid ORDER BY version DESC',
      [actor.companyId, id.slice(5)],
    );
  }
  private async validateTask(
    m: EntityManager,
    actor: AgendaActor,
    data: TaskInput,
  ) {
    if (Boolean(data.personType) !== Boolean(data.personId))
      throw new BadRequestException('Persona incompleta');
    if (data.scheduledDate && data.scheduledAt)
      throw new BadRequestException('Elegir fecha o fecha y hora');
    if (
      data.endsAt &&
      (!data.scheduledAt ||
        Date.parse(data.endsAt) <= Date.parse(data.scheduledAt))
    )
      throw new BadRequestException('Fin inválido');
    if (data.personId) {
      const [p] = await m.query(
        'SELECT person_id FROM agenda_people WHERE company_id=$1 AND person_type=$2 AND person_id=$3::uuid',
        [actor.companyId, data.personType, data.personId],
      );
      if (!p)
        throw new BadRequestException('Persona no disponible en la empresa');
    }
    if (data.responsibleUserId) {
      const [u] = await m.query(
        `SELECT id FROM users WHERE id=$1 AND company_id=$2 AND is_active AND deleted_at IS NULL AND (CASE WHEN cardinality(roles)>0 THEN roles ELSE ARRAY[role] END)::text[] && ARRAY['admin','staff']`,
        [data.responsibleUserId, actor.companyId],
      );
      if (!u) throw new BadRequestException('Responsable no disponible');
    }
    if (data.sourceCommunicationId) {
      const [c] = await m.query(
        'SELECT id FROM person_communications WHERE id=$1 AND company_id=$2',
        [data.sourceCommunicationId, actor.companyId],
      );
      if (!c) throw new BadRequestException('Mensaje no disponible');
    }
    if (data.relatedEntryId) await this.entry(actor, data.relatedEntryId);
  }
  async create(actor: AgendaActor, input: TaskInput, key: string) {
    this.assertInternal(actor);
    if (!key) throw new BadRequestException('Idempotency-Key requerido');
    const parsed = taskSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const defaults = await this.config(actor);
    const data = {
      ...parsed.data,
      reminderMinutes: parsed.data.reminderMinutes ?? defaults.reminderMinutes,
      reminderHour: parsed.data.reminderHour ?? defaults.reminderHour,
    };
    return this.db.transaction((m) =>
      withDomainOperationReceipt(
        m,
        actor.companyId,
        key,
        'agenda.create',
        { ...data, actorId: actor.id },
        async () => {
          await this.validateTask(m, actor, data);
          if (data.personType && !this.canEdit(actor, data.personType))
            throw new ForbiddenException(
              'Sin permiso para registrar seguimiento en el módulo de la persona',
            );
          await m.query(`SELECT set_config('rent.agenda_actor',$1,true)`, [
            actor.id,
          ]);
          const columns = Object.entries(data).filter(([k]) => fieldColumns[k]);
          const id = randomUUID();
          await m.query(
            `INSERT INTO agenda_tasks(id,company_id,created_by,${columns.map(([k]) => fieldColumns[k]).join(',')}) VALUES($1,$2,$3,${columns.map((_, i) => `$${i + 4}`).join(',')})`,
            [
              id,
              actor.companyId,
              actor.id,
              ...columns.map(([, v]) => v ?? null),
            ],
          );
          if (
            data.personType &&
            ['interested', 'tenant', 'owner'].includes(data.personType)
          ) {
            const sourceId = randomUUID(),
              type = data.personType;
            // Existing activities remain the person's history. The trigger links to the same agenda task.
            await m.query(
              `INSERT INTO ${type === 'interested' ? 'interested' : 'tenant' === type ? 'tenant' : 'owner'}_activities(id,${type === 'interested' ? 'interested_profile_id' : type + '_id'},${type === 'interested' ? '' : 'company_id,'}type,status,subject,body,due_at,metadata,created_by_user_id)
 VALUES($1,$2,${type === 'interested' ? '' : '$3,'}$4::${type}_activity_type,$5::${type}_activity_status,$6,$7,$8,$9::jsonb || jsonb_build_object('companyId',$3::uuid),$10)`,
              [
                sourceId,
                data.personId,
                actor.companyId,
                data.kind,
                data.status,
                data.title,
                data.description ?? null,
                data.scheduledAt ??
                  (data.scheduledDate
                    ? `${data.scheduledDate}T00:00:00Z`
                    : null),
                JSON.stringify({
                  agendaTaskId: id,
                  sourceCommunicationId: data.sourceCommunicationId ?? null,
                  agendaScheduleKind: data.scheduledDate ? 'date' : 'time',
                }),
                actor.id,
              ],
            );
          }
          return { id: `task:${id}` };
        },
      ),
    );
  }
  async update(actor: AgendaActor, id: string, input: unknown, key: string) {
    this.assertInternal(actor);
    if (!key) throw new BadRequestException('Idempotency-Key requerido');
    const result = updateTaskSchema.safeParse(input);
    if (!result.success) throw new BadRequestException(result.error.issues);
    const { version, ...parsedPatch } = result.data;
    const patch = Object.fromEntries(
      Object.entries(parsedPatch).filter(([, value]) => value !== undefined),
    ) as typeof parsedPatch;
    if (!id.startsWith('task:'))
      throw new BadRequestException('Modificar el compromiso desde su módulo');
    this.validateEntryId(id);
    return this.db.transaction((m) =>
      withDomainOperationReceipt(
        m,
        actor.companyId,
        key,
        'agenda.update',
        { id, version, ...patch, actorId: actor.id },
        async () => {
          const [current] = await m.query(
            'SELECT * FROM agenda_tasks WHERE id=$1 AND company_id=$2 FOR UPDATE',
            [id.slice(5), actor.companyId],
          );
          if (!current) throw new NotFoundException('Tarea no encontrada');
          if (current.version !== version)
            throw new ConflictException(
              'La tarea cambió; actualizar antes de guardar',
            );
          if (!this.canEdit(actor, current.source_type))
            throw new ForbiddenException(
              'Sin permiso para modificar la actividad de origen',
            );
          if (patch.personId !== undefined || patch.personType !== undefined)
            throw new BadRequestException(
              'La persona vinculada se conserva en el historial',
            );
          const merged = Object.fromEntries(
            Object.entries(fieldColumns).map(([k, c]) => [
              k,
              current[c] instanceof Date
                ? current[c].toISOString()
                : current[c],
            ]),
          );
          await this.validateTask(m, actor, {
            ...merged,
            ...patch,
            personType: null,
            personId: null,
            sourceCommunicationId: undefined,
            ...(patch.responsibleUserId === undefined
              ? { responsibleUserId: null }
              : {}),
          } as TaskInput);
          await m.query(`SELECT set_config('rent.agenda_actor',$1,true)`, [
            actor.id,
          ]);
          const fields = Object.entries(patch).filter(([k]) => fieldColumns[k]);
          if (!fields.length) throw new BadRequestException('Sin cambios');
          await m.query(
            `UPDATE agenda_tasks SET ${fields.map(([k], i) => `${fieldColumns[k]}=$${i + 3}`).join(',')} WHERE id=$1 AND company_id=$2`,
            [id.slice(5), actor.companyId, ...fields.map(([, v]) => v ?? null)],
          );
          return { id };
        },
      ),
    );
  }
  async entrySettings(
    actor: AgendaActor,
    id: string,
    input: unknown,
    key: string,
  ) {
    if (!key) throw new BadRequestException('Idempotency-Key requerido');
    const e = await this.entry(actor, id);
    if (e.editable) throw new BadRequestException('Usar edición de tarea');
    const schema = z
      .object({
        responsibleUserId: z.uuid().nullable(),
        reminderMinutes: z.number().int().min(0).max(10080),
        reminderHour: z.number().int().min(0).max(23),
        version: z.string().min(1).max(200),
      })
      .strict();
    const p = schema.safeParse(input);
    if (!p.success) throw new BadRequestException(p.error.issues);
    if (
      !this.canEdit(
        actor,
        {
          property: 'properties',
          lease: 'leases',
          invoice: 'invoices',
          sale: 'sales',
        }[e.sourceType ?? ''] ?? e.sourceType,
      )
    )
      throw new ForbiddenException('Sin permiso del módulo de origen');
    return this.db.transaction((m) =>
      withDomainOperationReceipt(
        m,
        actor.companyId,
        key,
        'agenda.settings',
        { id, ...p.data, actorId: actor.id },
        async () => {
          await m.query(
            'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
            [actor.companyId + id],
          );
          const tables: Record<string, string> = {
            visit: 'property_visits',
            maintenance: 'maintenance_tickets',
            lease: 'leases',
            invoice: 'invoices',
            sale: 'sale_agreements',
          };
          const table = tables[id.split(':')[0]];
          await m.query(`SELECT id FROM ${table} WHERE id=$1 FOR SHARE`, [
            id.split(':')[1],
          ]);
          const latest = await this.entry(actor, id, m);
          if (latest.version !== p.data.version)
            throw new ConflictException('El compromiso cambió');
          await this.validateTask(m, actor, { title: e.title, ...p.data });
          await m.query(
            `INSERT INTO agenda_entry_settings(company_id,entry_id,responsible_user_id,reminder_minutes,reminder_hour) VALUES($1,$2,$3,$4,$5) ON CONFLICT(company_id,entry_id) DO UPDATE SET responsible_user_id=excluded.responsible_user_id,reminder_minutes=excluded.reminder_minutes,reminder_hour=excluded.reminder_hour,version=agenda_entry_settings.version+1,updated_at=now()`,
            [
              actor.companyId,
              id,
              p.data.responsibleUserId ?? null,
              p.data.reminderMinutes,
              p.data.reminderHour,
            ],
          );
          await m.query(
            `INSERT INTO agenda_entry_settings_history(company_id,entry_id,version,actor_id,snapshot) SELECT company_id,entry_id,version,$3,to_jsonb(s) FROM agenda_entry_settings s WHERE company_id=$1 AND entry_id=$2`,
            [actor.companyId, id, actor.id],
          );
          return { id };
        },
      ),
    );
  }
  private async saleEntries(
    actor: AgendaActor,
    q: AgendaQuery,
    onlyId?: string,
  ): Promise<AgendaEntry[]> {
    const defaults = await this.config(actor);
    const timezone = defaults.timezone;
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
    }).format(new Date());
    const from = q.from ?? '1900-01-01',
      to =
        q.to ??
        new Date(Date.now() + 366 * 86400000).toISOString().slice(0, 10);
    const agreements = await this.db.query(
      'SELECT id,start_date,buyer_id,updated_at FROM sale_agreements WHERE company_id=$1 AND deleted_at IS NULL AND ($2::uuid IS NULL OR id=$2::uuid)',
      [actor.companyId, onlyId?.split(':')[1] ?? null],
    );
    const entries: AgendaEntry[] = [];
    for (const a of agreements) {
      const start = String(a.start_date).slice(0, 10);
      const month = (d: string) =>
        Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7));
      const min = onlyId
        ? Number(onlyId.split(':')[2]) - 1
        : Math.max(0, month(from) - month(start));
      const max = onlyId ? min : Math.max(min, month(to) - month(start));
      for (let idx = min; idx <= max;) {
        const page = Math.floor(idx / 100) + 1;
        const schedule = await this.sales.getSchedule(
          a.id,
          { companyId: actor.companyId, role: UserRole.ADMIN, id: actor.id },
          page,
          100,
          today,
        );
        for (const part of schedule.data) {
          if (
            part.installmentNumber - 1 < min ||
            part.installmentNumber - 1 > max ||
            (!onlyId && (part.dueDate < from || part.dueDate > to))
          )
            continue;
          const id = `sale:${a.id}:${part.installmentNumber}`,
            status = part.status === 'paid' ? 'completed' : 'pending';
          const person = a.buyer_id
            ? await this.person(actor, 'buyer', a.buyer_id)
            : null;
          const [overlay] = await this.db.query(
            "SELECT s.*,concat_ws(' ',u.first_name,u.last_name) AS name FROM agenda_entry_settings s LEFT JOIN users u ON u.id=s.responsible_user_id AND u.company_id=s.company_id AND u.deleted_at IS NULL WHERE s.company_id=$1 AND s.entry_id=$2",
            [actor.companyId, id],
          );
          const [clock] = await this.db.query(
            'SELECT ($1::date+make_time($2,0,0)) AT TIME ZONE $3 AS at',
            [
              part.dueDate,
              overlay?.reminder_hour ?? defaults.reminderHour,
              timezone,
            ],
          );
          const entry: AgendaEntry = {
            id,
            title: `Cuota ${part.installmentNumber} de venta`,
            description: null,
            kind: 'sale',
            personType: a.buyer_id ? 'buyer' : null,
            personId: a.buyer_id,
            personName: person?.name ?? null,
            responsibleUserId: overlay?.responsible_user_id ?? null,
            responsibleName: overlay?.name ?? null,
            scheduledDate: part.dueDate,
            scheduledAt: null,
            endsAt: null,
            reminderMinutes:
              overlay?.reminder_minutes ?? defaults.reminderMinutes,
            reminderHour: overlay?.reminder_hour ?? defaults.reminderHour,
            reminderAt: clock.at,
            status,
            version: `${a.updated_at.toISOString()}:${schedule.paidAmount}:${overlay?.version ?? 0}`,
            editable: false,
            sourceType: 'sale',
            sourceId: a.id,
            relatedEntryId: null,
            timezone,
            updatedAt: a.updated_at.toISOString(),
            canEdit: this.canEdit(actor, 'sales'),
          };
          if (
            (q.status && q.status !== 'all' && q.status !== status) ||
            (q.personType && q.personType !== 'buyer') ||
            (q.personId && q.personId !== a.buyer_id) ||
            (q.search &&
              !entry.title.toLowerCase().includes(q.search.toLowerCase())) ||
            (q.responsibleUserId === 'unassigned' && entry.responsibleUserId) ||
            (q.responsibleUserId &&
              q.responsibleUserId !== 'unassigned' &&
              q.responsibleUserId !== entry.responsibleUserId)
          )
            continue;
          entries.push(entry);
        }
        idx = page * 100;
        if (idx >= schedule.total) break;
      }
    }
    return entries;
  }
}
import { z } from 'zod';
