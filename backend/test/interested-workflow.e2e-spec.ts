import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Company } from '../src/companies/entities/company.entity';
import { UsersService } from '../src/users/users.service';
import { User, UserRole } from '../src/users/entities/user.entity';
import { InterestedProfile } from '../src/interested/entities/interested-profile.entity';
import {
  Property,
  PropertyType,
} from '../src/properties/entities/property.entity';
import { InterestedService } from '../src/interested/interested.service';
import { PropertiesService } from '../src/properties/properties.service';
import {
  buildMutationReview,
  withApprovedMutationReview,
} from '../src/common/helpers/mutation-review';
import {
  configureE2eApp,
  createActiveTestUser,
  createTestCompany,
  loginTestUser,
} from './e2e-helpers';

describe('Assisted CRM and reviewed domain mutations (PostgreSQL)', () => {
  let app: INestApplication, db: DataSource;
  let companyId: string,
    foreignId: string,
    adminId: string,
    ownerId: string,
    propertyId: string;
  let token: string, foreignToken: string, deniedToken: string;
  const suffix = randomUUID(),
    password = 'WorkflowTest123!';
  const actor = () => ({ id: adminId, companyId, role: UserRole.ADMIN });
  const post = (
    path: string,
    payload: object,
    key?: string,
    bearer = token,
  ) => {
    const call = request(app.getHttpServer())
      .post('/interested/workflow/' + path)
      .auth(bearer, { type: 'bearer' })
      .send(payload);
    return key ? call.set('Idempotency-Key', key) : call;
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureE2eApp(app);
    await app.init();
    db = app.get(DataSource);
    companyId = (
      await createTestCompany(db.getRepository(Company), {
        name: 'CRM workflow QA',
        taxId: 'crm-' + suffix,
      })
    ).id;
    foreignId = (
      await createTestCompany(db.getRepository(Company), {
        name: 'Foreign CRM',
        taxId: 'crm-foreign-' + suffix,
      })
    ).id;
    const create = async (role: UserRole, company: string, name: string) => {
      const user = await createActiveTestUser(app.get(UsersService), {
        role,
        companyId: company,
        email: name + suffix + '@workflow.test',
        password,
        firstName: name,
        lastName: 'Fixture',
      });
      return { user, token: await loginTestUser(app, user.email!, password) };
    };
    const admin = await create(UserRole.ADMIN, companyId, 'admin');
    adminId = admin.user.id;
    token = admin.token;
    foreignToken = (await create(UserRole.ADMIN, foreignId, 'foreign')).token;
    const denied = await create(UserRole.STAFF, companyId, 'denied');
    deniedToken = denied.token;
    await db.getRepository(User).update(denied.user.id, {
      permissions: { interested: false, properties: false },
    });
    ownerId = (
      await db.query(
        'INSERT INTO owners(company_id,user_id) VALUES($1,$2) RETURNING id',
        [companyId, adminId],
      )
    )[0].id;
    propertyId = (
      await db.getRepository(Property).save({
        companyId,
        ownerId,
        name: 'CRM property',
        propertyType: PropertyType.APARTMENT,
        addressStreet: 'Workflow 100',
        addressCity: 'Buenos Aires',
        addressState: 'Buenos Aires',
      })
    ).id;
  });
  afterAll(async () => {
    if (db && companyId)
      await db.transaction(async (manager) => {
        await manager.query("SET LOCAL session_replication_role='replica'");
        const profiles = await manager.query(
          'SELECT id FROM interested_profiles WHERE company_id=ANY($1::uuid[])',
          [[companyId, foreignId]],
        );
        for (const table of [
          'interested_activities',
          'interested_stage_history',
          'property_visits',
        ])
          await manager.query(
            `DELETE FROM ${table} WHERE interested_profile_id=ANY($1::uuid[])`,
            [profiles.map((row: { id: string }) => row.id)],
          );
        for (const table of [
          'ai_embedding_outbox',
          'ai_knowledge_chunks',
          'interested_workflow_audit',
          'domain_operation_receipts',
          'property_reservations',
          'interested_property_matches',
          'properties',
          'owners',
          'interested_profiles',
          'users',
          'companies',
        ]) {
          const column = table === 'companies' ? 'id' : 'company_id';
          await manager.query(
            `DELETE FROM ${table} WHERE ${column}=ANY($1::uuid[])`,
            [[companyId, foreignId]],
          );
        }
      });
    await app?.close();
  });
  const profile = (phone: string, company = companyId) =>
    db.getRepository(InterestedProfile).save({
      companyId: company,
      phone,
      firstName: 'Persona',
      lastName: phone,
      operations: ['rent'] as any,
      operation: 'rent' as any,
      consentContact: false,
    });

  it('imports the reviewed data once, detects changed keys and records the consent supplied', async () => {
    const rows = [
      {
        phone: 'import-' + suffix,
        firstName: 'Importada',
        consentContact: false,
      },
    ];
    const preview = (await post('import/preview', { rows }).expect(201)).body;
    expect(preview.rows[0].duplicateIds).toEqual([]);
    const key = randomUUID(),
      payload = { rows, reviewToken: preview.reviewToken, skipRows: [] };
    const first = (await post('import', payload, key).expect(201)).body;
    expect(first.createdIds).toHaveLength(1);
    expect((await post('import', payload, key).expect(201)).body).toEqual(
      first,
    );
    const stored = await db
      .getRepository(InterestedProfile)
      .findOneByOrFail({ id: first.createdIds[0] });
    expect(stored.consentContact).toBe(false);
    expect(stored.consentRecordedAt).toBeNull();
    await post('import', { ...payload, skipRows: [0] }, key).expect(409);
    const [count] = await db.query(
      'SELECT count(*)::int AS n FROM interested_profiles WHERE company_id=$1 AND phone=$2',
      [companyId, rows[0].phone],
    );
    expect(count.n).toBe(1);
  });
  it('rejects a duplicate inserted after review and staff without CRM permission', async () => {
    const rows = [{ phone: 'raced-' + suffix }];
    const preview = (await post('import/preview', { rows }).expect(201)).body;
    await profile(rows[0].phone);
    await post(
      'import',
      { rows, reviewToken: preview.reviewToken, skipRows: [] },
      randomUUID(),
    ).expect(409);
    await post('import/preview', { rows }, undefined, deniedToken).expect(403);
    const [persisted] = await db.query(
      'SELECT count(*)::int AS n FROM interested_profiles WHERE company_id=$1 AND phone=$2',
      [companyId, rows[0].phone],
    );
    expect(persisted.n).toBe(1);
    await post(
      'import',
      { rows, reviewToken: preview.reviewToken, skipRows: [] },
      randomUUID(),
      foreignToken,
    ).expect(400);
  });
  it('merges history with audit and preserves destination consent, then recovers the original result', async () => {
    const target = await profile('merge-target-' + suffix),
      source = await profile('merge-source-' + suffix);
    await db.getRepository(InterestedProfile).update(source.id, {
      consentContact: true,
      consentRecordedAt: new Date(),
    });
    await app
      .get(InterestedService)
      .createActivity(
        source.id,
        { type: 'note', subject: 'Historia original' } as any,
        actor(),
      );
    const identifiers = { targetId: target.id, sourceId: source.id };
    const preview = (await post('merge/preview', identifiers).expect(201)).body;
    expect(preview.people.map((person: { id: string }) => person.id)).toEqual([
      target.id,
      source.id,
    ]);
    const payload = { ...identifiers, reviewToken: preview.reviewToken },
      key = randomUUID();
    const result = (await post('merge', payload, key).expect(201)).body;
    expect(result).toEqual({ id: target.id, archivedId: source.id });
    expect((await post('merge', payload, key).expect(201)).body).toEqual(
      result,
    );
    expect(
      (
        await db
          .getRepository(InterestedProfile)
          .findOneByOrFail({ id: target.id })
      ).consentContact,
    ).toBe(false);
    const [activity] = await db.query(
      'SELECT interested_profile_id FROM interested_activities WHERE subject=$1 AND interested_profile_id=$2',
      ['Historia original', target.id],
    );
    expect(activity.interested_profile_id).toBe(target.id);
    const [audit] = await db.query(
      "SELECT evidence FROM interested_workflow_audit WHERE company_id=$1 AND operation='merge'",
      [companyId],
    );
    expect(audit.evidence.people[1].consent_contact).toBe(true);
    await expect(
      db.query(
        "UPDATE interested_workflow_audit SET operation='forged' WHERE company_id=$1",
        [companyId],
      ),
    ).rejects.toThrow('immutable');
  });
  it('does not merge a foreign resource or changes made after the review', async () => {
    const target = await profile('review-target-' + suffix),
      source = await profile('review-source-' + suffix),
      foreign = await profile('foreign-' + suffix, foreignId);
    await post('merge/preview', {
      targetId: target.id,
      sourceId: foreign.id,
    }).expect(404);
    const ids = { targetId: target.id, sourceId: source.id },
      preview = (await post('merge/preview', ids).expect(201)).body;
    await db
      .getRepository(InterestedProfile)
      .update(source.id, { notes: 'Changed after review' });
    await post(
      'merge',
      { ...ids, reviewToken: preview.reviewToken },
      randomUUID(),
    ).expect(409);
    expect(
      (
        await db
          .getRepository(InterestedProfile)
          .findOneByOrFail({ id: source.id })
      ).deletedAt,
    ).toBeNull();
  });
  it('keeps pipeline stages in use and denies unknown stages', async () => {
    const person = await profile('pipeline-' + suffix);
    const patch = (path: string, payload: object) =>
      request(app.getHttpServer())
        .patch('/interested/workflow/pipeline' + path)
        .auth(token, { type: 'bearer' })
        .set('Idempotency-Key', randomUUID())
        .send(payload);
    const stages = [
      { id: 'new', label: 'Nuevo' },
      { id: 'negotiating', label: 'Negociación' },
    ];
    expect((await patch('', { stages }).expect(200)).body).toEqual(stages);
    expect(
      (await patch('/' + person.id, { stageId: 'negotiating' }).expect(200))
        .body.pipelineStage,
    ).toBe('negotiating');
    await patch('', { stages: [stages[0]] }).expect(409);
    await patch('/' + person.id, { stageId: 'missing' }).expect(400);
  });
  it('serializes competing reservations on one property', async () => {
    const first = await profile('reserve-one-' + suffix),
      second = await profile('reserve-two-' + suffix);
    const results = await Promise.allSettled([
      app
        .get(InterestedService)
        .createReservation(
          first.id,
          { propertyId } as any,
          actor(),
          randomUUID(),
        ),
      app
        .get(InterestedService)
        .createReservation(
          second.id,
          { propertyId } as any,
          actor(),
          randomUUID(),
        ),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    const [count] = await db.query(
      "SELECT count(*)::int AS n FROM property_reservations WHERE company_id=$1 AND property_id=$2 AND status='active'",
      [companyId, propertyId],
    );
    expect(count.n).toBe(1);
  });
  it('locks the observed version and recovers a committed property mutation after later edits', async () => {
    const payload = { id: propertyId, name: 'Reviewed property' },
      key = randomUUID();
    const review = await buildMutationReview(
      db,
      companyId,
      'patch_properties_by_id',
      payload,
      new Date(Date.now() + 900_000).toISOString(),
    );
    const context = {
      companyId,
      executionKey: key,
      tool: 'patch_properties_by_id',
      payload,
      review,
    };
    const update = () =>
      withApprovedMutationReview(context, () =>
        app
          .get(PropertiesService)
          .update(propertyId, { name: payload.name }, actor(), key),
      );
    const original = JSON.parse(JSON.stringify(await update()));
    await db.query(
      "UPDATE properties SET name='Later edit',updated_at=now() WHERE id=$1",
      [propertyId],
    );
    expect(JSON.parse(JSON.stringify(await update()))).toEqual(original);
    await expect(
      withApprovedMutationReview(
        { ...context, executionKey: randomUUID() },
        () =>
          app
            .get(PropertiesService)
            .update(propertyId, { name: payload.name }, actor(), randomUUID()),
      ),
    ).rejects.toThrow('scope mismatch');
    const staleKey = randomUUID();
    await expect(
      withApprovedMutationReview({ ...context, executionKey: staleKey }, () =>
        app
          .get(PropertiesService)
          .update(propertyId, { name: payload.name }, actor(), staleKey),
      ),
    ).rejects.toThrow('cambió');
    expect(
      (await db.getRepository(Property).findOneByOrFail({ id: propertyId }))
        .name,
    ).toBe('Later edit');
  });
});
