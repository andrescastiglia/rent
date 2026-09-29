import { createHash, randomUUID } from 'node:crypto';
import { AiToolExecutorService } from '../src/ai/ai-tool-executor.service';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Company } from '../src/companies/entities/company.entity';
import { UsersService } from '../src/users/users.service';
import { UserRole } from '../src/users/entities/user.entity';
import { AmendmentsService } from '../src/leases/amendments.service';
import { Lease, LeaseStatus } from '../src/leases/entities/lease.entity';
import {
  LeaseAmendment,
  AmendmentChangeType as Change,
} from '../src/leases/entities/lease-amendment.entity';
import {
  Property,
  PropertyType,
} from '../src/properties/entities/property.entity';
import { assertNoPendingBillingAmendment } from '../src/leases/amendment-application';
import { InvoicesService } from '../src/payments/invoices.service';
import {
  configureE2eApp,
  createActiveTestUser,
  createTestCompany,
  loginTestUser,
} from './e2e-helpers';

describe('Automatic lease amendments (PostgreSQL)', () => {
  let app: INestApplication, db: DataSource, service: AmendmentsService;
  let companyId: string,
    foreignId: string,
    ownerId: string,
    replacementOwnerId: string,
    requesterId: string,
    tenantId: string,
    propertyId: string,
    leaseId: string,
    token: string,
    foreignToken: string,
    tenantToken: string,
    today: string;
  let actor: { id: string; companyId: string; role: UserRole };
  const suffix = randomUUID();
  const oldToolsMode = process.env.AI_TOOLS_MODE;
  const oldToken = process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN;
  beforeAll(async () => {
    process.env.AI_TOOLS_MODE = 'FULL';
    process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN = 'amendments-test';
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureE2eApp(app);
    await app.init();
    db = app.get(DataSource);
    service = app.get(AmendmentsService);
    companyId = (
      await createTestCompany(db.getRepository(Company), {
        name: 'Amendments',
        taxId: `amend-${suffix}`,
      })
    ).id;
    foreignId = (
      await createTestCompany(db.getRepository(Company), {
        name: 'Foreign amendments',
        taxId: `other-${suffix}`,
      })
    ).id;
    const createUser = async (id: string, role = UserRole.ADMIN) => {
      const user = await createActiveTestUser(app.get(UsersService), {
        companyId: id,
        role,
        email: `${id}-${role}@amendments.test`,
        password: 'AmendmentsTest123!',
        firstName: 'Amendment',
        lastName: 'Test',
      });
      return {
        user,
        token: await loginTestUser(app, user.email!, 'AmendmentsTest123!'),
      };
    };
    const admin = await createUser(companyId);
    token = admin.token;
    actor = { id: admin.user.id, companyId, role: UserRole.ADMIN };
    foreignToken = (await createUser(foreignId)).token;
    ownerId = (
      await db.query(
        'INSERT INTO owners(company_id,user_id) VALUES($1,$2) RETURNING id',
        [companyId, actor.id],
      )
    )[0].id;
    const replacementOwner = await createActiveTestUser(app.get(UsersService), {
      companyId,
      role: UserRole.ADMIN,
      email: `replacement-${suffix}@amendments.test`,
      password: 'AmendmentsTest123!',
      firstName: 'New',
      lastName: 'Owner',
    });
    requesterId = replacementOwner.id;
    replacementOwnerId = (
      await db.query(
        'INSERT INTO owners(company_id,user_id) VALUES($1,$2) RETURNING id',
        [companyId, replacementOwner.id],
      )
    )[0].id;
    const tenantUser = await createUser(companyId, UserRole.TENANT);
    tenantToken = tenantUser.token;
    tenantId = (
      await db.query(
        'INSERT INTO tenants(company_id,user_id) VALUES($1,$2) RETURNING id',
        [companyId, tenantUser.user.id],
      )
    )[0].id;
    propertyId = (
      await db.getRepository(Property).save({
        companyId,
        ownerId,
        name: 'Amendment property',
        propertyType: PropertyType.APARTMENT,
        addressStreet: 'Test 100',
        addressCity: 'Buenos Aires',
        addressState: 'Buenos Aires',
      })
    ).id;
    today = (
      await db.query(
        "SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires')::date::text AS day",
      )
    )[0].day;
  });
  async function clear() {
    for (const table of [
      'pending_actions',
      'domain_operation_receipts',
      'lease_amendments',
      'invoices',
      'tenant_accounts',
      'leases',
    ])
      await db.query(`DELETE FROM ${table} WHERE company_id=$1`, [companyId]);
  }
  beforeEach(async () => {
    await clear();
    leaseId = (
      await db.query(
        `INSERT INTO leases(company_id,property_id,owner_id,tenant_id,contract_type,status,start_date,end_date,monthly_rent,currency,confirmed_contract_text,confirmed_contract_format) VALUES($1,$2,$3,$4,'rental','active','2020-01-01','2099-01-01',1000,'ARS','Original signed text','plain_text') RETURNING id`,
        [companyId, propertyId, ownerId, tenantId],
      )
    )[0].id;
    await db.query(
      'INSERT INTO tenant_accounts(company_id,tenant_id,lease_id,currency) VALUES($1,$2,$3,$4)',
      [companyId, tenantId, leaseId, 'ARS'],
    );
    await db.query(
      "UPDATE properties SET operation_state='rented' WHERE id=$1",
      [propertyId],
    );
  });
  afterAll(async () => {
    if (companyId) {
      await clear();
      for (const table of ['properties', 'tenants', 'owners'])
        await db.query(`DELETE FROM ${table} WHERE company_id=$1`, [companyId]);
    }
    for (const id of [companyId, foreignId].filter(Boolean))
      for (const table of ['admins', 'users', 'companies'])
        await db.query(
          `DELETE FROM ${table} WHERE ${table === 'companies' ? 'id' : 'company_id'}=$1`,
          [id],
        );
    await app?.close();
    if (oldToolsMode === undefined) delete process.env.AI_TOOLS_MODE;
    else process.env.AI_TOOLS_MODE = oldToolsMode;
    if (oldToken === undefined)
      delete process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN;
    else process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN = oldToken;
  });
  const create = (
    effectiveDate = today,
    changeType = Change.RENT_INCREASE,
    newValues: Record<string, unknown> = { monthlyRent: 1200 },
    key?: string,
  ) =>
    service.create(
      {
        leaseId,
        companyId: foreignId,
        effectiveDate,
        changeType,
        newValues,
        description: 'Approved contractual amendment',
      },
      actor,
      key,
    );
  const getLease = () =>
    db.getRepository(Lease).findOneByOrFail({ id: leaseId });
  const getAmendment = (id: string) => service.findOne(id, actor);
  const approve = async (amendment: LeaseAmendment, key?: string) => {
    await service.submit(amendment.id, actor);
    return service.approve(amendment.id, actor, key);
  };

  it('applies a due approval atomically, records real before/after values and preserves original contract text', async () => {
    const result = await approve(await create());
    expect(result.applicationStatus).toBe('applied');
    expect(result.appliedAt).toBeTruthy();
    expect(result.applicationSnapshot).toMatchObject({
      before: { monthlyRent: '1000.00' },
      after: { monthlyRent: 1200 },
    });
    expect(await getLease()).toMatchObject({
      monthlyRent: '1200.00',
      confirmedContractText: 'Original signed text',
    });
    await service.processDue();
    expect((await getAmendment(result.id)).appliedAt).toEqual(result.appliedAt);
  });
  it('queues future approvals and blocks premature billing across their effective date', async () => {
    const result = await approve(await create('2098-01-01'));
    expect(result.applicationStatus).toBe('pending');
    await service.processDue();
    expect((await getLease()).monthlyRent).toBe('1000.00');
    await expect(
      assertNoPendingBillingAmendment(
        db.manager,
        leaseId,
        companyId,
        '2098-01-31',
      ),
    ).rejects.toThrow('before billing');
    await expect(
      assertNoPendingBillingAmendment(db.manager, leaseId, companyId, today),
    ).resolves.toBeUndefined();
    await expect(
      app.get(InvoicesService).create(
        {
          leaseId,
          periodStart: '2098-01-01',
          periodEnd: '2098-01-31',
          dueDate: '2098-01-10',
          subtotal: 1000,
        },
        companyId,
      ),
    ).rejects.toThrow('before billing');
  });
  it('recovers create, submit and approval receipts without repeating changes', async () => {
    const createKey = randomUUID(),
      submitKey = randomUUID(),
      approveKey = randomUUID();
    const amendment = await create(
      today,
      Change.RENT_INCREASE,
      { monthlyRent: 1200 },
      createKey,
    );
    await service.submit(amendment.id, actor, submitKey);
    await service.approve(amendment.id, actor, approveKey);
    expect(
      (
        await create(
          today,
          Change.RENT_INCREASE,
          { monthlyRent: 1200 },
          createKey,
        )
      ).id,
    ).toBe(amendment.id);
    expect((await service.submit(amendment.id, actor, submitKey)).status).toBe(
      'pending_approval',
    );
    expect(
      (await service.approve(amendment.id, actor, approveKey))
        .applicationStatus,
    ).toBe('applied');
    expect(await db.getRepository(LeaseAmendment).countBy({ leaseId })).toBe(1);
    await expect(
      create(today, Change.RENT_INCREASE, { monthlyRent: 1400 }, createKey),
    ).rejects.toThrow('different operation or request');
  });
  it('assigns distinct sequential numbers under concurrent creation', async () => {
    const results = await Promise.all([create(), create(), create()]);
    expect(results.map((r) => r.amendmentNumber).sort((a, b) => a - b)).toEqual(
      [1, 2, 3],
    );
  });
  it('allows only one of a concurrent approval and rejection', async () => {
    const amendment = await create();
    await service.submit(amendment.id, actor);
    const results = await Promise.allSettled([
      service.approve(amendment.id, actor),
      service.reject(amendment.id, actor),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const stored = await getAmendment(amendment.id);
    expect((await getLease()).monthlyRent).toBe(
      stored.status === 'approved' ? '1200.00' : '1000.00',
    );
  });
  it('applies overdue queued amendments in effective date and number order, even with concurrent workers', async () => {
    const first = await create(today, Change.RENT_INCREASE, {
      monthlyRent: 1200,
    });
    const second = await create(today, Change.RENT_INCREASE, {
      monthlyRent: 1400,
    });
    await db.query(
      "UPDATE lease_amendments SET status='approved',application_status='pending' WHERE lease_id=$1",
      [leaseId],
    );
    await Promise.all([service.processDue(), service.processDue()]);
    expect((await getLease()).monthlyRent).toBe('1400.00');
    expect((await getAmendment(first.id)).applicationSnapshot).toMatchObject({
      before: { monthlyRent: '1000.00' },
    });
    expect((await getAmendment(second.id)).applicationSnapshot).toMatchObject({
      before: { monthlyRent: '1200.00' },
    });
  });
  it('persists inactive-contract errors and does not apply dependent amendments', async () => {
    const first = await create(),
      second = await create(today, Change.RENT_INCREASE, { monthlyRent: 1400 });
    await db.query(
      "UPDATE lease_amendments SET status='approved',application_status='pending' WHERE lease_id=$1",
      [leaseId],
    );
    await db
      .getRepository(Lease)
      .update(leaseId, { status: LeaseStatus.FINALIZED });
    await service.processDue();
    expect(await getAmendment(first.id)).toMatchObject({
      applicationStatus: 'error',
      applicationError: expect.stringContaining('active lease'),
      appliedAt: null,
    });
    expect((await getAmendment(second.id)).applicationStatus).toBe('pending');
    expect((await getLease()).monthlyRent).toBe('1000.00');
  });
  it('retries application after a transient write failure without partial contract updates', async () => {
    const amendment = await create();
    await db.query(
      "UPDATE lease_amendments SET status='approved',application_status='pending' WHERE id=$1",
      [amendment.id],
    );
    await db.query(
      `CREATE OR REPLACE FUNCTION test_amendment_write_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.company_id='${companyId}'::uuid AND NEW.application_status='applied' THEN RAISE EXCEPTION 'Test failure'; END IF; RETURN NEW; END $$`,
    );
    await db.query(
      'CREATE TRIGGER test_amendment_write_failure BEFORE UPDATE ON lease_amendments FOR EACH ROW EXECUTE FUNCTION test_amendment_write_failure()',
    );
    try {
      await service.processDue();
      expect((await getLease()).monthlyRent).toBe('1000.00');
      expect((await getAmendment(amendment.id)).applicationStatus).toBe(
        'error',
      );
    } finally {
      await db.query(
        'DROP TRIGGER test_amendment_write_failure ON lease_amendments',
      );
      await db.query('DROP FUNCTION test_amendment_write_failure()');
    }
    await service.processDue();
    expect((await getAmendment(amendment.id)).applicationStatus).toBe(
      'applied',
    );
    expect((await getLease()).monthlyRent).toBe('1200.00');
  });
  it.each([
    [Change.RENT_DECREASE, { monthlyRent: 900 }, { monthlyRent: '900.00' }],
    [Change.EXTENSION, { endDate: '2099-12-31' }, { endDate: '2099-12-31' }],
    [
      Change.CLAUSE_MODIFICATION,
      { termsAndConditions: 'New conditions' },
      { termsAndConditions: 'New conditions' },
    ],
    [
      Change.GUARANTOR_CHANGE,
      { specialClauses: 'New guarantee clause' },
      { specialClauses: 'New guarantee clause' },
    ],
    [
      Change.OTHER,
      { specialClauses: 'Other agreed clause' },
      { specialClauses: 'Other agreed clause' },
    ],
  ])('applies supported change %s', async (type, values, expected) => {
    expect(
      (await approve(await create(today, type, values))).applicationStatus,
    ).toBe('applied');
    expect(await getLease()).toMatchObject(expected);
  });
  it('terminates the contract and frees the property on the effective date', async () => {
    expect(
      (await approve(await create(today, Change.EARLY_TERMINATION, {})))
        .applicationStatus,
    ).toBe('applied');
    expect(await getLease()).toMatchObject({
      status: 'finalized',
      endDate: today,
    });
    await expect(
      assertNoPendingBillingAmendment(
        db.manager,
        leaseId,
        companyId,
        '2098-01-01',
      ),
    ).rejects.toThrow('early termination');
    expect(
      (await db.getRepository(Property).findOneByOrFail({ id: propertyId }))
        .operationState,
    ).toBe('available');
  });
  it('reports an adjustment-calendar conflict instead of overwriting a calculated rent', async () => {
    await db.query('UPDATE leases SET next_adjustment_date=$2 WHERE id=$1', [
      leaseId,
      today,
    ]);
    const result = await approve(await create());
    expect(result.applicationStatus).toBe('error');
    expect(result.applicationError).toContain('adjustment calendar');
    expect((await getLease()).monthlyRent).toBe('1000.00');
  });
  it('rejects arbitrary JSON, excess precision and unsupported clause payloads', async () => {
    for (const values of [
      { monthlyRent: 1200, companyId: foreignId },
      { monthlyRent: 12.001 },
      { monthlyRent: -1 },
    ])
      await expect(create(today, Change.RENT_INCREASE, values)).rejects.toThrow(
        'Invalid newValues',
      );
    await expect(
      create(today, Change.GUARANTOR_CHANGE, { guarantorId: randomUUID() }),
    ).rejects.toThrow('Invalid newValues');
    expect(await db.getRepository(LeaseAmendment).countBy({ leaseId })).toBe(0);
  });
  it('holds an amendment while billing overlaps, then applies after the draft is cancelled', async () => {
    const invoices = app.get(InvoicesService);
    const invoice = await invoices.create(
      {
        leaseId,
        periodStart: today,
        periodEnd: today,
        dueDate: today,
        subtotal: 1000,
      },
      companyId,
    );
    const amendment = await approve(await create());
    expect(amendment.applicationStatus).toBe('error');
    expect(amendment.applicationError).toContain('billing overlaps');
    expect((await getLease()).monthlyRent).toBe('1000.00');
    await expect(invoices.issue(invoice.id, companyId)).rejects.toThrow(
      'before billing',
    );
    await invoices.cancel(invoice.id, companyId);
    await service.processDue();
    expect((await getAmendment(amendment.id)).applicationStatus).toBe(
      'applied',
    );
    expect((await getLease()).monthlyRent).toBe('1200.00');
  });
  it('rejects approval before submission and preserves rejected amendments without application', async () => {
    const amendment = await create();
    await expect(service.approve(amendment.id, actor)).rejects.toThrow(
      'Only pending',
    );
    await service.submit(amendment.id, actor);
    const key = randomUUID();
    await service.reject(amendment.id, actor, key);
    expect((await service.reject(amendment.id, actor, key)).status).toBe(
      'rejected',
    );
    await service.processDue();
    expect((await getLease()).monthlyRent).toBe('1000.00');
  });
  it('does not overwrite later applied clauses when an older amendment is approved late', async () => {
    const older = await create(today, Change.CLAUSE_MODIFICATION, {
      specialClauses: 'Earlier clause',
    });
    await approve(
      await create(today, Change.CLAUSE_MODIFICATION, {
        specialClauses: 'Later clause',
      }),
    );
    const result = await approve(older);
    expect(result.applicationStatus).toBe('error');
    expect(result.applicationError).toContain('backdated approval');
    expect((await getLease()).specialClauses).toBe('Later clause');
  });
  it('protects approved terms and applied audit evidence against later changes', async () => {
    const result = await approve(await create());
    await expect(
      db.query("UPDATE lease_amendments SET new_values='{}' WHERE id=$1", [
        result.id,
      ]),
    ).rejects.toThrow('immutable');
    await expect(
      db.query(
        "UPDATE lease_amendments SET application_snapshot='{}' WHERE id=$1",
        [result.id],
      ),
    ).rejects.toThrow('immutable');
  });
  it('keeps historical approvals for review instead of automatically applying them', async () => {
    const amendment = await create();
    await db.query(
      "UPDATE lease_amendments SET status='approved',application_status='legacy_review' WHERE id=$1",
      [amendment.id],
    );
    await service.processDue();
    expect((await getLease()).monthlyRent).toBe('1000.00');
    await expect(
      assertNoPendingBillingAmendment(db.manager, leaseId, companyId, today),
    ).rejects.toThrow('before billing');
  });
  it('revalidates owner visibility before replaying a receipt', async () => {
    const ownerActor = { ...actor, role: UserRole.OWNER },
      key = randomUUID();
    const dto = {
      leaseId,
      companyId,
      effectiveDate: today,
      changeType: Change.RENT_INCREASE,
      description: 'Owner amendment',
      newValues: { monthlyRent: 1200 },
    };
    await service.create(dto, ownerActor, key);
    await db.query('UPDATE properties SET owner_id=$2 WHERE id=$1', [
      propertyId,
      replacementOwnerId,
    ]);
    try {
      await expect(service.create(dto, ownerActor, key)).rejects.toThrow(
        'not found',
      );
    } finally {
      await db.query('UPDATE properties SET owner_id=$2 WHERE id=$1', [
        propertyId,
        ownerId,
      ]);
    }
  });
  const reviewRequest = async (
    id: string,
    action: 'cancel' | 'schedule' = 'cancel',
  ) => ({
    action,
    reason: 'Reviewed with the contract administrator',
    expectedUpdatedAt: (await getAmendment(id)).updatedAt.toISOString(),
    idempotencyKey: randomUUID(),
  });

  it('cancels a future approval with a durable reason and releases its billing barrier', async () => {
    const amendment = await approve(await create('2098-01-01'));
    const dto = await reviewRequest(amendment.id);
    const result = await service.review(amendment.id, dto, actor);
    expect(result.amendment).toMatchObject({
      status: 'cancelled',
      applicationStatus: 'none',
      appliedAt: null,
      approvedBy: actor.id,
    });
    expect(result.review).toMatchObject({
      action: 'cancel',
      performedBy: actor.id,
      reason: dto.reason,
      before: { status: 'approved', applicationStatus: 'pending' },
      after: { status: 'cancelled' },
    });
    await expect(
      assertNoPendingBillingAmendment(
        db.manager,
        leaseId,
        companyId,
        '2098-01-31',
      ),
    ).resolves.toBeUndefined();
    expect(
      JSON.parse(
        JSON.stringify(await service.review(amendment.id, dto, actor)),
      ),
    ).toEqual(JSON.parse(JSON.stringify(result)));
    expect(await service.reviewHistory(amendment.id, actor)).toHaveLength(1);
    await expect(
      service.review(
        amendment.id,
        { ...dto, reason: 'Changed cancellation explanation' },
        actor,
      ),
    ).rejects.toThrow('different operation or request');
    expect((await getLease()).monthlyRent).toBe('1000.00');
  });
  it.each(['draft', 'pending_approval', 'error', 'legacy_review'])(
    'cancels an unapplied %s amendment',
    async (state) => {
      const amendment = await create();
      if (state === 'pending_approval')
        await service.submit(amendment.id, actor);
      if (['error', 'legacy_review'].includes(state))
        await db.query(
          "UPDATE lease_amendments SET status='approved',application_status=$2 WHERE id=$1",
          [amendment.id, state],
        );
      const result = await service.review(
        amendment.id,
        await reviewRequest(amendment.id),
        actor,
      );
      expect(result.amendment.status).toBe('cancelled');
      await service.processDue();
      expect((await getLease()).monthlyRent).toBe('1000.00');
    },
  );
  it('schedules an explicitly reviewed historical approval without rewriting the original approval', async () => {
    const amendment = await create();
    await db.query(
      "UPDATE lease_amendments SET status='approved',application_status='legacy_review',approved_by=$2,approved_at='2025-01-01' WHERE id=$1",
      [amendment.id, requesterId],
    );
    const result = await service.review(
      amendment.id,
      await reviewRequest(amendment.id, 'schedule'),
      actor,
    );
    expect(result.amendment).toMatchObject({
      status: 'approved',
      applicationStatus: 'applied',
      approvedBy: requesterId,
    });
    expect(result.amendment.approvedAt.toISOString()).toContain('2025-01-01');
    expect(result.review).toMatchObject({
      performedBy: actor.id,
      before: { applicationStatus: 'legacy_review' },
      after: { applicationStatus: 'applied' },
    });
    expect((await getLease()).monthlyRent).toBe('1200.00');
  });
  it('records a scheduled historical approval that still needs billing review', async () => {
    const amendment = await create();
    await db.query(
      "UPDATE lease_amendments SET status='approved',application_status='legacy_review' WHERE id=$1",
      [amendment.id],
    );
    await db.query('UPDATE leases SET next_adjustment_date=$2 WHERE id=$1', [
      leaseId,
      today,
    ]);
    const result = await service.review(
      amendment.id,
      await reviewRequest(amendment.id, 'schedule'),
      actor,
    );
    expect(result.amendment.applicationStatus).toBe('error');
    expect(result.review.after).toMatchObject({
      applicationStatus: 'error',
      applicationError: expect.stringContaining('adjustment calendar'),
    });
    expect((await getLease()).monthlyRent).toBe('1000.00');
  });
  it('does not enable malformed historical terms but still allows audited cancellation', async () => {
    const amendment = await create();
    await db.query(
      "UPDATE lease_amendments SET new_values='{\"arbitraryField\":true}',status='approved',application_status='legacy_review' WHERE id=$1",
      [amendment.id],
    );
    await expect(
      service.review(
        amendment.id,
        await reviewRequest(amendment.id, 'schedule'),
        actor,
      ),
    ).rejects.toThrow('Invalid newValues');
    expect((await getAmendment(amendment.id)).applicationStatus).toBe(
      'legacy_review',
    );
    expect(await service.reviewHistory(amendment.id, actor)).toHaveLength(0);
    expect(
      (
        await service.review(
          amendment.id,
          await reviewRequest(amendment.id),
          actor,
        )
      ).amendment.status,
    ).toBe('cancelled');
  });
  it('requires a fresh observed version, reason and a valid recovery key', async () => {
    const amendment = await create();
    const dto = await reviewRequest(amendment.id);
    await service.submit(amendment.id, actor);
    await expect(service.review(amendment.id, dto, actor)).rejects.toThrow(
      'reload before reviewing',
    );
    for (const invalid of [
      { reason: ' ' },
      { idempotencyKey: 'bad-key' },
      { expectedUpdatedAt: 'yesterday' },
    ])
      await expect(
        service.review(amendment.id, { ...dto, ...invalid }, actor),
      ).rejects.toThrow('Valid review');
    expect(await service.reviewHistory(amendment.id, actor)).toHaveLength(0);
  });
  it('rejects cancellation of applied amendments and scheduling of normal approvals', async () => {
    const amendment = await approve(await create());
    await expect(
      service.review(amendment.id, await reviewRequest(amendment.id), actor),
    ).rejects.toThrow('Applied amendments');
    const future = await approve(
      await create('2098-01-01', Change.RENT_INCREASE, { monthlyRent: 1400 }),
    );
    await expect(
      service.review(
        future.id,
        await reviewRequest(future.id, 'schedule'),
        actor,
      ),
    ).rejects.toThrow('Only historical');
    expect(await service.reviewHistory(amendment.id, actor)).toHaveLength(0);
  });
  it('allows cancelling an obsolete queued change after the contract and property were soft-deleted', async () => {
    const amendment = await approve(await create('2098-01-01'));
    const dto = await reviewRequest(amendment.id);
    await db.query('UPDATE leases SET deleted_at=now() WHERE id=$1', [leaseId]);
    await db.query('UPDATE properties SET deleted_at=now() WHERE id=$1', [
      propertyId,
    ]);
    try {
      expect(
        (await service.review(amendment.id, dto, actor)).amendment.status,
      ).toBe('cancelled');
      expect(await service.reviewHistory(amendment.id, actor)).toHaveLength(1);
    } finally {
      await db.query('UPDATE properties SET deleted_at=NULL WHERE id=$1', [
        propertyId,
      ]);
    }
  });
  it('serializes cancellation against application without allowing both effects', async () => {
    const amendment = await create();
    await db.query(
      "UPDATE lease_amendments SET status='approved',application_status='pending' WHERE id=$1",
      [amendment.id],
    );
    const dto = await reviewRequest(amendment.id);
    const outcomes = await Promise.allSettled([
      service.review(amendment.id, dto, actor),
      service.processDue(),
    ]);
    const result = await getAmendment(amendment.id);
    if (outcomes[0].status === 'fulfilled') {
      expect(result.status).toBe('cancelled');
      expect((await getLease()).monthlyRent).toBe('1000.00');
      expect(await service.reviewHistory(amendment.id, actor)).toHaveLength(1);
    } else {
      expect(result.applicationStatus).toBe('applied');
      expect((await getLease()).monthlyRent).toBe('1200.00');
      expect(await service.reviewHistory(amendment.id, actor)).toHaveLength(0);
    }
  });
  it('rolls back scheduling, contract application and receipt if review audit insertion fails', async () => {
    const amendment = await create();
    await db.query(
      "UPDATE lease_amendments SET status='approved',application_status='legacy_review' WHERE id=$1",
      [amendment.id],
    );
    const dto = await reviewRequest(amendment.id, 'schedule');
    await db.query(
      `CREATE OR REPLACE FUNCTION test_amendment_review_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.company_id='${companyId}'::uuid THEN RAISE EXCEPTION 'Review audit failed'; END IF; RETURN NEW; END $$`,
    );
    await db.query(
      'CREATE TRIGGER test_amendment_review_failure BEFORE INSERT ON lease_amendment_reviews FOR EACH ROW EXECUTE FUNCTION test_amendment_review_failure()',
    );
    try {
      await expect(service.review(amendment.id, dto, actor)).rejects.toThrow(
        'Review audit failed',
      );
      expect((await getLease()).monthlyRent).toBe('1000.00');
      expect((await getAmendment(amendment.id)).applicationStatus).toBe(
        'legacy_review',
      );
      expect(
        await db.query(
          'SELECT execution_key FROM domain_operation_receipts WHERE company_id=$1 AND execution_key=$2',
          [companyId, dto.idempotencyKey],
        ),
      ).toHaveLength(0);
    } finally {
      await db.query(
        'DROP TRIGGER test_amendment_review_failure ON lease_amendment_reviews',
      );
      await db.query('DROP FUNCTION test_amendment_review_failure()');
    }
    expect(
      (await service.review(amendment.id, dto, actor)).amendment
        .applicationStatus,
    ).toBe('applied');
  });
  it('protects HTTP review/history by role, company and UUID and keeps audit immutable', async () => {
    const amendment = await create();
    const dto = await reviewRequest(amendment.id);
    await request(app.getHttpServer())
      .post(`/amendments/${amendment.id}/reviews`)
      .auth(foreignToken, { type: 'bearer' })
      .send(dto)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/amendments/${amendment.id}/reviews`)
      .auth(tenantToken, { type: 'bearer' })
      .send(dto)
      .expect(403);
    await request(app.getHttpServer())
      .post('/amendments/not-a-uuid/reviews')
      .auth(token, { type: 'bearer' })
      .send(dto)
      .expect(400);
    await expect(
      service.review(amendment.id, dto, { ...actor, role: UserRole.OWNER }),
    ).rejects.toThrow('Administrative review');
    const result = (
      await request(app.getHttpServer())
        .post(`/amendments/${amendment.id}/reviews`)
        .auth(token, { type: 'bearer' })
        .send(dto)
        .expect(201)
    ).body;
    expect(
      (
        await request(app.getHttpServer())
          .get(`/amendments/${amendment.id}/reviews`)
          .auth(token, { type: 'bearer' })
          .expect(200)
      ).body,
    ).toHaveLength(1);
    await request(app.getHttpServer())
      .get(`/amendments/${amendment.id}/reviews`)
      .auth(foreignToken, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .get(`/amendments/${amendment.id}/reviews`)
      .auth(tenantToken, { type: 'bearer' })
      .expect(403);
    await expect(
      db.query(
        "UPDATE lease_amendment_reviews SET reason='Overwritten audit explanation' WHERE id=$1",
        [result.review.id],
      ),
    ).rejects.toThrow('cannot be overwritten');
  });
  it.each([
    'post_amendments',
    'patch_amendment_submit',
    'patch_amendment_approve',
    'patch_amendment_reject',
    'post_amendment_review',
  ])(
    'recovers a lost approved %s result through the real action inbox',
    async (toolName) => {
      let payload: Record<string, unknown>;
      if (toolName === 'post_amendments')
        payload = {
          leaseId,
          companyId,
          effectiveDate: today,
          changeType: Change.RENT_INCREASE,
          description: 'Inbox amendment',
          newValues: { monthlyRent: 1200 },
        };
      else if (toolName === 'post_amendment_review') {
        const amendment = await create();
        const { idempotencyKey: _key, ...dto } = await reviewRequest(
          amendment.id,
        );
        payload = { id: amendment.id, ...dto };
      } else {
        const amendment = await create();
        if (toolName !== 'patch_amendment_submit')
          await service.submit(amendment.id, actor);
        payload = { id: amendment.id };
      }
      const sort = (value: any): any =>
        Array.isArray(value)
          ? value.map(sort)
          : value && typeof value === 'object'
            ? Object.fromEntries(
                Object.entries(value)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([key, item]) => [key, sort(item)]),
              )
            : value;
      const [action] = await db.query(
        `INSERT INTO pending_actions(company_id,requested_by,tool_name,action_type,entity_type,summary,payload,payload_hash,expires_at) VALUES($1,$2,$3,'update','lease','Amendment recovery',$4::jsonb,$5,now()+interval '15 minutes') RETURNING id,execution_key`,
        [
          companyId,
          requesterId,
          toolName,
          JSON.stringify(payload),
          createHash('sha256')
            .update(JSON.stringify(sort(payload)))
            .digest('hex'),
        ],
      );
      const reauthToken = (
        await request(app.getHttpServer())
          .post('/auth/reauthenticate')
          .auth(token, { type: 'bearer' })
          .send({ password: 'AmendmentsTest123!' })
          .expect(200)
      ).body.reauthToken;
      const executor = app.get(AiToolExecutorService),
        original = executor.executeApproved.bind(executor);
      const lost = jest
        .spyOn(executor, 'executeApproved')
        .mockImplementationOnce(async (...args) => {
          await original(...args);
          throw new Error('Committed amendment response lost');
        });
      const decide = () =>
        request(app.getHttpServer())
          .post(`/pending-actions/${action.id}/approve`)
          .auth(token, { type: 'bearer' })
          .send({ reauthToken });
      try {
        expect((await decide().expect(201)).body.status).toBe('failed');
        lost.mockRestore();
        const [receipt] = await db.query(
          'SELECT result FROM domain_operation_receipts WHERE company_id=$1 AND execution_key=$2',
          [companyId, action.execution_key],
        );
        const before = await db.query(
          'SELECT * FROM lease_amendments WHERE lease_id=$1 ORDER BY id',
          [leaseId],
        );
        const recovered = (await decide().expect(201)).body;
        expect(recovered.status).toBe('executed');
        expect(recovered.result).toEqual(receipt.result);
        const context = {
          companyId,
          userId: actor.id,
          role: UserRole.ADMIN,
          idempotencyKey: action.execution_key,
        };
        expect(
          await Promise.all([
            executor.executeApproved(toolName, payload, context),
            executor.executeApproved(toolName, payload, context),
          ]),
        ).toEqual([receipt.result, receipt.result]);
        expect(
          await db.query(
            'SELECT * FROM lease_amendments WHERE lease_id=$1 ORDER BY id',
            [leaseId],
          ),
        ).toEqual(before);
        expect(JSON.stringify(recovered.result)).not.toMatch(
          /passwordHash|passwordResetToken/,
        );
      } finally {
        lost.mockRestore();
      }
    },
  );
  it('scopes HTTP review to the company and protects the scheduler endpoint', async () => {
    const amendment = await create();
    await request(app.getHttpServer())
      .patch(`/amendments/${amendment.id}/submit`)
      .set('Authorization', `Bearer ${foreignToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/amendments/${amendment.id}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .post('/leases/internal/process-amendments')
      .expect(401);
    await request(app.getHttpServer())
      .post('/leases/internal/process-amendments')
      .set('x-batch-communications-token', 'amendments-test')
      .expect(201);
  });
});
