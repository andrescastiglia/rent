import { buildMutationReview } from '../src/common/helpers/mutation-review';
import { WhatsappService } from '../src/whatsapp/whatsapp.service';
import { createHash, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Company } from '../src/companies/entities/company.entity';
import { UsersService } from '../src/users/users.service';
import { User, UserRole } from '../src/users/entities/user.entity';
import {
  Property,
  PropertyType,
} from '../src/properties/entities/property.entity';
import { PropertyVisit } from '../src/properties/entities/property-visit.entity';
import { PropertyVisitsService } from '../src/properties/property-visits.service';
import { MaintenanceService } from '../src/maintenance/maintenance.service';
import { MaintenanceTicket } from '../src/maintenance/entities/maintenance-ticket.entity';
import { CommunicationsService } from '../src/communications/communications.service';
import { CommunicationDelivery } from '../src/communications/entities/communication-delivery.entity';
import { AiToolExecutorService } from '../src/ai/ai-tool-executor.service';
import {
  configureE2eApp,
  createActiveTestUser,
  createTestCompany,
  loginTestUser,
} from './e2e-helpers';

describe('Maintenance and visits: company isolation and recoverable operations (PostgreSQL)', () => {
  let app: INestApplication,
    db: DataSource,
    maintenance: MaintenanceService,
    visits: PropertyVisitsService;
  let companyId: string,
    foreignId: string,
    propertyId: string,
    foreignPropertyId: string;
  let admin: User, requester: User, owner: User, tenant: User, otherOwner: User;
  let adminToken: string,
    foreignToken: string,
    ownerToken: string,
    tenantToken: string,
    otherOwnerToken: string;
  let ownStaffId: string, foreignStaffId: string;
  const suffix = randomUUID(),
    password = 'MaintenanceTest123!';
  const oldMode = process.env.AI_TOOLS_MODE;
  beforeAll(async () => {
    process.env.AI_TOOLS_MODE = 'FULL';
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureE2eApp(app);
    await app.init();
    db = app.get(DataSource);
    maintenance = app.get(MaintenanceService);
    visits = app.get(PropertyVisitsService);
    companyId = (
      await createTestCompany(db.getRepository(Company), {
        name: 'Operations A',
        taxId: `ops-a-${suffix}`,
      })
    ).id;
    foreignId = (
      await createTestCompany(db.getRepository(Company), {
        name: 'Operations B',
        taxId: `ops-b-${suffix}`,
      })
    ).id;
    const user = (name: string, role: UserRole, scope = companyId) =>
      createActiveTestUser(app.get(UsersService), {
        companyId: scope,
        role,
        email: `${name}-${suffix}@ops.test`,
        password,
        firstName: name,
        lastName: 'Fixture',
      });
    admin = await user('admin', UserRole.ADMIN);
    requester = await user('requester', UserRole.ADMIN);
    owner = await user('owner', UserRole.OWNER);
    otherOwner = await user('other-owner', UserRole.OWNER);
    tenant = await user('tenant', UserRole.TENANT);
    const foreign = await user('foreign', UserRole.ADMIN, foreignId);
    const ownStaff = await user('own-staff', UserRole.STAFF),
      foreignStaff = await user('foreign-staff', UserRole.STAFF, foreignId);
    adminToken = await loginTestUser(app, admin.email!, password);
    foreignToken = await loginTestUser(app, foreign.email!, password);
    ownerToken = await loginTestUser(app, owner.email!, password);
    tenantToken = await loginTestUser(app, tenant.email!, password);
    otherOwnerToken = await loginTestUser(app, otherOwner.email!, password);
    const ownOwnerId = (
      await db.query(
        'INSERT INTO owners(company_id,user_id,contact_consent) VALUES($1,$2,true) RETURNING id',
        [companyId, owner.id],
      )
    )[0].id;
    const foreignOwnerId = (
      await db.query(
        'INSERT INTO owners(company_id,user_id) VALUES($1,$2) RETURNING id',
        [foreignId, foreign.id],
      )
    )[0].id;
    const tenantId = (
      await db.query(
        'INSERT INTO tenants(company_id,user_id) VALUES($1,$2) RETURNING id',
        [companyId, tenant.id],
      )
    )[0].id;
    ownStaffId = (
      await db.query(
        "INSERT INTO staff(company_id,user_id,specialization) VALUES($1,$2,'maintenance') RETURNING id",
        [companyId, ownStaff.id],
      )
    )[0].id;
    foreignStaffId = (
      await db.query(
        "INSERT INTO staff(company_id,user_id,specialization) VALUES($1,$2,'maintenance') RETURNING id",
        [foreignId, foreignStaff.id],
      )
    )[0].id;
    const property = (scope: string, ownerId: string) =>
      db.getRepository(Property).save({
        companyId: scope,
        ownerId,
        name: 'Operations property',
        propertyType: PropertyType.APARTMENT,
        addressStreet: 'Test 100',
        addressCity: 'Buenos Aires',
        addressState: 'Buenos Aires',
      });
    propertyId = (await property(companyId, ownOwnerId)).id;
    foreignPropertyId = (await property(foreignId, foreignOwnerId)).id;
    await db.query(
      "UPDATE properties SET owner_whatsapp='+5491112345678' WHERE id=$1",
      [propertyId],
    );
    await db.query(
      "UPDATE users SET whatsapp_enabled=true,phone='+5491112345678' WHERE id=$1",
      [owner.id],
    );
    await db.query(
      "INSERT INTO leases(company_id,property_id,owner_id,tenant_id,contract_type,status,start_date,end_date,monthly_rent,currency) VALUES($1,$2,$3,$4,'rental','active','2020-01-01','2099-01-01',1000,'ARS')",
      [companyId, propertyId, ownOwnerId, tenantId],
    );
  });
  const actor = () => ({ id: admin.id, companyId, role: UserRole.ADMIN });
  const createTicket = () =>
    maintenance.create(actor(), { propertyId, title: 'Leaking pipe' });
  const visitRequest = () => ({
    visitedAt: '2026-10-01',
    interestedName: 'Visitor',
    hasOffer: true,
    offerAmount: 1200,
    offerCurrency: 'ARS',
  });
  afterAll(async () => {
    if (db && companyId) {
      for (const id of [companyId, foreignId]) {
        for (const table of [
          'pending_actions',
          'domain_operation_receipts',
          'communication_deliveries',
          'documents',
          'maintenance_tickets',
          'owner_activities',
          'leases',
          'properties',
          'staff',
          'owners',
          'tenants',
          'admins',
          'users',
        ])
          await db.query(`DELETE FROM ${table} WHERE company_id=$1`, [id]);
        await db.query('DELETE FROM companies WHERE id=$1', [id]);
      }
    }
    await app?.close();
    if (oldMode === undefined) delete process.env.AI_TOOLS_MODE;
    else process.env.AI_TOOLS_MODE = oldMode;
  });

  it('hides internal comments in detail, comment listings and direct service reads', async () => {
    const ticket = await createTicket();
    await maintenance.addComment(ticket.id, actor(), {
      body: 'Internal cost negotiation',
      isInternal: true,
    });
    await maintenance.addComment(ticket.id, actor(), {
      body: 'Public progress',
    });
    for (const token of [ownerToken, tenantToken]) {
      const detail = await request(app.getHttpServer())
        .get(`/maintenance/tickets/${ticket.id}`)
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(detail.body.comments.map((c: { body: string }) => c.body)).toEqual(
        ['Public progress'],
      );
      const comments = await request(app.getHttpServer())
        .get(`/maintenance/tickets/${ticket.id}/comments`)
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(comments.body).toHaveLength(1);
    }
    const tenantActor = { id: tenant.id, companyId, role: UserRole.TENANT };
    expect(
      await maintenance.getComments(ticket.id, tenantActor, true),
    ).toHaveLength(1);
    expect(
      (
        await maintenance.addComment(ticket.id, tenantActor, {
          body: 'Spoofed internal',
          isInternal: true,
        })
      ).isInternal,
    ).toBe(false);
    expect(
      (await maintenance.findOne(ticket.id, actor())).comments,
    ).toHaveLength(3);
  });

  it('rejects foreign and unrelated ticket IDs for reads, comments, updates and deletion', async () => {
    const ticket = await createTicket();
    for (const token of [foreignToken, otherOwnerToken]) {
      for (const path of [
        `/maintenance/tickets/${ticket.id}`,
        `/maintenance/tickets/${ticket.id}/comments`,
      ])
        await request(app.getHttpServer())
          .get(path)
          .auth(token, { type: 'bearer' })
          .expect(404);
      await request(app.getHttpServer())
        .post(`/maintenance/tickets/${ticket.id}/comments`)
        .auth(token, { type: 'bearer' })
        .send({ body: 'Unrelated' })
        .expect(404);
    }
    await request(app.getHttpServer())
      .patch(`/maintenance/tickets/${ticket.id}`)
      .auth(foreignToken, { type: 'bearer' })
      .send({ title: 'Foreign edit' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/maintenance/tickets/${ticket.id}`)
      .auth(foreignToken, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .post('/maintenance/tickets')
      .auth(adminToken, { type: 'bearer' })
      .send({ title: 'Foreign property', propertyId: foreignPropertyId })
      .expect(404);
    const executor = app.get(AiToolExecutorService);
    await expect(
      executor.execute(
        'get_maintenance_ticket_by_id',
        { id: ticket.id },
        { userId: admin.id, companyId: foreignId, role: UserRole.ADMIN },
      ),
    ).rejects.toThrow('not found');
  });

  it('validates staff company and active account, preserving omitted PATCH values', async () => {
    const ticket = await createTicket();
    const url = `/maintenance/tickets/${ticket.id}`;
    await request(app.getHttpServer())
      .patch(url)
      .auth(adminToken, { type: 'bearer' })
      .send({ assignedToStaffId: foreignStaffId })
      .expect(400);
    await request(app.getHttpServer())
      .patch(url)
      .auth(adminToken, { type: 'bearer' })
      .send({
        assignedToStaffId: ownStaffId,
        area: 'plumbing',
        priority: 'urgent',
        costCurrency: 'USD',
      })
      .expect(200);
    const result = await request(app.getHttpServer())
      .patch(url)
      .auth(adminToken, { type: 'bearer' })
      .send({ description: 'Only this field' })
      .expect(200);
    expect(result.body).toMatchObject({
      area: 'plumbing',
      priority: 'urgent',
      costCurrency: 'USD',
      assignedToStaffId: ownStaffId,
      status: 'assigned',
    });
    await db.query(
      'UPDATE users SET is_active=false WHERE id=(SELECT user_id FROM staff WHERE id=$1)',
      [ownStaffId],
    );
    await request(app.getHttpServer())
      .patch(url)
      .auth(adminToken, { type: 'bearer' })
      .send({ assignedToStaffId: ownStaffId })
      .expect(400);
    await db.query(
      'UPDATE users SET is_active=true WHERE id=(SELECT user_id FROM staff WHERE id=$1)',
      [ownStaffId],
    );
    await request(app.getHttpServer())
      .patch(url)
      .auth(adminToken, { type: 'bearer' })
      .send({ propertyId: foreignPropertyId })
      .expect(400);
    await request(app.getHttpServer())
      .patch(url)
      .auth(adminToken, { type: 'bearer' })
      .send({ actualCost: 1.001 })
      .expect(400);
  });

  it('recovers concurrent HTTP creation, comments and deletion without repeating audit entries', async () => {
    const key = randomUUID(),
      body = { propertyId, title: 'Recoverable repair' };
    const send = () =>
      request(app.getHttpServer())
        .post('/maintenance/tickets')
        .auth(adminToken, { type: 'bearer' })
        .set('Idempotency-Key', key)
        .send(body)
        .expect(201);
    const results = await Promise.all([send(), send()]);
    expect(results[0].body.id).toBe(results[1].body.id);
    const ticketId = results[0].body.id;
    await request(app.getHttpServer())
      .post('/maintenance/tickets')
      .auth(adminToken, { type: 'bearer' })
      .set('Idempotency-Key', key)
      .send({ ...body, title: 'Changed' })
      .expect(409);
    const commentKey = randomUUID();
    const comment = () =>
      request(app.getHttpServer())
        .post(`/maintenance/tickets/${ticketId}/comments`)
        .auth(adminToken, { type: 'bearer' })
        .set('Idempotency-Key', commentKey)
        .send({ body: 'Unique comment' })
        .expect(201);
    expect((await comment()).body.id).toBe((await comment()).body.id);
    const deleteKey = randomUUID();
    for (let i = 0; i < 2; i++)
      await request(app.getHttpServer())
        .delete(`/maintenance/tickets/${ticketId}`)
        .auth(adminToken, { type: 'bearer' })
        .set('Idempotency-Key', deleteKey)
        .expect(204);
    expect(
      await db.query(
        'SELECT action FROM maintenance_ticket_audit WHERE ticket_id=$1 ORDER BY created_at',
        [ticketId],
      ),
    ).toEqual([
      { action: 'create' },
      { action: 'comment' },
      { action: 'delete' },
    ]);
  });

  it('rolls back ticket and audit together if receipt persistence fails', async () => {
    const key = randomUUID();
    await db.query(
      `CREATE FUNCTION reject_ops_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.execution_key='${key}' THEN RAISE EXCEPTION 'receipt unavailable'; END IF; RETURN NEW; END $$`,
    );
    await db.query(
      'CREATE TRIGGER reject_ops_receipt BEFORE INSERT ON domain_operation_receipts FOR EACH ROW EXECUTE FUNCTION reject_ops_receipt()',
    );
    try {
      await expect(
        maintenance.create(
          actor(),
          { propertyId, title: 'Receipt rollback' },
          key,
        ),
      ).rejects.toThrow('receipt unavailable');
      expect(
        await db
          .getRepository(MaintenanceTicket)
          .countBy({ companyId, title: 'Receipt rollback' }),
      ).toBe(0);
      expect(
        (
          await db.query(
            "SELECT count(*)::int AS count FROM maintenance_ticket_audit WHERE after_snapshot->>'title'='Receipt rollback'",
          )
        )[0].count,
      ).toBe(0);
    } finally {
      await db.query(
        'DROP TRIGGER reject_ops_receipt ON domain_operation_receipts',
      );
      await db.query('DROP FUNCTION reject_ops_receipt()');
    }
  });

  it('persists visits, activities and notices once, blocks foreign IDs and requires actual owner consent', async () => {
    const key = randomUUID(),
      dto = visitRequest();
    const result = await visits.create(propertyId, dto, actor(), key);
    expect((await visits.create(propertyId, dto, actor(), key)).id).toBe(
      result.id,
    );
    expect(
      await db
        .getRepository(CommunicationDelivery)
        .countBy({ relatedEntityId: result.id }),
    ).toBe(1);
    await request(app.getHttpServer())
      .get(`/properties/${propertyId}/visits`)
      .auth(foreignToken, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/properties/${foreignPropertyId}/visits/${result.id}/result`)
      .auth(foreignToken, { type: 'bearer' })
      .send({ result: 'interested' })
      .expect(404);
    await db.query('UPDATE owners SET contact_consent=false WHERE user_id=$1', [
      owner.id,
    ]);
    const blocked = await visits.create(propertyId, dto, actor(), randomUUID());
    expect(
      (
        await db
          .getRepository(CommunicationDelivery)
          .findOneByOrFail({ relatedEntityId: blocked.id })
      ).status,
    ).toBe('blocked');
    await db.query('UPDATE owners SET contact_consent=true WHERE user_id=$1', [
      owner.id,
    ]);
  });

  it('rolls back visits and activities when their notice cannot be queued', async () => {
    const communications = app.get(CommunicationsService),
      key = randomUUID();
    const failure = jest
      .spyOn(communications, 'dispatchEvent')
      .mockRejectedValueOnce(new Error('notice unavailable'));
    const before = await db
      .getRepository(PropertyVisit)
      .countBy({ propertyId });
    try {
      await expect(
        visits.create(propertyId, visitRequest(), actor(), key),
      ).rejects.toThrow('notice unavailable');
    } finally {
      failure.mockRestore();
    }
    expect(await db.getRepository(PropertyVisit).countBy({ propertyId })).toBe(
      before,
    );
    expect(
      (
        await db.query(
          'SELECT count(*)::int AS count FROM domain_operation_receipts WHERE execution_key=$1',
          [key],
        )
      )[0].count,
    ).toBe(0);
  });

  it('allows tenant list reads only within an active owned lease and hides internal fields', async () => {
    const ticket = await createTicket();
    await db.query(
      `UPDATE maintenance_tickets SET metadata='{"internal":"private"}'::jsonb,external_ref='internal-ref' WHERE id=$1`,
      [ticket.id],
    );
    const own = await request(app.getHttpServer())
      .get('/maintenance/tickets')
      .auth(tenantToken, { type: 'bearer' })
      .expect(200);
    expect(
      own.body.find((item: { id: string }) => item.id === ticket.id),
    ).toMatchObject({ metadata: null, externalRef: null });
    const foreign = await request(app.getHttpServer())
      .get('/maintenance/tickets')
      .auth(foreignToken, { type: 'bearer' })
      .expect(200);
    expect(
      foreign.body.some((item: { id: string }) => item.id === ticket.id),
    ).toBe(false);
    const unrelated = await request(app.getHttpServer())
      .get('/maintenance/tickets')
      .auth(otherOwnerToken, { type: 'bearer' })
      .expect(200);
    expect(unrelated.body).toHaveLength(0);
  });
  it('enqueues consented assignment/closure once after commit, rejects stale or revoked destinations and rolls back an enqueue failure', async () => {
    const ticket = await createTicket(),
      service = app.get(CommunicationsService);
    const whatsapp = jest
      .spyOn(app.get(WhatsappService), 'sendTextMessage')
      .mockResolvedValue({ messageId: 'maintenance-test' } as never);
    const key = randomUUID();
    const update = () =>
      request(app.getHttpServer())
        .patch(`/maintenance/tickets/${ticket.id}`)
        .auth(adminToken, { type: 'bearer' })
        .set('Idempotency-Key', key)
        .send({ assignedToStaffId: ownStaffId });
    try {
      expect((await update().expect(200)).body.status).toBe('assigned');
      await update().expect(200);
      const assignments = await db.getRepository(CommunicationDelivery).findBy({
        companyId,
        relatedEntityId: ticket.id,
        event: 'maintenance_assigned' as never,
      });
      expect(assignments).toHaveLength(1);
      expect(assignments[0].status).toBe('queued');
      expect(whatsapp).not.toHaveBeenCalled();
      await db.query(
        'UPDATE owners SET contact_consent=false WHERE user_id=$1',
        [owner.id],
      );
      await expect((service as any).send(assignments[0])).rejects.toThrow(
        'consent is no longer eligible',
      );
      expect(whatsapp).not.toHaveBeenCalled();
      await db.query(
        'UPDATE owners SET contact_consent=true WHERE user_id=$1',
        [owner.id],
      );
      await maintenance.update(
        ticket.id,
        actor(),
        { status: 'resolved' as never },
        randomUUID(),
      );
      await expect((service as any).send(assignments[0])).rejects.toThrow(
        'state is no longer eligible',
      );
      const closure = await db
        .getRepository(CommunicationDelivery)
        .findOneByOrFail({
          companyId,
          relatedEntityId: ticket.id,
          event: 'maintenance_resolved' as never,
        });
      expect(closure.status).toBe('queued');
      await (service as any).send(closure);
      expect(whatsapp).toHaveBeenCalledTimes(1);
      const other = await createTicket();
      const failure = jest
        .spyOn(service, 'dispatchEvent')
        .mockRejectedValueOnce(new Error('maintenance notice unavailable'));
      try {
        await expect(
          maintenance.update(
            other.id,
            actor(),
            { assignedToStaffId: ownStaffId },
            randomUUID(),
          ),
        ).rejects.toThrow('maintenance notice unavailable');
      } finally {
        failure.mockRestore();
      }
      expect(
        (
          await db
            .getRepository(MaintenanceTicket)
            .findOneByOrFail({ id: other.id })
        ).status,
      ).toBe('open');
      expect(
        await db.query(
          "SELECT id FROM maintenance_ticket_audit WHERE ticket_id=$1 AND action='update'",
          [other.id],
        ),
      ).toHaveLength(0);
    } finally {
      whatsapp.mockRestore();
      await db.query(
        'UPDATE owners SET contact_consent=true WHERE user_id=$1',
        [owner.id],
      );
    }
  });
  it('uploads, recovers and confirms scoped tenant attachments while rejecting unrelated owners and companies', async () => {
    const ticket = await createTicket(),
      server = app.getHttpServer();
    const bytes = Buffer.from('%PDF-1.4\nmaintenance evidence\n%%EOF');
    const key = randomUUID(),
      body = {
        fileName: 'evidence.pdf',
        fileSize: bytes.length,
        mimeType: 'application/pdf',
        documentType: 'other',
      };
    const path = `/maintenance/tickets/${ticket.id}/attachments/upload-url`;
    const upload = () =>
      request(server)
        .post(path)
        .auth(tenantToken, { type: 'bearer' })
        .set('Idempotency-Key', key)
        .send(body);
    for (const auth of [otherOwnerToken, foreignToken])
      await request(server)
        .post(path)
        .auth(auth, { type: 'bearer' })
        .send(body)
        .expect(404);
    const created = (await upload().expect(201)).body;
    const recovered = (await upload().expect(201)).body;
    expect(recovered.documentId).toBe(created.documentId);
    const confirmPath = `/maintenance/tickets/${ticket.id}/attachments/${created.documentId}/confirm`;
    await request(server)
      .patch(confirmPath)
      .auth(tenantToken, { type: 'bearer' })
      .expect(400);
    const signed = new URL(recovered.uploadUrl);
    await request(server)
      .put(signed.pathname.replace(/^\/api\//, '/') + signed.search)
      .set('Content-Type', 'application/pdf')
      .send(bytes)
      .expect(204);
    for (const auth of [otherOwnerToken, foreignToken])
      await request(server)
        .patch(confirmPath)
        .auth(auth, { type: 'bearer' })
        .expect(404);
    const confirmed = await request(server)
      .patch(confirmPath)
      .auth(tenantToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .expect(200);
    expect(confirmed.body.status).toBe('approved');
    const other = await createTicket();
    await request(server)
      .patch(
        `/maintenance/tickets/${other.id}/attachments/${created.documentId}/confirm`,
      )
      .auth(tenantToken, { type: 'bearer' })
      .expect(404);
    const listed = await request(server)
      .get(`/documents/entity/maintenance_ticket/${ticket.id}`)
      .auth(ownerToken, { type: 'bearer' })
      .expect(200);
    expect(listed.body.map((item: { id: string }) => item.id)).toEqual([
      created.documentId,
    ]);
    expect(listed.body[0].fileData).toBeUndefined();
    const [stored] = await db.query(
      'SELECT file_data FROM documents WHERE id=$1 AND company_id=$2',
      [created.documentId, companyId],
    );
    expect(stored.file_data).toEqual(bytes);
  });
  it('recovers a lost approved maintenance creation through the real action inbox', async () => {
    const payload = { propertyId, title: 'Approved repair' },
      toolName = 'post_maintenance_ticket';
    const expiresAt = new Date(Date.now() + 900000).toISOString();
    const review = await buildMutationReview(
      db,
      companyId,
      toolName,
      payload,
      expiresAt,
    );
    const [{ id }] = await db.query(
      `INSERT INTO pending_actions(company_id,requested_by,tool_name,action_type,entity_type,summary,payload,payload_hash,review,expires_at) VALUES($1,$2,$3,'create','maintenance','Repair approval',$4::jsonb,$5,$6::jsonb,$7) RETURNING id`,
      [
        companyId,
        requester.id,
        toolName,
        JSON.stringify(payload),
        createHash('sha256')
          .update(JSON.stringify({ propertyId, title: payload.title }))
          .digest('hex'),
        JSON.stringify(review),
        expiresAt,
      ],
    );
    const reauth = await request(app.getHttpServer())
      .post('/auth/reauthenticate')
      .auth(adminToken, { type: 'bearer' })
      .send({ password })
      .expect(200);
    const executor = app.get(AiToolExecutorService),
      original = executor.executeApproved.bind(executor);
    const lost = jest
      .spyOn(executor, 'executeApproved')
      .mockImplementationOnce(async (...args) => {
        await original(...args);
        throw new Error('Committed response lost');
      });
    try {
      await request(app.getHttpServer())
        .post(`/pending-actions/${id}/approve`)
        .auth(adminToken, { type: 'bearer' })
        .send({ reauthToken: reauth.body.reauthToken })
        .expect(201);
    } finally {
      lost.mockRestore();
    }
    const recovered = await request(app.getHttpServer())
      .post(`/pending-actions/${id}/approve`)
      .auth(adminToken, { type: 'bearer' })
      .send({ reauthToken: reauth.body.reauthToken })
      .expect(201);
    expect(recovered.body.status).toBe('executed');
    expect(
      await db
        .getRepository(MaintenanceTicket)
        .countBy({ companyId, title: payload.title }),
    ).toBe(1);
  });
});
