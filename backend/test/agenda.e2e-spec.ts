import * as webpush from 'web-push';
jest.mock('web-push', () => ({ sendNotification: jest.fn() }));
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { User, UserRole } from '../src/users/entities/user.entity';
import { Company } from '../src/companies/entities/company.entity';
import { UsersService } from '../src/users/users.service';
import { AgendaService } from '../src/agenda/agenda.service';
import { WebNotificationsService } from '../src/notifications/web-notifications.service';
import { AiToolExecutorService } from '../src/ai/ai-tool-executor.service';
import {
  configureE2eApp,
  createActiveTestUser,
  createTestCompany,
  loginTestUser,
} from './e2e-helpers';
describe('Company agenda and web notifications (PostgreSQL)', () => {
  let app: INestApplication,
    db: DataSource,
    company: Company,
    other: Company,
    admin: User,
    staff: User,
    reviewer: User,
    foreign: User,
    external: User;
  let token: string,
    staffToken: string,
    foreignToken: string,
    externalToken: string,
    reviewerToken: string;
  const password = 'AgendaFixturePassword123!',
    suffix = randomUUID();
  let taskId: string, personId: string;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureE2eApp(app);
    await app.init();
    db = app.get(DataSource);
    await db.query(
      readFileSync(
        resolve(__dirname, '../../migrations/143_company_agenda.sql'),
        'utf8',
      ),
    );
    company = await createTestCompany(db.getRepository(Company), {
      name: 'Agenda test',
      taxId: `agenda-${suffix}`,
      settings: { timezone: 'America/Argentina/Buenos_Aires' },
    });
    other = await createTestCompany(db.getRepository(Company), {
      name: 'Foreign agenda',
      taxId: `agenda-other-${suffix}`,
    });
    const users = app.get(UsersService);
    const create = (name: string, role: UserRole, companyId = company.id) =>
      createActiveTestUser(users, {
        email: `${name}-${suffix}@agenda.test`,
        password,
        firstName: name,
        lastName: 'Fixture',
        role,
        companyId,
      });
    admin = await create('admin', UserRole.ADMIN);
    staff = await create('staff', UserRole.STAFF);
    reviewer = await create('reviewer', UserRole.ADMIN);
    foreign = await create('foreign', UserRole.ADMIN, other.id);
    external = await create('external', UserRole.OWNER);
    [token, staffToken, reviewerToken, foreignToken, externalToken] =
      await Promise.all(
        [admin, staff, reviewer, foreign, external].map((u) =>
          loginTestUser(app, u.email!, password),
        ),
      );
    const [p] = await db.query(
      `INSERT INTO interested_profiles(company_id,first_name,last_name,phone) VALUES($1,'Juan','Agenda','+5491100000000') RETURNING id`,
      [company.id],
    );
    personId = p.id;
  }, 60000);
  afterAll(async () => {
    if (db && company) {
      for (const c of [company.id, other.id]) {
        await db.query(
          'DELETE FROM web_push_deliveries WHERE notification_id IN(SELECT id FROM web_notifications WHERE company_id=$1)',
          [c],
        );
        for (const table of [
          'web_notifications',
          'web_push_subscriptions',
          'agenda_notification_state',
          'agenda_entry_settings_history',
          'agenda_entry_settings',
          'agenda_history',
          'pending_actions',
          'ai_tool_mutation_confirmations',
          'domain_operation_receipts',
          'notification_preferences',
        ])
          await db.query(`DELETE FROM ${table} WHERE company_id=$1`, [c]);
        await db.query('DELETE FROM agenda_tasks WHERE company_id=$1', [c]);
        await db.query(
          'DELETE FROM interested_activities WHERE interested_profile_id IN(SELECT id FROM interested_profiles WHERE company_id=$1)',
          [c],
        );
        for (const table of [
          'maintenance_ticket_audit',
          'maintenance_tickets',
          'invoices',
          'leases',
          'property_visits',
          'properties',
        ])
          await db.query(
            `DELETE FROM ${table} WHERE ${table === 'property_visits' ? 'property_id IN(SELECT id FROM properties WHERE company_id=$1)' : 'company_id=$1'}`,
            [c],
          );
        await db.query('DELETE FROM interested_profiles WHERE company_id=$1', [
          c,
        ]);
        await db.query(
          'DELETE FROM person_communications WHERE company_id=$1',
          [c],
        );
        await db.query('DELETE FROM ai_conversations WHERE company_id=$1', [c]);
        for (const table of ['tenants', 'owners', 'staff', 'admins', 'users'])
          await db.query(`DELETE FROM ${table} WHERE company_id=$1`, [c]);
        await db.query('DELETE FROM companies WHERE id=$1', [c]);
      }
    }
    await app?.close();
  });
  const auth = (t = token) => ({ Authorization: `Bearer ${t}` });
  it('creates an optional-person, optional-responsible task once and rejects key reuse', async () => {
    const key = randomUUID(),
      body = {
        title: 'Llamar a Juan',
        kind: 'call',
        personType: 'interested',
        personId,
        scheduledDate: '2026-10-04',
      };
    const responses = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post('/agenda/tasks')
          .set({ ...auth(), 'Idempotency-Key': key })
          .send(body)
          .expect(201),
      ),
    );
    taskId = responses[0].body.id;
    expect(responses[1].body.id).toBe(taskId);
    const [count] = await db.query(
      'SELECT count(*)::int AS n FROM interested_activities WHERE interested_profile_id=$1',
      [personId],
    );
    expect(count.n).toBe(1);
    await request(app.getHttpServer())
      .post('/agenda/tasks')
      .set({ ...auth(), 'Idempotency-Key': key })
      .send({ ...body, title: 'Changed' })
      .expect(409);
    const free = await request(app.getHttpServer())
      .post('/agenda/tasks')
      .set({ ...auth(), 'Idempotency-Key': randomUUID() })
      .send({ title: 'Tarea general' })
      .expect(201);
    const record = await app
      .get(AgendaService)
      .entry(
        { id: admin.id, role: 'admin', companyId: company.id },
        free.body.id,
      );
    expect(record.personId).toBeNull();
    expect(record.scheduledDate).toBeNull();
  });
  it('shares with staff without financial permission, isolates companies and rejects external users', async () => {
    const result = await request(app.getHttpServer())
      .get('/agenda')
      .set(auth(staffToken))
      .expect(200);
    expect(result.body.data.some((e: { id: string }) => e.id === taskId)).toBe(
      true,
    );
    await request(app.getHttpServer())
      .get(`/agenda/entries/${taskId}`)
      .set(auth(foreignToken))
      .expect(404);
    await request(app.getHttpServer())
      .get('/agenda')
      .set(auth(externalToken))
      .expect(403);
    await request(app.getHttpServer())
      .post('/agenda/tasks')
      .set({ ...auth(), 'Idempotency-Key': randomUUID() })
      .send({ title: 'Bad assignee', responsibleUserId: foreign.id })
      .expect(400);
  });
  it('keeps CRM and agenda scheduling/status together, preserving civil dates and optimistic concurrency', async () => {
    let e = await app
      .get(AgendaService)
      .entry({ id: admin.id, role: 'admin', companyId: company.id }, taskId);
    expect(e.scheduledDate).toBe('2026-10-04');
    expect(new Date(e.reminderAt!).toISOString()).toBe(
      '2026-10-04T12:00:00.000Z',
    );
    const body = {
      version: Number(e.version.split(':')[0]),
      scheduledDate: null,
      scheduledAt: '2026-10-05T10:00:00-03:00',
      responsibleUserId: staff.id,
    };
    const responses = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .patch(`/agenda/entries/${taskId}`)
          .set({ ...auth(), 'Idempotency-Key': randomUUID() })
          .send(body),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const [activity] = await db.query(
      'SELECT id,due_at FROM interested_activities WHERE interested_profile_id=$1',
      [personId],
    );
    expect(activity.due_at.toISOString()).toBe('2026-10-05T13:00:00.000Z');
    await db.query(
      `UPDATE interested_activities SET status='completed' WHERE id=$1`,
      [activity.id],
    );
    e = await app
      .get(AgendaService)
      .entry({ id: admin.id, role: 'admin', companyId: company.id }, taskId);
    expect(e.status).toBe('completed');
    await request(app.getHttpServer())
      .patch(`/agenda/entries/${taskId}`)
      .set({ ...auth(staffToken), 'Idempotency-Key': randomUUID() })
      .send({ version: Number(e.version.split(':')[0]), status: 'pending' })
      .expect(403);
  });
  it('notifies all when unassigned, only the responsible when assigned, and cancels stale reminders', async () => {
    const agenda = app.get(AgendaService),
      notices = app.get(WebNotificationsService),
      actor = { id: admin.id, role: 'admin', companyId: company.id };
    let e = await agenda.entry(actor, taskId);
    await agenda.update(
      actor,
      taskId,
      {
        version: Number(e.version.split(':')[0]),
        status: 'pending',
        responsibleUserId: null,
      },
      randomUUID(),
    );
    await notices.process();
    let rows = await db.query(
      `SELECT user_id FROM web_notifications WHERE company_id=$1 AND entry_id=$2 AND event='assigned' AND cancelled_at IS NULL`,
      [company.id, taskId],
    );
    expect(rows.map((r: { user_id: string }) => r.user_id).sort()).toEqual(
      [admin.id, staff.id, reviewer.id].sort(),
    );
    e = await agenda.entry(actor, taskId);
    await agenda.update(
      actor,
      taskId,
      { version: Number(e.version.split(':')[0]), responsibleUserId: staff.id },
      randomUUID(),
    );
    await notices.process();
    await notices.process();
    rows = await db.query(
      `SELECT user_id FROM web_notifications WHERE company_id=$1 AND entry_id=$2 AND event='assigned' AND cancelled_at IS NULL`,
      [company.id, taskId],
    );
    expect(rows.map((r: { user_id: string }) => r.user_id)).toEqual([staff.id]);
    const [notice] = await db.query(
      'SELECT id FROM web_notifications WHERE user_id=$1 AND entry_id=$2 AND cancelled_at IS NULL',
      [staff.id, taskId],
    );
    const destination = await request(app.getHttpServer())
      .get(`/notifications/web/${notice.id}/destination`)
      .set(auth(staffToken))
      .expect(200);
    expect(destination.body.path).toContain(
      `/agenda/people/interested/${personId}`,
    );
    await request(app.getHttpServer())
      .post(`/notifications/web/${notice.id}/read`)
      .set(auth(staffToken))
      .expect(201);
    expect((await agenda.entry(actor, taskId)).status).toBe('pending');
    await request(app.getHttpServer())
      .post(`/notifications/web/${notice.id}/read`)
      .set(auth(foreignToken))
      .expect(404);
  });
  it('requires another reauthenticated approver, and preserves the originating WhatsApp message', async () => {
    const [conversation] = await db.query(
      'INSERT INTO ai_conversations(user_id,company_id) VALUES($1,$2) RETURNING id',
      [admin.id, company.id],
    );
    const [message] = await db.query(
      `INSERT INTO person_communications(company_id,user_id,person_type,person_id,channel,direction,message_type,body,status) VALUES($1,$2,'admin',$2,'whatsapp','inbound','text','Llamar a Juan','read') RETURNING id`,
      [company.id, admin.id],
    );
    const preview = (await app.get(AiToolExecutorService).execute(
      'post_agenda_tasks',
      {
        title: 'Llamar por WhatsApp',
        kind: 'call',
        personType: 'interested',
        personId,
      },
      {
        userId: admin.id,
        companyId: company.id,
        role: UserRole.ADMIN,
        conversationId: conversation.id,
        channel: 'whatsapp',
        mutationApprovalMode: 'staff_queue',
        sourceCommunicationId: message.id,
      },
    )) as { status: string };
    expect(preview.status).toBe('pending_confirmation');
    const [proposal] = await db.query(
      'SELECT id,source_communication_id FROM pending_actions WHERE company_id=$1',
      [company.id],
    );
    const [originalStaff] = await db.query(
      'SELECT permissions FROM users WHERE id=$1',
      [staff.id],
    );
    await db.query(
      'UPDATE users SET permissions=permissions||\'{"approvals":true}\'::jsonb WHERE id=$1',
      [staff.id],
    );
    await app.get(WebNotificationsService).process();
    const [reviewNotice] = await db.query(
      'SELECT id FROM web_notifications WHERE company_id=$1 AND user_id=$2 AND entry_id=$3',
      [company.id, staff.id, `proposal:${proposal.id}`],
    );
    expect(reviewNotice).toBeDefined();
    const reviewDestination = await request(app.getHttpServer())
      .get(`/notifications/web/${reviewNotice.id}/destination`)
      .set(auth(staffToken))
      .expect(200);
    expect(reviewDestination.body.path).toBe(
      `/agenda/proposals/${proposal.id}`,
    );
    await db.query('UPDATE users SET permissions=$2::jsonb WHERE id=$1', [
      staff.id,
      JSON.stringify(originalStaff.permissions),
    ]);
    expect(proposal.source_communication_id).toBe(message.id);
    const reauth = await request(app.getHttpServer())
      .post('/auth/reauthenticate')
      .set(auth())
      .send({ password })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/pending-actions/${proposal.id}/approve`)
      .set(auth())
      .send({ reauthToken: reauth.body.reauthToken })
      .expect(400);
    const otherAuth = await request(app.getHttpServer())
      .post('/auth/reauthenticate')
      .set(auth(reviewerToken))
      .send({ password })
      .expect(200);
    const approved = await request(app.getHttpServer())
      .post(`/pending-actions/${proposal.id}/approve`)
      .set(auth(reviewerToken))
      .send({ reauthToken: otherAuth.body.reauthToken })
      .expect(201);
    expect(approved.body.status).toBe('executed');
    const [task] = await db.query(
      'SELECT * FROM agenda_tasks WHERE source_communication_id=$1',
      [message.id],
    );
    expect(task.kind).toBe('call');
    expect(task.scheduled_at).toBeNull();
    expect(task.responsible_user_id).toBeNull();
  });
  it('executes concurrent proposal approvals once and creates nothing for rejection or expiry', async () => {
    const makeProposal = async (title: string) => {
      const [conversation] = await db.query(
        'INSERT INTO ai_conversations(user_id,company_id) VALUES($1,$2) RETURNING id',
        [admin.id, company.id],
      );
      await app.get(AiToolExecutorService).execute(
        'post_agenda_tasks',
        { title, kind: 'call' },
        {
          userId: admin.id,
          companyId: company.id,
          role: UserRole.ADMIN,
          conversationId: conversation.id,
          channel: 'whatsapp',
          mutationApprovalMode: 'staff_queue',
        },
      );
      const [proposal] = await db.query(
        "SELECT id FROM pending_actions WHERE company_id=$1 AND payload->>'title'=$2",
        [company.id, title],
      );
      expect(proposal).toBeDefined();
      return proposal.id as string;
    };
    const reauth = await request(app.getHttpServer())
      .post('/auth/reauthenticate')
      .set(auth(reviewerToken))
      .send({ password })
      .expect(200);
    const title = `Concurrent call ${suffix}`,
      proposal = await makeProposal(title);
    const responses = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post(`/pending-actions/${proposal}/approve`)
          .set(auth(reviewerToken))
          .send({ reauthToken: reauth.body.reauthToken }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([201, 400]);
    const [count] = await db.query(
      'SELECT count(*)::int AS n FROM agenda_tasks WHERE company_id=$1 AND title=$2',
      [company.id, title],
    );
    expect(count.n).toBe(1);
    const rejectedTitle = `Rejected call ${suffix}`,
      rejected = await makeProposal(rejectedTitle);
    await request(app.getHttpServer())
      .post(`/pending-actions/${rejected}/reject`)
      .set(auth(reviewerToken))
      .send({ reason: 'Not needed' })
      .expect(201);
    const [expiredFixture] = await db.query(
      `INSERT INTO pending_actions(company_id,requested_by,tool_name,action_type,entity_type,summary,payload,payload_hash,expires_at,review) SELECT company_id,requested_by,tool_name,action_type,entity_type,summary,payload,payload_hash,NOW()-INTERVAL '1 minute',review FROM pending_actions WHERE id=$1 RETURNING id`,
      [rejected],
    );
    const expired = expiredFixture.id;
    await request(app.getHttpServer())
      .post(`/pending-actions/${expired}/approve`)
      .set(auth(reviewerToken))
      .send({ reauthToken: reauth.body.reauthToken })
      .expect(400);
    const [none] = await db.query(
      'SELECT count(*)::int AS n FROM agenda_tasks WHERE company_id=$1 AND title=ANY($2::text[])',
      [company.id, [rejectedTitle]],
    );
    expect(none.n).toBe(0);
  });
  it('replays the migration without changing existing versions, and prevents foreign metadata relinking', async () => {
    const [before] = await db.query(
      'SELECT version FROM agenda_tasks WHERE id=$1',
      [taskId.slice(5)],
    );
    await db.query(
      readFileSync(
        resolve(__dirname, '../../migrations/143_company_agenda.sql'),
        'utf8',
      ),
    );
    const [after] = await db.query(
      'SELECT version FROM agenda_tasks WHERE id=$1',
      [taskId.slice(5)],
    );
    expect(after.version).toBe(before.version);
    const otherTask = await app
      .get(AgendaService)
      .create(
        { id: foreign.id, role: 'admin', companyId: other.id },
        { title: 'Foreign' },
        randomUUID(),
      );
    await expect(
      db.query(
        `INSERT INTO interested_activities(interested_profile_id,type,status,subject,metadata) VALUES($1,'call','pending','Tamper',$2::jsonb)`,
        [personId, JSON.stringify({ agendaTaskId: otherTask.id.slice(5) })],
      ),
    ).rejects.toThrow('scope mismatch');
  });
  it('reflects sources once, preserves schedule precision and requires source permissions for settings', async () => {
    const [owner] = await db.query(
      'INSERT INTO owners(company_id,user_id) VALUES($1,$2) RETURNING id',
      [company.id, external.id],
    );
    const [property] = await db.query(
      `INSERT INTO properties(company_id,owner_id,name,property_type,address_street,address_city,address_state) VALUES($1,$2,'Agenda building','apartment','Test','Test','Test') RETURNING id`,
      [company.id, owner.id],
    );
    const [visit] = await db.query(
      `INSERT INTO property_visits(property_id,visited_at,agenda_schedule_kind,interested_profile_id) VALUES($1,'2026-10-06T00:00:00Z','date',$2) RETURNING id`,
      [property.id, personId],
    );
    await db.query(
      `INSERT INTO interested_activities(interested_profile_id,type,status,subject,metadata) VALUES($1,'visit','pending','Visit communication',$2::jsonb)`,
      [personId, JSON.stringify({ visitId: visit.id })],
    );
    await db.query(
      `UPDATE users SET roles=ARRAY['owner','tenant']::user_role[] WHERE id=$1`,
      [external.id],
    );
    const [tenant] = await db.query(
      'INSERT INTO tenants(company_id,user_id) VALUES($1,$2) RETURNING id',
      [company.id, external.id],
    );
    const [lease] = await db.query(
      `INSERT INTO leases(company_id,property_id,owner_id,tenant_id,status,start_date,end_date,monthly_rent) VALUES($1,$2,$3,$4,'active','2026-10-01','2026-10-10',100) RETURNING id`,
      [company.id, property.id, owner.id, tenant.id],
    );
    const [invoice] = await db.query(
      `INSERT INTO invoices(company_id,lease_id,owner_id,invoice_number,status,period_start,period_end,due_date,subtotal,total_amount) VALUES($1,$2,$3,'AGENDA-TEST','pending','2026-10-01','2026-10-31','2026-10-10',100,100) RETURNING id`,
      [company.id, lease.id, owner.id],
    );
    const visitEntry = await app
      .get(AgendaService)
      .entry(
        { id: admin.id, role: 'admin', companyId: company.id },
        `visit:${visit.id}`,
      );
    expect(visitEntry.scheduledDate).toBe('2026-10-06');
    expect(visitEntry.scheduledAt).toBeNull();
    const [duplicate] = await db.query(
      `SELECT count(*)::int AS n FROM agenda_tasks WHERE person_id=$1 AND title='Visit communication'`,
      [personId],
    );
    expect(duplicate.n).toBe(0);
    const read = await request(app.getHttpServer())
      .get(`/agenda/entries/invoice:${invoice.id}`)
      .set(auth(staffToken))
      .expect(200);
    expect(read.body.canEdit).toBe(false);
    expect(read.body.status).toBe('pending');
    const body = {
      version: read.body.version,
      responsibleUserId: staff.id,
      reminderMinutes: 20,
      reminderHour: 10,
    };
    await request(app.getHttpServer())
      .patch(`/agenda/entries/invoice:${invoice.id}/settings`)
      .set({ ...auth(staffToken), 'Idempotency-Key': randomUUID() })
      .send(body)
      .expect(403);
    const key = randomUUID();
    for (let n = 0; n < 2; n++)
      await request(app.getHttpServer())
        .patch(`/agenda/entries/invoice:${invoice.id}/settings`)
        .set({ ...auth(), 'Idempotency-Key': key })
        .send(body)
        .expect(200);
    const [setting] = await db.query(
      'SELECT version FROM agenda_entry_settings WHERE company_id=$1 AND entry_id=$2',
      [company.id, `invoice:${invoice.id}`],
    );
    expect(setting.version).toBe(1);
    await db.query(
      `UPDATE invoices SET paid_amount=100,balance_due=0,status='paid' WHERE id=$1`,
      [invoice.id],
    );
    expect(
      (
        await app
          .get(AgendaService)
          .entry(
            { id: admin.id, role: 'admin', companyId: company.id },
            `invoice:${invoice.id}`,
          )
      ).status,
    ).toBe('completed');
    const maintenance = await request(app.getHttpServer())
      .post('/maintenance/tickets')
      .set({ ...auth(), 'Idempotency-Key': randomUUID() })
      .send({
        propertyId: property.id,
        title: 'Civil maintenance',
        scheduledAt: '2026-10-07',
      })
      .expect(201);
    const maintenanceEntry = await app
      .get(AgendaService)
      .entry(
        { id: admin.id, role: 'admin', companyId: company.id },
        `maintenance:${maintenance.body.id}`,
      );
    expect(maintenanceEntry.scheduledDate).toBe('2026-10-07');
  });
  it('keeps web preferences independent and removes expired Push subscriptions', async () => {
    await request(app.getHttpServer())
      .patch('/notifications/web/preferences')
      .set(auth())
      .send({ preferences: [{ event: 'reminder', enabled: false }] })
      .expect(200);
    const [whatsapp] = await db.query(
      `SELECT count(*)::int AS n FROM notification_preferences WHERE company_id=$1 AND user_id=$2 AND channel='whatsapp'`,
      [company.id, admin.id],
    );
    expect(whatsapp.n).toBe(0);
    const previous = {
      public: process.env.WEB_PUSH_VAPID_PUBLIC_KEY,
      private: process.env.WEB_PUSH_VAPID_PRIVATE_KEY,
    };
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY = 'fixture';
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY = 'fixture';
    const send = jest
      .mocked(webpush.sendNotification)
      .mockRejectedValue({ statusCode: 410 });
    try {
      const endpoint = 'https://fcm.googleapis.com/fcm/send/agenda-fixture';
      await request(app.getHttpServer())
        .post('/notifications/web/subscriptions')
        .set(auth())
        .send({
          endpoint,
          keys: { p256dh: 'a'.repeat(80), auth: 'b'.repeat(24) },
        })
        .expect(201);
      await request(app.getHttpServer())
        .post('/notifications/web/subscriptions')
        .set(auth())
        .send({
          endpoint: 'https://localhost/private',
          keys: { p256dh: 'a'.repeat(80), auth: 'b'.repeat(24) },
        })
        .expect(400);
      await app
        .get(AgendaService)
        .create(
          { id: admin.id, companyId: company.id, role: 'admin' },
          { title: 'Push fixture' },
          randomUUID(),
        );
      await app.get(WebNotificationsService).process();
      expect(send).toHaveBeenCalled();
      const [remaining] = await db.query(
        'SELECT count(*)::int AS n FROM web_push_subscriptions WHERE endpoint=$1',
        [endpoint],
      );
      expect(remaining.n).toBe(0);
    } finally {
      send.mockReset();
      if (previous.public === undefined)
        delete process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
      else process.env.WEB_PUSH_VAPID_PUBLIC_KEY = previous.public;
      if (previous.private === undefined)
        delete process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
      else process.env.WEB_PUSH_VAPID_PRIVATE_KEY = previous.private;
    }
  });
  it('keeps a task accessible and actionable after its person is removed', async () => {
    const [person] = await db.query(
      `INSERT INTO interested_profiles(company_id,first_name,last_name,phone) VALUES($1,'Removed','Person','+5491100000001') RETURNING id`,
      [company.id],
    );
    const actor = { id: admin.id, companyId: company.id, role: 'admin' };
    const task = await app.get(AgendaService).create(
      actor,
      {
        title: 'Retained followup',
        personType: 'interested',
        personId: person.id,
      },
      randomUUID(),
    );
    await app.get(WebNotificationsService).process();
    const [notice] = await db.query(
      'SELECT id FROM web_notifications WHERE company_id=$1 AND entry_id=$2 AND user_id=$3 AND due_at<=now()',
      [company.id, task.id, admin.id],
    );
    await db.query(
      'UPDATE interested_profiles SET deleted_at=now() WHERE id=$1',
      [person.id],
    );
    const destination = await app
      .get(WebNotificationsService)
      .destination(actor, notice.id);
    expect(destination.path).toBe(
      `/agenda/entries/${encodeURIComponent(task.id)}`,
    );
    const e = await app.get(AgendaService).entry(actor, task.id);
    await app
      .get(AgendaService)
      .update(
        actor,
        task.id,
        { version: Number(e.version.split(':')[0]), status: 'completed' },
        randomUUID(),
      );
    expect((await app.get(AgendaService).entry(actor, task.id)).status).toBe(
      'completed',
    );
  });
});
